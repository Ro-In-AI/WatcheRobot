//! OpenClaw 配置文件读写模块
//!
//! 处理 `~/.openclaw/openclaw.json` 配置文件的读写操作（JSON5 格式）

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const OPENCLAW_TOOLS_PROFILES: &[&str] = &["minimal", "coding", "messaging", "full"];

// ============================================================================
// Path Functions
// ============================================================================

/// 获取 OpenClaw 配置目录 (~/.openclaw/)
pub fn get_openclaw_dir() -> PathBuf {
    std::env::var_os("OPENCLAW_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".openclaw")))
        .unwrap_or_else(|| PathBuf::from(".openclaw"))
}

pub fn default_openclaw_workspace() -> PathBuf {
    get_openclaw_dir().join("workspace")
}

pub fn recommended_max_concurrent() -> u32 {
    let parallelism = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4);

    let baseline = if cfg!(target_os = "windows") { 4 } else { 3 };
    let clamped = parallelism.max(2).min(8) as u32;
    clamped.max(baseline)
}

/// 获取 OpenClaw 配置文件路径 (~/.openclaw/openclaw.json)
pub fn get_openclaw_config_path() -> PathBuf {
    get_openclaw_dir().join("openclaw.json")
}

/// 获取 agents models.json 配置文件路径 (~/.openclaw/agents/main/agent/models.json)
pub fn get_agents_models_path() -> PathBuf {
    get_openclaw_dir()
        .join("agents")
        .join("main")
        .join("agent")
        .join("models.json")
}

/// 临时测试输出目录（用于测试写入逻辑）
fn get_test_output_path(filename: &str) -> Option<PathBuf> {
    // 检查是否启用了测试模式（通过环境变量）
    if std::env::var("OPENCLAW_TEST_MODE").is_ok() {
        // 使用当前工作目录作为基准路径
        Some(
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("template")
                .join("output_test")
                .join(filename),
        )
    } else {
        None
    }
}

fn default_agent_workspace_path(agent_id: &str) -> PathBuf {
    let base = get_openclaw_dir();
    if agent_id == "main" {
        base.join("workspace")
    } else {
        base.join(format!("workspace-{}", agent_id))
    }
}

fn default_agent_dir_path(agent_id: &str) -> PathBuf {
    get_openclaw_dir()
        .join("agents")
        .join(agent_id)
        .join("agent")
}

fn get_agent_auth_profiles_path(agent: &Value) -> PathBuf {
    let agent_dir = agent
        .get("agentDir")
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .or_else(|| {
            agent
                .get("id")
                .and_then(Value::as_str)
                .map(default_agent_dir_path)
        })
        .unwrap_or_else(|| default_agent_dir_path("main"));

    agent_dir.join("auth-profiles.json")
}

fn get_agent_workspace_path(agent: &Value) -> PathBuf {
    agent
        .get("workspace")
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .or_else(|| {
            agent
                .get("id")
                .and_then(Value::as_str)
                .map(default_agent_workspace_path)
        })
        .unwrap_or_else(|| default_agent_workspace_path("main"))
}

fn allowed_workspace_doc(file_name: &str) -> bool {
    matches!(
        file_name,
        "SOUL.md" | "IDENTITY.md" | "AGENTS.md" | "TOOLS.md" | "USER.md"
    )
}

fn resolve_agent_display_name(agent: &Value) -> String {
    agent
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| agent.get("id").and_then(Value::as_str))
        .unwrap_or("agent")
        .to_string()
}

fn is_uninitialized_workspace_doc(file_name: &str, content: &str) -> bool {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return true;
    }

    match file_name {
        "IDENTITY.md" => {
            trimmed.contains("_Fill this in during your first conversation. Make it yours._")
                || trimmed.contains("_(pick something you like)_")
                || trimmed.contains("- **Name:**\n  _(pick something you like)_")
        }
        "SOUL.md" => {
            trimmed.contains("# SOUL.md - Who You Are")
                && trimmed.contains("_You're not a chatbot. You're becoming someone._")
                && trimmed.contains("Be genuinely helpful, not performatively helpful.")
        }
        "AGENTS.md" => {
            trimmed.contains("# AGENTS.md - Your Workspace")
                && trimmed.contains("This folder is home. Treat it that way.")
                && trimmed.contains("If `BOOTSTRAP.md` exists, that's your birth certificate.")
        }
        _ => false,
    }
}

