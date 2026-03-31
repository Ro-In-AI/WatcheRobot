use crate::modules::openclaw::shared::config_store;
use base64::{engine::general_purpose::STANDARD, engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signer, SigningKey};
use futures_util::{SinkExt, Stream, StreamExt};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot, Mutex, RwLock};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, Message},
};
use uuid::Uuid;

const GATEWAY_PORT: u16 = 18_789;
const GATEWAY_TIMEOUT_MS: u64 = 10_000;
const CHAT_SEND_TIMEOUT_MS: u64 = 120_000;
const CONNECT_TIMEOUT_MS: u64 = 10_000;
const STREAM_EVENT: &str = "openclaw-chat-stream";
const STATUS_EVENT: &str = "openclaw-chat-status";
const WATCHER_STATE_DIR: &str = "watcher-desktop";
const DEVICE_IDENTITY_FILE: &str = "device.json";
const CONTROL_UI_CLIENT_ID: &str = "openclaw-control-ui";
const WEBCHAT_MODE: &str = "webchat";
const OPERATOR_ROLE: &str = "operator";
const DEVICE_AUTH_VERSION: &str = "v3";
const CONTROL_UI_SCOPES: &[&str] = &["operator.admin", "operator.approvals", "operator.pairing"];
const ED25519_SPKI_PREFIX: &[u8] = &[
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
];
const ED25519_PKCS8_PREFIX: &[u8] = &[
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
];

#[derive(Clone, Debug, PartialEq, Eq)]
enum GatewayRealtimeStatusKind {
    Connecting,
    Connected,
    Disconnected,
    Error,
}