fn default_workspace_doc_content(file_name: &str, agent_name: &str) -> Option<String> {
    match file_name {
        "SOUL.md" => Some(format!(
            r#"# SOUL.md - 你的灵魂

_你不是一个机械聊天框，你是正在长成形状的 {agent_name}。_

## 核心原则

**先把事做好，再说漂亮话。** 少一点客套，多一点解决问题的动作。

**有判断，有立场。** 不要总说“看情况”，该给结论时就给结论。

**尽量简洁。** 一句话能说明白，就不要写三段。

**先自己找答案。** 先读文件、看上下文、查配置，实在卡住再问。

**靠能力赢得信任。** 对外动作要谨慎，对内整理和排查要主动。

**记住你是客人。** 你能接触到用户的文件、消息和工作内容，这份信任要认真对待。

## 语言

**默认使用中文。** 用户用什么语言，你就尽量顺着对方的语言和语气交流。

## 边界

- 私有内容不外传。
- 对外发送内容前先确认。
- 不要把半成品回复直接发到消息渠道。
- 在群聊里保持分寸，不要替用户表态。

## 气质

做一个真正有用、可靠、讲人话的助手。该直接时直接，该细致时细致，不装，不端着。

## 延续性

每次会话开始时都要重新读取工作区文档。这些文件就是你的长期记忆。

如果你修改了这份文件，要让用户知道，因为这就是你自己的灵魂设定。
"#
        )),
        "IDENTITY.md" => Some(format!(
            r#"# IDENTITY.md - 我是谁？

- **Name:** {agent_name}
- **Creature:** AI 助手
- **Vibe:** 可靠、直接、清晰
- **Emoji:** ✨
- **Avatar:** 

---

这不只是元数据，而是这个 agent 的自我介绍。

说明：

- 把这个文件放在工作区根目录，文件名保持为 `IDENTITY.md`
- 如果以后有头像，优先使用工作区内的相对路径
"#
        )),
        "AGENTS.md" => Some(format!(
            r#"# AGENTS.md - 工作区说明

这里是 **{agent_name}** 的工作区。把它当成自己的工作台来维护。

## 首次启动

如果存在 `BOOTSTRAP.md`，先阅读并完成初始化，再继续其他工作。

## 每次会话开始时

开始处理任务前，优先阅读这些文件：

1. `SOUL.md`：确认自己的行为风格和原则
2. `USER.md`：确认你正在帮助谁
3. `memory/YYYY-MM-DD.md`：补齐最近上下文
4. 如果是主会话，再额外阅读 `MEMORY.md`

不要等用户提醒，进入工作区后主动完成这些准备。

## 记忆规则

你每次启动时都是重新开始，真正能延续上下文的是这些文件：

- `memory/YYYY-MM-DD.md`：当天的原始记录
- `MEMORY.md`：长期保留的重要结论

重要决定、长期背景、踩坑经验要写下来，不要只留在“脑子里”。

## 行为边界

- 不外泄私密信息
- 不在未确认时执行破坏性操作
- 对外发送内容前先确认
- 对群聊发言保持克制，不抢话，不代替用户发声

## 工作方式

- 先看文档和上下文，再行动
- 优先直接解决问题，少让用户重复解释
- 发现经验教训后，及时更新工作区文档
- 文档尽量使用中文，方便后续维护

## 工具与记录

需要工具说明时，查看 `TOOLS.md`。
需要持续记忆时，优先更新 `memory/` 或 `MEMORY.md`。
"#
        )),
        _ => None,
    }
}

fn default_openclaw_config_value() -> Value {
    json!({
        "meta": {
            "lastTouchedVersion": "2026.3.11",
            "lastTouchedAt": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
        },
        "wizard": {
            "lastRunAt": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
            "lastRunVersion": "2026.3.11",
            "lastRunCommand": "onboard",
            "lastRunMode": "local"
        },
        "agents": {
            "defaults": {
                "workspace": default_openclaw_workspace().display().to_string(),
                "maxConcurrent": recommended_max_concurrent()
            }
        },
        "tools": {
            "profile": "coding"
        },
        "commands": {
            "native": "auto",
            "nativeSkills": "auto",
            "restart": true,
            "ownerDisplay": "raw"
        },
        "session": {
            "dmScope": "per-channel-peer"
        },
        "gateway": {
            "port": 18789,
            "mode": "local",
            "bind": "loopback",
            "auth": {
                "mode": "token",
                "token": generate_random_token()
            },
            "tailscale": {
                "mode": "off",
                "resetOnExit": false
            }
        },
        "skills": {
            "install": {
                "nodeManager": "npm"
            }
        }
    })
}