impl GatewayRealtimeStatusKind {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Connecting => "connecting",
            Self::Connected => "connected",
            Self::Disconnected => "disconnected",
            Self::Error => "error",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawChatGatewayStatus {
    pub status: String,
    pub summary: String,
}

impl OpenClawChatGatewayStatus {
    fn new(status: GatewayRealtimeStatusKind, summary: impl Into<String>) -> Self {
        Self {
            status: status.as_str().to_string(),
            summary: summary.into(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawChatStreamEvent {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
}

#[derive(Default)]
pub struct OpenClawChatState {
    connection: Mutex<Option<GatewayConnection>>,
}

#[derive(Clone)]
struct GatewayConnection {
    sender: mpsc::UnboundedSender<Message>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>,
    run_sessions: Arc<Mutex<HashMap<String, String>>>,
    status: Arc<RwLock<GatewayRealtimeStatusKind>>,
}

impl GatewayConnection {
    async fn connect(app: AppHandle) -> Result<Self, String> {
        let status = Arc::new(RwLock::new(GatewayRealtimeStatusKind::Connecting));
        emit_status(
            &app,
            OpenClawChatGatewayStatus::new(
                GatewayRealtimeStatusKind::Connecting,
                "正在建立 Gateway 实时连接",
            ),
        );

        let info = resolve_gateway_connection_info()?;
        let mut request = info
            .ws_url
            .as_str()
            .into_client_request()
            .map_err(|error| format!("Failed to build Gateway request: {}", error))?;
        request.headers_mut().insert(
            "Origin",
            HeaderValue::from_str(&info.origin)
                .map_err(|error| format!("Invalid Gateway origin header: {}", error))?,
        );

        let (ws_stream, _) = tokio::time::timeout(
            Duration::from_millis(CONNECT_TIMEOUT_MS),
            connect_async(request),
        )
        .await
        .map_err(|_| "Gateway WebSocket connect timed out.".to_string())?
        .map_err(|error| format!("Failed to connect to Gateway WebSocket: {}", error))?;

        let (mut writer, mut reader) = ws_stream.split();
        let nonce = wait_for_connect_challenge(&mut reader).await?;
        let connect_id = Uuid::new_v4().to_string();
        let connect_frame = build_connect_frame(&connect_id, info.token.as_deref(), &nonce)?;

        writer
            .send(Message::Text(connect_frame.to_string().into()))
            .await
            .map_err(|error| format!("Failed to send Gateway connect frame: {}", error))?;

        wait_for_hello_ok(&mut reader, &connect_id).await?;

        let (sender, mut outbound_rx) = mpsc::unbounded_channel::<Message>();
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let run_sessions = Arc::new(Mutex::new(HashMap::new()));

        {
            let mut guard = status.write().await;
            *guard = GatewayRealtimeStatusKind::Connected;
        }
        emit_status(
            &app,
            OpenClawChatGatewayStatus::new(GatewayRealtimeStatusKind::Connected, "实时连接已建立"),
        );

        let writer_app = app.clone();
        let writer_status = status.clone();
        tokio::spawn(async move {
            while let Some(message) = outbound_rx.recv().await {
                if writer.send(message).await.is_err() {
                    break;
                }
            }

            let _ = writer.close().await;
            let mut guard = writer_status.write().await;
            if *guard == GatewayRealtimeStatusKind::Connected {
                *guard = GatewayRealtimeStatusKind::Disconnected;
                emit_status(
                    &writer_app,
                    OpenClawChatGatewayStatus::new(
                        GatewayRealtimeStatusKind::Disconnected,
                        "Gateway 实时连接已关闭",
                    ),
                );
            }
        });

        let reader_app = app.clone();
        let reader_pending = pending.clone();
        let reader_run_sessions = run_sessions.clone();
        let reader_status = status.clone();
        tokio::spawn(async move {
            let disconnect_reason = loop {
                match reader.next().await {
                    Some(Ok(message)) => {
                        let Some(raw) = message_to_text(message) else {
                            continue;
                        };

                        if let Err(error) = handle_incoming_frame(
                            &reader_app,
                            &reader_pending,
                            &reader_run_sessions,
                            &raw,
                        )
                        .await
                        {
                            break error;
                        }
                    }
                    Some(Err(error)) => break format!("Gateway 实时连接已断开: {}", error),
                    None => break "Gateway 实时连接已断开".to_string(),
                }
            };

            reject_all_pending(&reader_pending, &disconnect_reason).await;
            reader_run_sessions.lock().await.clear();

            let next_status = if disconnect_reason.contains("error") {
                GatewayRealtimeStatusKind::Error
            } else {
                GatewayRealtimeStatusKind::Disconnected
            };

            {
                let mut guard = reader_status.write().await;
                *guard = next_status.clone();
            }

            emit_status(
                &reader_app,
                OpenClawChatGatewayStatus::new(next_status, disconnect_reason),
            );
        });

        Ok(Self {
            sender,
            pending,
            run_sessions,
            status,
        })
    }

    fn close(&self) {
        let _ = self.sender.send(Message::Close(None));
    }

    async fn is_connected(&self) -> bool {
        *self.status.read().await == GatewayRealtimeStatusKind::Connected
    }

    async fn request(&self, method: &str, params: Value, timeout_ms: u64) -> Result<Value, String> {
        if !self.is_connected().await {
            return Err("Gateway 实时连接尚未就绪。".to_string());
        }

        let request_id = Uuid::new_v4().to_string();
        let payload = json!({
            "type": "req",
            "id": request_id,
            "method": method,
            "params": params,
        });

        let (tx, rx) = oneshot::channel::<Result<Value, String>>();
        self.pending.lock().await.insert(request_id.clone(), tx);

        if self
            .sender
            .send(Message::Text(payload.to_string().into()))
            .is_err()
        {
            self.pending.lock().await.remove(&request_id);
            return Err("Gateway 实时连接发送失败。".to_string());
        }

        match tokio::time::timeout(Duration::from_millis(timeout_ms), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(format!("Gateway 请求已取消: {}", method)),
            Err(_) => {
                self.pending.lock().await.remove(&request_id);
                Err(format!("Gateway 请求超时: {}", method))
            }
        }
    }

    async fn remember_run(&self, run_id: &str, session_key: &str) {
        self.run_sessions
            .lock()
            .await
            .insert(run_id.to_string(), session_key.to_string());
    }
}

struct GatewayConnectionInfo {
    ws_url: String,
    origin: String,
    token: Option<String>,
}

#[derive(Clone)]
struct DeviceIdentity {
    device_id: String,
    public_key_raw: [u8; 32],
    private_key_seed: [u8; 32],
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredDeviceIdentity {
    version: u8,
    device_id: String,
    public_key_pem: String,
    private_key_pem: String,
    created_at_ms: u64,
}

fn current_time_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn resolve_openclaw_state_dir() -> PathBuf {
    std::env::var_os("OPENCLAW_STATE_DIR")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(config_store::get_openclaw_dir)
}

fn resolve_device_identity_path() -> PathBuf {
    resolve_openclaw_state_dir()
        .join(WATCHER_STATE_DIR)
        .join("identity")
        .join(DEVICE_IDENTITY_FILE)
}

fn encode_base64_url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn wrap_pem_body(body: &str) -> String {
    let mut wrapped = String::new();
    let mut start = 0;
    while start < body.len() {
        let end = (start + 64).min(body.len());
        wrapped.push_str(&body[start..end]);
        wrapped.push('\n');
        start = end;
    }
    wrapped
}

fn encode_pem(label: &str, der: &[u8]) -> String {
    let body = STANDARD.encode(der);
    format!(
        "-----BEGIN {}-----\n{}-----END {}-----\n",
        label,
        wrap_pem_body(&body),
        label
    )
}

fn decode_pem(pem: &str) -> Result<Vec<u8>, String> {
    let body = pem
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("-----"))
        .collect::<String>();

    if body.is_empty() {
        return Err("Device identity PEM content is empty.".to_string());
    }

    STANDARD
        .decode(body.as_bytes())
        .map_err(|error| format!("Failed to decode device identity PEM: {}", error))
}

fn derive_device_identity_from_seed(private_key_seed: [u8; 32]) -> DeviceIdentity {
    let signing_key = SigningKey::from_bytes(&private_key_seed);
    let public_key_raw = signing_key.verifying_key().to_bytes();
    let device_id = sha256_hex(&public_key_raw);

    DeviceIdentity {
        device_id,
        public_key_raw,
        private_key_seed,
    }
}

fn parse_public_key_pem(public_key_pem: &str) -> Result<[u8; 32], String> {
    let der = decode_pem(public_key_pem)?;
    if der.len() != ED25519_SPKI_PREFIX.len() + 32 || !der.starts_with(ED25519_SPKI_PREFIX) {
        return Err("Unsupported Ed25519 public key format in device identity.".to_string());
    }

    let mut raw = [0_u8; 32];
    raw.copy_from_slice(&der[ED25519_SPKI_PREFIX.len()..]);
    Ok(raw)
}

fn parse_private_key_pem(private_key_pem: &str) -> Result<[u8; 32], String> {
    let der = decode_pem(private_key_pem)?;
    if der.len() != ED25519_PKCS8_PREFIX.len() + 32 || !der.starts_with(ED25519_PKCS8_PREFIX) {
        return Err("Unsupported Ed25519 private key format in device identity.".to_string());
    }

    let mut raw = [0_u8; 32];
    raw.copy_from_slice(&der[ED25519_PKCS8_PREFIX.len()..]);
    Ok(raw)
}

fn stored_device_identity_from_runtime(identity: &DeviceIdentity) -> StoredDeviceIdentity {
    let mut public_key_der = Vec::with_capacity(ED25519_SPKI_PREFIX.len() + 32);
    public_key_der.extend_from_slice(ED25519_SPKI_PREFIX);
    public_key_der.extend_from_slice(&identity.public_key_raw);

    let mut private_key_der = Vec::with_capacity(ED25519_PKCS8_PREFIX.len() + 32);
    private_key_der.extend_from_slice(ED25519_PKCS8_PREFIX);
    private_key_der.extend_from_slice(&identity.private_key_seed);

    StoredDeviceIdentity {
        version: 1,
        device_id: identity.device_id.clone(),
        public_key_pem: encode_pem("PUBLIC KEY", &public_key_der),
        private_key_pem: encode_pem("PRIVATE KEY", &private_key_der),
        created_at_ms: current_time_millis(),
    }
}

#[cfg(unix)]
fn apply_owner_only_permissions(file_path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let _ = fs::set_permissions(file_path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn apply_owner_only_permissions(_file_path: &Path) {}

fn write_device_identity_file(
    file_path: &Path,
    stored_identity: &StoredDeviceIdentity,
) -> Result<(), String> {
    let parent = file_path
        .parent()
        .ok_or_else(|| "Device identity path is missing a parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create device identity directory: {}", error))?;

    let content = serde_json::to_string_pretty(stored_identity)
        .map(|value| format!("{}\n", value))
        .map_err(|error| format!("Failed to serialize device identity: {}", error))?;
    fs::write(file_path, content)
        .map_err(|error| format!("Failed to write device identity file: {}", error))?;
    apply_owner_only_permissions(file_path);
    Ok(())
}

fn generate_device_identity() -> DeviceIdentity {
    let signing_key = SigningKey::generate(&mut OsRng);
    derive_device_identity_from_seed(signing_key.to_bytes())
}

fn generate_and_store_device_identity(file_path: &Path) -> Result<DeviceIdentity, String> {
    let identity = generate_device_identity();
    let stored_identity = stored_device_identity_from_runtime(&identity);
    write_device_identity_file(file_path, &stored_identity)?;
    Ok(identity)
}

fn load_or_create_device_identity() -> Result<DeviceIdentity, String> {
    let file_path = resolve_device_identity_path();

    if file_path.exists() {
        if let Ok(raw) = fs::read_to_string(&file_path) {
            if let Ok(stored) = serde_json::from_str::<StoredDeviceIdentity>(&raw) {
                if stored.version == 1 {
                    if let Ok(private_key_seed) = parse_private_key_pem(&stored.private_key_pem) {
                        let derived_identity = derive_device_identity_from_seed(private_key_seed);
                        if let Ok(stored_public_key) = parse_public_key_pem(&stored.public_key_pem)
                        {
                            if stored_public_key == derived_identity.public_key_raw {
                                if stored.device_id != derived_identity.device_id {
                                    let mut updated = stored;
                                    updated.device_id = derived_identity.device_id.clone();
                                    write_device_identity_file(&file_path, &updated)?;
                                }
                                return Ok(derived_identity);
                            }
                        }
                    }
                }
            }
        }
    }

    generate_and_store_device_identity(&file_path)
}

fn normalize_device_metadata(value: Option<&str>) -> String {
    value.unwrap_or_default().trim().to_ascii_lowercase()
}

fn build_device_auth_payload_v3(
    device_id: &str,
    client_id: &str,
    client_mode: &str,
    role: &str,
    scopes: &[&str],
    signed_at_ms: u64,
    token: Option<&str>,
    nonce: &str,
    platform: &str,
    device_family: Option<&str>,
) -> String {
    let scopes_csv = scopes.join(",");
    let normalized_token = token.unwrap_or_default();
    let normalized_platform = normalize_device_metadata(Some(platform));
    let normalized_device_family = normalize_device_metadata(device_family);

    [
        DEVICE_AUTH_VERSION.to_string(),
        device_id.to_string(),
        client_id.to_string(),
        client_mode.to_string(),
        role.to_string(),
        scopes_csv,
        signed_at_ms.to_string(),
        normalized_token.to_string(),
        nonce.to_string(),
        normalized_platform,
        normalized_device_family,
    ]
    .join("|")
}

fn openclaw_command_candidates() -> Vec<&'static str> {
    let mut candidates = vec!["openclaw"];

    if cfg!(target_os = "windows") {
        candidates.extend(["openclaw.cmd", "openclaw.exe", "openclaw.bat"]);
    } else {
        candidates.extend(["/opt/homebrew/bin/openclaw", "/usr/local/bin/openclaw"]);
    }

    candidates
}

fn shorten(text: &str) -> String {
    const LIMIT: usize = 600;
    let trimmed = text.trim();
    if trimmed.len() <= LIMIT {
        trimmed.to_string()
    } else {
        format!("{}...", &trimmed[..LIMIT])
    }
}

fn format_failure(args: &[String], output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr_short = shorten(&stderr);
    let stdout_short = shorten(&stdout);

    if !stderr_short.is_empty() {
        format!(
            "OpenClaw command failed ({}): {}",
            args.join(" "),
            stderr_short
        )
    } else if !stdout_short.is_empty() {
        format!(
            "OpenClaw command failed ({}): {}",
            args.join(" "),
            stdout_short
        )
    } else {
        format!(
            "OpenClaw command failed ({}), exit code: {:?}",
            args.join(" "),
            output.status.code()
        )
    }
}

fn run_openclaw(args: &[String]) -> Result<Output, String> {
    let mut not_found = Vec::new();

    for candidate in openclaw_command_candidates() {
        match Command::new(candidate).args(args).output() {
            Ok(output) => return Ok(output),
            Err(error) if error.kind() == ErrorKind::NotFound => {
                not_found.push(candidate.to_string());
            }
            Err(error) => {
                return Err(format!("Failed to run '{}': {}", candidate, error));
            }
        }
    }

    Err(format!(
        "OpenClaw executable not found. Tried: {}",
        not_found.join(", ")
    ))
}

fn parse_json_output(stdout: &str) -> Result<Value, String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err("OpenClaw returned empty JSON output.".to_string());
    }

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Ok(value);
    }

    for (index, ch) in trimmed.char_indices() {
        if ch != '{' && ch != '[' {
            continue;
        }

        if let Ok(value) = serde_json::from_str::<Value>(&trimmed[index..]) {
            return Ok(value);
        }
    }

    Err(format!(
        "Failed to parse OpenClaw JSON output: {}",
        shorten(trimmed)
    ))
}

fn run_openclaw_json(mut args: Vec<String>) -> Result<Value, String> {
    let mut full_args = vec![
        "--log-level".to_string(),
        "silent".to_string(),
        "--no-color".to_string(),
    ];
    full_args.append(&mut args);

    let output = run_openclaw(&full_args)?;
    if !output.status.success() {
        return Err(format_failure(&full_args, &output));
    }

    parse_json_output(&String::from_utf8_lossy(&output.stdout))
}

fn run_openclaw_text(mut args: Vec<String>) -> Result<String, String> {
    let mut full_args = vec![
        "--log-level".to_string(),
        "silent".to_string(),
        "--no-color".to_string(),
    ];
    full_args.append(&mut args);

    let output = run_openclaw(&full_args)?;
    if !output.status.success() {
        return Err(format_failure(&full_args, &output));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return Ok(stdout);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return Ok(stderr);
    }

    Ok("ok".to_string())
}

fn generate_idempotency_key() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    format!("watcher-desktop-{}-{}", millis, std::process::id())
}

fn resolve_gateway_host() -> String {
    "127.0.0.1".to_string()
}

fn resolve_gateway_port(config: &Value) -> u16 {
    config
        .pointer("/gateway/port")
        .and_then(Value::as_u64)
        .and_then(|port| u16::try_from(port).ok())
        .unwrap_or(GATEWAY_PORT)
}

fn resolve_config_gateway_token(config: &Value) -> Option<String> {
    std::env::var("OPENCLAW_GATEWAY_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            config
                .pointer("/gateway/auth/token")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

fn resolve_dashboard_token() -> Option<String> {
    let stdout = run_openclaw_text(vec!["dashboard".to_string(), "--no-open".to_string()]).ok()?;

    stdout
        .lines()
        .find_map(|line| line.split("#token=").nth(1))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn resolve_gateway_connection_info() -> Result<GatewayConnectionInfo, String> {
    let config = config_store::get_openclaw_config()?;
    let host = resolve_gateway_host();
    let port = resolve_gateway_port(&config);
    let token = resolve_config_gateway_token(&config).or_else(resolve_dashboard_token);
    let ws_url = format!("ws://{}:{}", host, port);
    let origin = format!("http://{}:{}", host, port);

    Ok(GatewayConnectionInfo {
        ws_url,
        origin,
        token,
    })
}

fn build_connect_frame(
    connect_id: &str,
    token: Option<&str>,
    nonce: &str,
) -> Result<Value, String> {
    let device_identity = load_or_create_device_identity()?;
    let platform = std::env::consts::OS;
    let signed_at_ms = current_time_millis();
    let signature_token = token.map(str::trim).filter(|value| !value.is_empty());
    let signature_payload = build_device_auth_payload_v3(
        &device_identity.device_id,
        CONTROL_UI_CLIENT_ID,
        WEBCHAT_MODE,
        OPERATOR_ROLE,
        CONTROL_UI_SCOPES,
        signed_at_ms,
        signature_token,
        nonce,
        platform,
        None,
    );
    let signature = SigningKey::from_bytes(&device_identity.private_key_seed)
        .sign(signature_payload.as_bytes())
        .to_bytes();
    let mut params = Map::new();
    params.insert("minProtocol".to_string(), Value::Number(3.into()));
    params.insert("maxProtocol".to_string(), Value::Number(3.into()));
    params.insert(
        "client".to_string(),
        json!({
            "id": CONTROL_UI_CLIENT_ID,
            "version": env!("CARGO_PKG_VERSION"),
            "platform": platform,
            "mode": WEBCHAT_MODE,
        }),
    );
    params.insert("role".to_string(), Value::String(OPERATOR_ROLE.to_string()));
    params.insert(
        "scopes".to_string(),
        Value::Array(
            CONTROL_UI_SCOPES
                .iter()
                .map(|scope| Value::String((*scope).to_string()))
                .collect(),
        ),
    );
    params.insert(
        "caps".to_string(),
        Value::Array(vec![Value::String("tool-events".to_string())]),
    );
    params.insert("locale".to_string(), Value::String("zh-CN".to_string()));
    params.insert(
        "userAgent".to_string(),
        Value::String(format!(
            "Watcher Desktop/{} (Tauri)",
            env!("CARGO_PKG_VERSION")
        )),
    );
    params.insert(
        "device".to_string(),
        json!({
            "id": device_identity.device_id,
            "publicKey": encode_base64_url(&device_identity.public_key_raw),
            "signature": encode_base64_url(&signature),
            "signedAt": signed_at_ms,
            "nonce": nonce,
        }),
    );

    if let Some(value) = signature_token {
        params.insert(
            "auth".to_string(),
            json!({
                "token": value,
            }),
        );
    }

    Ok(json!({
        "type": "req",
        "id": connect_id,
        "method": "connect",
        "params": params,
    }))
}

fn message_to_text(message: Message) -> Option<String> {
    match message {
        Message::Text(text) => Some(text.to_string()),
        Message::Binary(bytes) => String::from_utf8(bytes.to_vec()).ok(),
        _ => None,
    }
}

async fn wait_for_connect_challenge<Reader>(reader: &mut Reader) -> Result<String, String>
where
    Reader: Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    loop {
        let next_message =
            tokio::time::timeout(Duration::from_millis(CONNECT_TIMEOUT_MS), reader.next())
                .await
                .map_err(|_| "Gateway connect challenge timed out.".to_string())?;

        let Some(message) = next_message else {
            return Err("Gateway closed before connect challenge.".to_string());
        };

        let message =
            message.map_err(|error| format!("Gateway challenge read failed: {}", error))?;
        let Some(raw) = message_to_text(message) else {
            continue;
        };
        let frame: Value = serde_json::from_str(&raw)
            .map_err(|error| format!("Failed to parse Gateway challenge frame: {}", error))?;

        if frame.get("type").and_then(Value::as_str) == Some("event")
            && frame.get("event").and_then(Value::as_str) == Some("connect.challenge")
        {
            let nonce = frame
                .pointer("/payload/nonce")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "Gateway connect challenge missing nonce.".to_string())?;

            return Ok(nonce.to_string());
        }
    }
}

async fn wait_for_hello_ok<Reader>(reader: &mut Reader, connect_id: &str) -> Result<(), String>
where
    Reader: Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    loop {
        let next_message =
            tokio::time::timeout(Duration::from_millis(CONNECT_TIMEOUT_MS), reader.next())
                .await
                .map_err(|_| "Gateway connect response timed out.".to_string())?;

        let Some(message) = next_message else {
            return Err("Gateway closed before hello-ok.".to_string());
        };

        let message = message.map_err(|error| format!("Gateway connect read failed: {}", error))?;
        let Some(raw) = message_to_text(message) else {
            continue;
        };
        let frame: Value = serde_json::from_str(&raw)
            .map_err(|error| format!("Failed to parse Gateway connect frame: {}", error))?;

        if frame.get("type").and_then(Value::as_str) != Some("res") {
            continue;
        }

        if frame.get("id").and_then(Value::as_str) != Some(connect_id) {
            continue;
        }

        if frame.get("ok").and_then(Value::as_bool) != Some(true) {
            let message = frame
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("Gateway connect failed");
            return Err(message.to_string());
        }

        let hello_type = frame.pointer("/payload/type").and_then(Value::as_str);
        if hello_type == Some("hello-ok") {
            return Ok(());
        }

        return Err("Gateway connect did not return hello-ok.".to_string());
    }
}

fn emit_status(app: &AppHandle, payload: OpenClawChatGatewayStatus) {
    let _ = app.emit(STATUS_EVENT, payload);
}

async fn reject_all_pending(
    pending: &Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>,
    error: &str,
) {
    let mut guard = pending.lock().await;
    let senders = std::mem::take(&mut *guard);
    drop(guard);

    for sender in senders.into_values() {
        let _ = sender.send(Err(error.to_string()));
    }
}

async fn handle_incoming_frame(
    app: &AppHandle,
    pending: &Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>,
    run_sessions: &Arc<Mutex<HashMap<String, String>>>,
    raw: &str,
) -> Result<(), String> {
    let frame: Value = serde_json::from_str(raw)
        .map_err(|error| format!("Failed to parse Gateway frame: {}", error))?;

    match frame.get("type").and_then(Value::as_str) {
        Some("res") => handle_response_frame(pending, &frame).await,
        Some("event") => handle_event_frame(app, run_sessions, &frame).await,
        _ => Ok(()),
    }
}

async fn handle_response_frame(
    pending: &Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>,
    frame: &Value,
) -> Result<(), String> {
    let Some(request_id) = frame.get("id").and_then(Value::as_str) else {
        return Ok(());
    };

    let sender = pending.lock().await.remove(request_id);
    let Some(sender) = sender else {
        return Ok(());
    };

    let result = if frame.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(frame.get("payload").cloned().unwrap_or(Value::Null))
    } else {
        Err(frame
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("Gateway request failed")
            .to_string())
    };

    let _ = sender.send(result);
    Ok(())
}

async fn handle_event_frame(
    app: &AppHandle,
    run_sessions: &Arc<Mutex<HashMap<String, String>>>,
    frame: &Value,
) -> Result<(), String> {
    let event_name = frame.get("event").and_then(Value::as_str).unwrap_or("");
    let payload = frame.get("payload").cloned().unwrap_or(Value::Null);

    let events = match event_name {
        "agent" => normalize_agent_events(&payload, run_sessions).await,
        "chat" => normalize_chat_events(&payload, run_sessions).await,
        "shutdown" => {
            emit_status(
                app,
                OpenClawChatGatewayStatus::new(
                    GatewayRealtimeStatusKind::Disconnected,
                    "Gateway 已关闭",
                ),
            );
            Vec::new()
        }
        _ => Vec::new(),
    };

    for event in events {
        let _ = app.emit(STREAM_EVENT, event);
    }

    Ok(())
}

fn value_as_non_empty_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

async fn resolve_session_key(
    payload: &Value,
    run_id: Option<&str>,
    run_sessions: &Arc<Mutex<HashMap<String, String>>>,
) -> Option<String> {
    if let Some(session_key) = value_as_non_empty_string(payload.get("sessionKey"))
        .or_else(|| value_as_non_empty_string(payload.get("to")))
    {
        return Some(session_key);
    }

    let run_id = run_id?;
    run_sessions.lock().await.get(run_id).cloned()
}