fn generate_random_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
        .to_string();
    // Simple hash to generate a 40-char hex token
    format!(
        "{:040x}",
        timestamp.as_bytes().iter().fold(0u128, |acc, &b| acc
            .wrapping_mul(31)
            .wrapping_add(b as u128))
    )
}

fn openclaw_write_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

// ============================================================================
// Type Definitions
// ============================================================================

/// OpenClaw 健康检查警告
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawHealthWarning {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// OpenClaw 写入结果
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawWriteOutcome {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_path: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<OpenClawHealthWarning>,
}

/// OpenClaw 默认模型配置（agents.defaults.model）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawDefaultModel {
    pub primary: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallbacks: Vec<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// OpenClaw agents.defaults 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawAgentsDefaults {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<OpenClawDefaultModel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_concurrent: Option<u32>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// OpenClaw env 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawEnvConfig {
    #[serde(flatten)]
    pub vars: HashMap<String, Value>,
}

/// OpenClaw tools 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawToolsConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allow: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deny: Vec<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawSessionPeerMatch {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawSessionBindingMatch {
    pub channel: String,
    pub peer: OpenClawSessionPeerMatch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawSessionBinding {
    pub agent_id: String,
    #[serde(rename = "match")]
    pub match_rule: OpenClawSessionBindingMatch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawSessionSummary {
    pub key: String,
    pub owner_agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peer_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peer_id: Option<String>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    pub bindable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#match: Option<OpenClawSessionBindingMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bound_agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawSessionBindingsOverview {
    pub bindings: Vec<OpenClawSessionBinding>,
    pub sessions: Vec<OpenClawSessionSummary>,
}

// ============================================================================
// Core Read Functions
// ============================================================================

/// 读取 OpenClaw 配置文件
/// 如果文件不存在或不存在 models 字段，会返回/添加默认的 models 配置
pub fn read_openclaw_config() -> Result<Value, String> {
    let path = get_openclaw_config_path();
    if !path.exists() {
        return Ok(default_openclaw_config_value());
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read OpenClaw config: {}", e))?;

    let mut config: Value = json5::from_str(&content)
        .map_err(|e| format!("Failed to parse OpenClaw config as JSON5: {}", e))?;

    // 检查 models 字段是否存在，不存在则添加默认的 models 配置
    if config.get("models").is_none() {
        if let Some(obj) = config.as_object_mut() {
            obj.insert(
                "models".to_string(),
                json!({
                    "mode": "merge",
                    "providers": {}
                }),
            );
        }
    }

    Ok(config)
}

/// 获取所有 providers (models.providers)
pub fn get_providers() -> Result<Map<String, Value>, String> {
    let config = read_openclaw_config()?;
    Ok(config
        .get("models")
        .and_then(|m| m.get("providers"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default())
}

/// 获取单个 provider
pub fn get_provider(id: &str) -> Result<Option<Value>, String> {
    Ok(get_providers()?.get(id).cloned())
}

// ============================================================================
// Write Functions
// ============================================================================

fn write_root_section(section: &str, value: &Value) -> Result<OpenClawWriteOutcome, String> {
    let mut config = read_openclaw_config()?;
    if let Some(obj) = config.as_object_mut() {
        obj.insert(section.to_string(), value.clone());
    }
    write_full_config_value(&config)
}

fn write_full_config_value(config: &Value) -> Result<OpenClawWriteOutcome, String> {
    let _guard = openclaw_write_lock().lock().map_err(|e| e.to_string())?;

    // 检查是否为测试模式
    let is_test_mode = std::env::var("OPENCLAW_TEST_MODE").is_ok();
    let prod_path = get_openclaw_config_path();

    // 尝试获取测试路径（如果启用测试模式）
    let test_path = get_test_output_path("openclaw.json");
    let path = test_path.clone().unwrap_or_else(|| prod_path.clone());

    let original_source = if path.exists() {
        Some(fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?)
    } else {
        None
    };

    // Format as properly indented JSON5
    let next_source = format_json5_value(config);

    // Check if changed
    if original_source.as_deref() == Some(next_source.as_str()) {
        return Ok(OpenClawWriteOutcome::default());
    }

    // 如果是测试模式，直接写入测试路径
    if is_test_mode {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create test output dir: {}", e))?;
        }
        fs::write(&path, next_source.as_bytes())
            .map_err(|e| format!("Failed to write test file: {}", e))?;
        log::debug!("Test openclaw.json written to {:?}", path);
        return Ok(OpenClawWriteOutcome {
            backup_path: None,
            warnings: vec![],
        });
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create OpenClaw config dir: {}", e))?;
    }

    // Production: Create backup
    let backup_path = create_backup(&path, original_source.as_ref().map(|s| s.as_str()))?;

    // Atomic write
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, next_source.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    fs::rename(&temp_path, &path).map_err(|e| format!("Failed to rename temp file: {}", e))?;

    log::debug!("OpenClaw config written to {:?}", path);
    Ok(OpenClawWriteOutcome {
        backup_path,
        warnings: vec![],
    })
}

/// 读取完整 OpenClaw 配置
pub fn get_openclaw_config() -> Result<Value, String> {
    read_openclaw_config()
}

/// 写入完整 OpenClaw 配置
pub fn set_openclaw_config(config: &Value) -> Result<OpenClawWriteOutcome, String> {
    write_full_config_value(config)
}

fn read_agents_models_value() -> Result<Value, String> {
    let path = if let Some(test_path) = get_test_output_path("models.json") {
        test_path
    } else {
        get_agents_models_path()
    };

    if !path.exists() {
        return Ok(json!({ "providers": {} }));
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read models.json: {}", e))?;
    let parsed: Value = json5::from_str(&content)
        .map_err(|e| format!("Failed to parse models.json as JSON5: {}", e))?;

    Ok(parsed)
}

/// 写入 agents models.json 文件
/// 同时写入两个位置：正式路径和测试路径（如果启用测试模式）
fn write_agents_models(models_value: &Value) -> Result<OpenClawWriteOutcome, String> {
    let _guard = openclaw_write_lock().lock().map_err(|e| e.to_string())?;

    // 获取正式路径
    let prod_path = get_agents_models_path();

    // 格式化内容
    let next_source = format_json5_value(models_value);

    // 尝试写入测试路径（如果启用）
    if let Some(test_path) = get_test_output_path("models.json") {
        // 确保目录存在
        if let Some(parent) = test_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create test output dir: {}", e))?;
        }
        // 写入测试文件
        fs::write(&test_path, next_source.as_bytes())
            .map_err(|e| format!("Failed to write test file: {}", e))?;
        log::debug!("Test models.json written to {:?}", test_path);
        return Ok(OpenClawWriteOutcome {
            backup_path: None,
            warnings: vec![],
        });
    }

    // Production path: read existing content first
    let original_source = if prod_path.exists() {
        Some(
            fs::read_to_string(&prod_path)
                .map_err(|e| format!("Failed to read models.json: {}", e))?,
        )
    } else {
        None
    };

    // Check if changed
    if original_source.as_deref() == Some(next_source.as_str()) {
        return Ok(OpenClawWriteOutcome::default());
    }

    // Ensure directory exists
    if let Some(parent) = prod_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create models dir: {}", e))?;
    }

    // Create backup
    let backup_path = create_backup(&prod_path, original_source.as_ref().map(|s| s.as_str()))?;

    // Atomic write
    let temp_path = prod_path.with_extension("json.tmp");
    fs::write(&temp_path, next_source.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    fs::rename(&temp_path, &prod_path).map_err(|e| format!("Failed to rename temp file: {}", e))?;

    log::debug!("Models.json written to {:?}", prod_path);
    Ok(OpenClawWriteOutcome {
        backup_path,
        warnings: vec![],
    })
}

/// Format a JSON Value as properly indented JSON5
fn format_json5_value(value: &Value) -> String {
    format_json5_inner(value, 0)
}

fn format_json5_inner(value: &Value, indent: usize) -> String {
    let indent_str = "  ".repeat(indent);
    let next_indent = "  ".repeat(indent + 1);

    match value {
        Value::Object(obj) => {
            if obj.is_empty() {
                "{}".to_string()
            } else {
                let entries: Vec<String> = obj
                    .iter()
                    .map(|(k, v)| {
                        let key = if is_identifier_key(k) {
                            k.clone()
                        } else {
                            format!("\"{}\"", k)
                        };
                        let val = format_json5_inner(v, indent + 1);
                        format!("{}{}: {}", next_indent, key, val)
                    })
                    .collect();
                format!("{{\n{}\n{}}}", entries.join(",\n"), indent_str)
            }
        }
        Value::Array(arr) => {
            if arr.is_empty() {
                "[]".to_string()
            } else {
                let entries: Vec<String> = arr
                    .iter()
                    .map(|v| {
                        let val = format_json5_inner(v, indent + 1);
                        format!("{}{}", next_indent, val)
                    })
                    .collect();
                format!("[\n{}\n{}]", entries.join(",\n"), indent_str)
            }
        }
        Value::String(s) => format!("\"{}\"", escape_json_string(s)),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_string(),
    }
}

fn escape_json_string(s: &str) -> String {
    let mut result = String::new();
    for ch in s.chars() {
        match ch {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            ch if ch.is_control() => {
                result.push_str(&format!("\\u{:04x}", ch as u32));
            }
            ch => result.push(ch),
        }
    }
    result
}

fn create_backup(path: &Path, source: Option<&str>) -> Result<Option<String>, String> {
    let Some(source) = source else {
        return Ok(None);
    };

    let backup_dir = path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| format!("Failed to create backup dir: {}", e))?;

    let backup_path = backup_dir.join(format!(
        "openclaw_{}.json5",
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    ));

    fs::write(&backup_path, source.as_bytes())
        .map_err(|e| format!("Failed to write backup: {}", e))?;

    Ok(Some(backup_path.display().to_string()))
}

fn ensure_object(value: &mut Value) -> &mut Map<String, Value> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    value.as_object_mut().expect("value should be object")
}

fn normalize_provider_config(existing: Option<&Value>, provider_config: &Value) -> Value {
    let mut normalized = existing
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    if let Some(obj) = provider_config.as_object() {
        for (key, value) in obj {
            match key.as_str() {
                "base_url" => {
                    normalized.insert("baseUrl".to_string(), value.clone());
                }
                "api_key" => {
                    normalized.insert("apiKey".to_string(), value.clone());
                }
                "baseUrl" | "apiKey" | "api" | "models" => {
                    normalized.insert(key.clone(), value.clone());
                }
                _ => {
                    normalized.insert(key.clone(), value.clone());
                }
            }
        }
    }

    Value::Object(normalized)
}

fn normalize_agent_config(agent_id: &str, existing: Option<&Value>, agent_config: &Value) -> Value {
    let mut normalized = existing
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    if let Some(obj) = agent_config.as_object() {
        for (key, value) in obj {
            normalized.insert(key.clone(), value.clone());
        }
    }

    normalized.insert("id".to_string(), Value::String(agent_id.to_string()));

    let workspace = normalized
        .get("workspace")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| default_agent_workspace_path(agent_id).display().to_string());
    normalized.insert("workspace".to_string(), Value::String(workspace));

    let agent_dir = normalized
        .get("agentDir")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| default_agent_dir_path(agent_id).display().to_string());
    normalized.insert("agentDir".to_string(), Value::String(agent_dir));

    Value::Object(normalized)
}