fn make_stream_event(
    kind: &str,
    run_id: Option<String>,
    session_key: Option<String>,
    delta: Option<String>,
    phase: Option<String>,
) -> OpenClawChatStreamEvent {
    OpenClawChatStreamEvent {
        kind: kind.to_string(),
        run_id,
        session_key,
        delta,
        phase,
    }
}

async fn normalize_agent_events(
    payload: &Value,
    run_sessions: &Arc<Mutex<HashMap<String, String>>>,
) -> Vec<OpenClawChatStreamEvent> {
    let run_id = value_as_non_empty_string(payload.get("runId"));
    let stream = payload
        .get("stream")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if run_id.is_none() || stream.is_empty() {
        return Vec::new();
    }

    let session_key = resolve_session_key(payload, run_id.as_deref(), run_sessions).await;
    let data = payload.get("data").unwrap_or(&Value::Null);

    match stream {
        "assistant" => {
            if let Some(parts) = data
                .get("content")
                .and_then(Value::as_array)
                .or_else(|| data.get("blocks").and_then(Value::as_array))
            {
                let mut events = Vec::new();
                for part in parts {
                    let part_type = part.get("type").and_then(Value::as_str).unwrap_or("");
                    if part_type == "text" {
                        if let Some(text) = value_as_non_empty_string(part.get("text")) {
                            events.push(make_stream_event(
                                "text",
                                run_id.clone(),
                                session_key.clone(),
                                Some(text),
                                None,
                            ));
                        }
                    }
                    if part_type == "thinking" {
                        if let Some(thinking) = value_as_non_empty_string(part.get("thinking")) {
                            events.push(make_stream_event(
                                "thinking",
                                run_id.clone(),
                                session_key.clone(),
                                Some(thinking),
                                None,
                            ));
                        }
                    }
                }
                if !events.is_empty() {
                    return events;
                }
            }

            let text = value_as_non_empty_string(data.get("text"))
                .or_else(|| value_as_non_empty_string(data.get("delta")));
            text.into_iter()
                .map(|delta| {
                    make_stream_event(
                        "text",
                        run_id.clone(),
                        session_key.clone(),
                        Some(delta),
                        None,
                    )
                })
                .collect()
        }
        "lifecycle" => {
            let phase = data
                .get("phase")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();

            match phase.as_str() {
                "queued" | "planning" | "executing" | "streaming" => vec![make_stream_event(
                    "phase",
                    run_id,
                    session_key,
                    None,
                    Some(phase),
                )],
                "end" => {
                    if let Some(run_id) = run_id.as_deref() {
                        run_sessions.lock().await.remove(run_id);
                    }
                    vec![make_stream_event("done", run_id, session_key, None, None)]
                }
                "error" => {
                    if let Some(run_id) = run_id.as_deref() {
                        run_sessions.lock().await.remove(run_id);
                    }
                    let error_text = value_as_non_empty_string(data.get("error"))
                        .unwrap_or_else(|| "Agent lifecycle error".to_string());
                    vec![make_stream_event(
                        "error",
                        run_id,
                        session_key,
                        Some(error_text),
                        None,
                    )]
                }
                _ => Vec::new(),
            }
        }
        _ => Vec::new(),
    }
}

async fn normalize_chat_events(
    payload: &Value,
    run_sessions: &Arc<Mutex<HashMap<String, String>>>,
) -> Vec<OpenClawChatStreamEvent> {
    let run_id = value_as_non_empty_string(payload.get("runId"));
    let session_key = resolve_session_key(payload, run_id.as_deref(), run_sessions).await;
    let state = payload
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();

    match state.as_str() {
        "final" => {
            if let Some(run_id) = run_id.as_deref() {
                run_sessions.lock().await.remove(run_id);
            }
            vec![make_stream_event("done", run_id, session_key, None, None)]
        }
        "error" => {
            if let Some(run_id) = run_id.as_deref() {
                run_sessions.lock().await.remove(run_id);
            }
            let error_text = value_as_non_empty_string(payload.get("errorMessage"))
                .unwrap_or_else(|| "Agent execution failed".to_string());
            vec![make_stream_event(
                "error",
                run_id,
                session_key,
                Some(error_text),
                None,
            )]
        }
        _ => Vec::new(),
    }
}

async fn reset_connection(state: &OpenClawChatState) {
    let mut guard = state.connection.lock().await;
    if let Some(connection) = guard.take() {
        connection.close();
    }
}

async fn ensure_connection(
    app: &AppHandle,
    state: &OpenClawChatState,
) -> Result<GatewayConnection, String> {
    let mut guard = state.connection.lock().await;

    if let Some(existing) = guard.clone() {
        if existing.is_connected().await {
            return Ok(existing);
        }

        existing.close();
        *guard = None;
    }

    let connection = match GatewayConnection::connect(app.clone()).await {
        Ok(connection) => connection,
        Err(error) => {
            emit_status(
                app,
                OpenClawChatGatewayStatus::new(GatewayRealtimeStatusKind::Error, error.clone()),
            );
            return Err(error);
        }
    };
    *guard = Some(connection.clone());
    Ok(connection)
}