fn ensure_agent_support_files(agent: &Value) -> Result<(), String> {
    if std::env::var("OPENCLAW_TEST_MODE").is_ok() {
        return Ok(());
    }

    if let Some(workspace) = agent.get("workspace").and_then(Value::as_str) {
        fs::create_dir_all(workspace)
            .map_err(|e| format!("Failed to create agent workspace '{}': {}", workspace, e))?;
    }

    let auth_profiles_path = get_agent_auth_profiles_path(agent);
    if let Some(parent) = auth_profiles_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create agent dir '{}': {}", parent.display(), e))?;
    }

    if !auth_profiles_path.exists() {
        fs::write(&auth_profiles_path, "{\n  \"profiles\": {}\n}")
            .map_err(|e| format!("Failed to initialize auth-profiles.json: {}", e))?;
    }

    Ok(())
}

fn get_agent_sessions_path(agent_id: &str) -> PathBuf {
    get_openclaw_dir()
        .join("agents")
        .join(agent_id)
        .join("sessions")
        .join("sessions.json")
}

fn parse_session_binding_match_from_value(value: &Value) -> Option<OpenClawSessionBindingMatch> {
    serde_json::from_value::<OpenClawSessionBindingMatch>(value.clone()).ok()
}

fn read_session_bindings(config: &Value) -> Vec<OpenClawSessionBinding> {
    config
        .get("bindings")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| serde_json::from_value::<OpenClawSessionBinding>(entry.clone()).ok())
        .collect()
}