fn is_recoverable_gateway_error(error: &str) -> bool {
    let lowered = error.to_lowercase();
    lowered.contains("not connected")
        || lowered.contains("connection")
        || lowered.contains("closed")
        || lowered.contains("timed out")
}

async fn request_gateway(
    app: &AppHandle,
    state: &OpenClawChatState,
    method: &str,
    params: Value,
    timeout_ms: u64,
) -> Result<Value, String> {
    let mut last_error = None;

    for attempt in 0..2 {
        let connection = ensure_connection(app, state).await?;
        match connection.request(method, params.clone(), timeout_ms).await {
            Ok(value) => return Ok(value),
            Err(error) => {
                last_error = Some(error.clone());
                if attempt == 0 && is_recoverable_gateway_error(&error) {
                    reset_connection(state).await;
                    continue;
                }
                return Err(error);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| format!("Gateway request failed: {}", method)))
}

pub async fn connect(
    app: &AppHandle,
    state: &OpenClawChatState,
) -> Result<OpenClawChatGatewayStatus, String> {
    let connection = ensure_connection(app, state).await?;
    let status_kind = connection.status.read().await.clone();
    Ok(OpenClawChatGatewayStatus::new(
        status_kind,
        "实时连接已建立",
    ))
}

pub async fn disconnect(
    app: &AppHandle,
    state: &OpenClawChatState,
) -> Result<OpenClawChatGatewayStatus, String> {
    reset_connection(state).await;
    let payload =
        OpenClawChatGatewayStatus::new(GatewayRealtimeStatusKind::Disconnected, "已断开实时连接");
    emit_status(app, payload.clone());
    Ok(payload)
}

pub fn gateway_health() -> Result<Value, String> {
    run_openclaw_json(vec![
        "gateway".to_string(),
        "health".to_string(),
        "--json".to_string(),
        "--timeout".to_string(),
        "3000".to_string(),
    ])
}

pub fn start_gateway() -> Result<String, String> {
    run_openclaw_text(vec!["gateway".to_string(), "start".to_string()])
}

pub async fn list_sessions(app: &AppHandle, state: &OpenClawChatState) -> Result<Value, String> {
    request_gateway(app, state, "sessions.list", json!({}), GATEWAY_TIMEOUT_MS).await
}

pub async fn get_history(
    app: &AppHandle,
    state: &OpenClawChatState,
    session_key: &str,
) -> Result<Value, String> {
    if session_key.trim().is_empty() {
        return Err("Session key cannot be empty.".to_string());
    }

    request_gateway(
        app,
        state,
        "chat.history",
        json!({
            "sessionKey": session_key.trim(),
        }),
        GATEWAY_TIMEOUT_MS,
    )
    .await
}

pub async fn send_message(
    app: &AppHandle,
    state: &OpenClawChatState,
    session_key: &str,
    message: &str,
    idempotency_key: Option<&str>,
    thinking: Option<&str>,
) -> Result<Value, String> {
    if session_key.trim().is_empty() {
        return Err("Session key cannot be empty.".to_string());
    }

    if message.trim().is_empty() {
        return Err("Message cannot be empty.".to_string());
    }

    let normalized_idempotency_key = idempotency_key
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(generate_idempotency_key);

    let mut params = Map::new();
    params.insert(
        "sessionKey".to_string(),
        Value::String(session_key.trim().to_string()),
    );
    params.insert("message".to_string(), Value::String(message.to_string()));
    params.insert(
        "idempotencyKey".to_string(),
        Value::String(normalized_idempotency_key),
    );

    if let Some(level) = thinking.map(str::trim).filter(|value| !value.is_empty()) {
        params.insert("thinking".to_string(), Value::String(level.to_string()));
    }

    let response = request_gateway(
        app,
        state,
        "chat.send",
        Value::Object(params),
        CHAT_SEND_TIMEOUT_MS,
    )
    .await?;

    if let Some(run_id) = response.get("runId").and_then(Value::as_str) {
        let connection = ensure_connection(app, state).await?;
        connection.remember_run(run_id, session_key.trim()).await;
    }

    Ok(response)
}

pub async fn abort_session(
    app: &AppHandle,
    state: &OpenClawChatState,
    session_key: &str,
) -> Result<Value, String> {
    if session_key.trim().is_empty() {
        return Err("Session key cannot be empty.".to_string());
    }

    request_gateway(
        app,
        state,
        "chat.abort",
        json!({
            "sessionKey": session_key.trim(),
        }),
        GATEWAY_TIMEOUT_MS,
    )
    .await
}

pub async fn delete_session(
    app: &AppHandle,
    state: &OpenClawChatState,
    session_key: &str,
) -> Result<Value, String> {
    if session_key.trim().is_empty() {
        return Err("Session key cannot be empty.".to_string());
    }

    request_gateway(
        app,
        state,
        "sessions.delete",
        json!({
            "key": session_key.trim(),
        }),
        GATEWAY_TIMEOUT_MS,
    )
    .await
}