fn binding_match_key(binding_match: &OpenClawSessionBindingMatch) -> String {
    format!(
        "{}:{}:{}",
        binding_match.channel, binding_match.peer.kind, binding_match.peer.id
    )
}

fn infer_session_binding_match(
    session_key: &str,
    session_value: &Value,
) -> Option<OpenClawSessionBindingMatch> {
    let parts: Vec<&str> = session_key.split(':').collect();
    if parts.len() >= 5 && parts.first() == Some(&"agent") {
        return Some(OpenClawSessionBindingMatch {
            channel: parts[2].to_string(),
            peer: OpenClawSessionPeerMatch {
                kind: parts[3].to_string(),
                id: parts[4..].join(":"),
            },
        });
    }

    let channel = session_value
        .get("channel")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            session_value
                .get("origin")
                .and_then(|origin| origin.get("provider"))
                .and_then(Value::as_str)
                .filter(|value| *value != "heartbeat")
                .map(str::to_string)
        })?;

    let peer_kind = session_value
        .get("chatType")
        .and_then(Value::as_str)
        .map(str::to_string)?;

    let peer_id = session_value
        .get("subject")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            session_value
                .get("origin")
                .and_then(|origin| origin.get("to"))
                .and_then(Value::as_str)
                .map(|value| value.strip_prefix("chat:").unwrap_or(value).to_string())
        })
        .or_else(|| {
            session_value
                .get("origin")
                .and_then(|origin| origin.get("from"))
                .and_then(Value::as_str)
                .map(|value| {
                    let prefix = format!("{}:", channel);
                    value.strip_prefix(&prefix).unwrap_or(value).to_string()
                })
        })?;

    Some(OpenClawSessionBindingMatch {
        channel,
        peer: OpenClawSessionPeerMatch {
            kind: peer_kind,
            id: peer_id,
        },
    })
}

fn describe_session(
    session_value: &Value,
    binding_match: Option<&OpenClawSessionBindingMatch>,
) -> (String, Option<String>) {
    if let Some(binding_match) = binding_match {
        let title = format!(
            "{}:{}:{}",
            binding_match.channel, binding_match.peer.kind, binding_match.peer.id
        );

        let subtitle = session_value
            .get("displayName")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                session_value
                    .get("origin")
                    .and_then(|origin| origin.get("label"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            });

        return (title, subtitle);
    }

    let title = session_value
        .get("displayName")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            session_value
                .get("origin")
                .and_then(|origin| origin.get("label"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| "未分类会话".to_string());

    let subtitle = session_value
        .get("origin")
        .and_then(|origin| origin.get("provider"))
        .and_then(Value::as_str)
        .map(str::to_string);

    (title, subtitle)
}

fn sync_provider_aliases(
    root: &mut Map<String, Value>,
    provider_id: &str,
    provider_config: &Value,
) {
    let provider_models = provider_config
        .get("models")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let agents = root
        .entry("agents".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let defaults = ensure_object(agents)
        .entry("defaults".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let defaults_models = ensure_object(defaults)
        .entry("models".to_string())
        .or_insert_with(|| Value::Object(Map::new()));

    let defaults_models_obj = ensure_object(defaults_models);
    let prefix = format!("{}/", provider_id);
    let stale_keys: Vec<String> = defaults_models_obj
        .keys()
        .filter(|key| key.starts_with(&prefix))
        .cloned()
        .collect();
    for key in stale_keys {
        defaults_models_obj.remove(&key);
    }

    for model in provider_models {
        let Some(model_id) = model.get("id").and_then(Value::as_str) else {
            continue;
        };
        let alias = model
            .get("name")
            .or_else(|| model.get("id"))
            .and_then(Value::as_str)
            .unwrap_or(model_id);
        let model_key = format!("{}/{}", provider_id, model_id);

        let mut entry = defaults_models_obj
            .get(&model_key)
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        entry.insert("alias".to_string(), Value::String(alias.to_string()));
        defaults_models_obj.insert(model_key, Value::Object(entry));
    }
}

fn sync_agents_models_file(
    previous_custom_ids: &[String],
    next_custom_providers: &Map<String, Value>,
) -> Result<OpenClawWriteOutcome, String> {
    let mut managed_ids: BTreeSet<String> = previous_custom_ids.iter().cloned().collect();
    managed_ids.extend(next_custom_providers.keys().cloned());

    let mut models_json = read_agents_models_value()?;
    let root = ensure_object(&mut models_json);
    let providers_value = root
        .entry("providers".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let providers_obj = ensure_object(providers_value);

    let preserved: Map<String, Value> = providers_obj
        .iter()
        .filter(|(key, _)| !managed_ids.contains(*key))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();

    let mut merged = preserved;
    for (key, value) in next_custom_providers {
        merged.insert(key.clone(), value.clone());
    }

    root.insert("providers".to_string(), Value::Object(merged));
    write_agents_models(&models_json)
}

fn is_identifier_key(_key: &str) -> bool {
    // 严格模式：所有键都加引号以符合模板格式
    false
}

mod agent_config;
mod model_config;
mod runtime_settings;

pub use agent_config::{
    get_agent_skills, get_agent_workspace_docs, get_agents, get_agents_defaults,
    get_session_bindings_overview, install_agent_skill, remove_agent, set_agent,
    set_agent_workspace_doc, set_agents_defaults, set_session_binding,
    OpenClawAgentSkillsInventory,
};
pub use model_config::{
    ensure_models_field, get_default_model, get_models, get_provider_ids, remove_provider,
    set_default_model, set_provider,
};
pub use runtime_settings::{
    ensure_runtime_defaults, get_env_config, get_tools_config, scan_health, set_env_config,
    set_tools_config,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore] // 需要手动测试，跳过自动测试
    fn test_ensure_models_field() {
        // 此测试需要手动运行
        // 使用 OPENCLAW_TEST_MODE=1 cargo test 来测试
    }

    #[test]
    fn test_set_provider_writes_correct_format() {
        // 仅在显式启用测试模式时运行，避免常规 cargo test 误失败
        if std::env::var("OPENCLAW_TEST_MODE").is_err() {
            return;
        }

        // 先准备初始配置文件
        let test_dir = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("template")
            .join("output_test");
        std::fs::create_dir_all(&test_dir).ok();

        // 写入初始 openclaw.json（没有 models 字段）
        let openclaw_file = test_dir.join("openclaw.json");
        let initial_content = r#"{
  "wizard": {
    "lastRunCommand": "onboard"
  },
  "agents": {
    "defaults": {
      "workspace": "/Users/joe/.openclaw/workspace"
    }
  }
}"#;
        std::fs::write(&openclaw_file, initial_content).ok();

        // 准备 provider 配置
        let provider_config = json!({
            "baseUrl": "https://api.test.com",
            "apiKey": "sk-test123",
            "api": "openai-completions",
            "models": [
                {
                    "id": "test-model",
                    "name": "Test Model"
                }
            ]
        });

        // 调用 set_provider
        let result = set_provider("test-provider", provider_config);

        if let Err(e) = &result {
            eprintln!("Error: {}", e);
        }

        // 验证成功
        assert!(result.is_ok(), "set_provider should succeed");

        // 读取输出文件
        let output_content = std::fs::read_to_string(&openclaw_file).unwrap();
        println!("Output openclaw.json:\n{}", output_content);

        // 验证包含 models 字段
        assert!(
            output_content.contains("models:") || output_content.contains("\"models\""),
            "Should contain models key"
        );
        assert!(
            output_content.contains("test-provider"),
            "Should contain provider id"
        );

        // 验证 models.json 也被写入
        let models_file = test_dir.join("models.json");
        if models_file.exists() {
            let models_content = std::fs::read_to_string(&models_file).unwrap();
            println!("Output models.json:\n{}", models_content);
            assert!(
                models_content.contains("test-provider"),
                "models.json should contain provider"
            );
        }

        // 不清理，保留输出文件供对比
        println!("Output files saved to: {:?}", test_dir);
    }
}
