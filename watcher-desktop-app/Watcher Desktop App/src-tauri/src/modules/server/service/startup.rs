use crate::shared::paths;
use serde_json::Value;
use std::fs;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use super::logging::spawn_log_forwarder;
use super::process::clear_port_conflicts;
use super::state::{CommandSpec, ServerState, StartServerResult};

const DEFAULT_RUNTIME_PREFERENCE: &str = "python";
const PINNED_WATCHER_SERVER_PYTHON_BIN: &str = "/opt/miniconda3/envs/watcher-server/bin/python";
const RUNTIME_BINARY_DIR: &str = "watcher-server-runtime";
const RUNTIME_PYTHON_DIR: &str = "watcher-server-python-runtime";
const CONFIGURED_BINARY_ENV_VARS: &[&str] = &["WATCHER_SERVER_SERVER_BIN", "WATCHER_SERVER_BIN"];

fn configured_server_root_from_env() -> Option<PathBuf> {
    std::env::var("WATCHER_SERVER_PROJECT_ROOT")
        .ok()
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var("WATCHER_SERVER_PYTHON_ROOT")
                .ok()
                .map(PathBuf::from)
        })
}

fn bundled_server_root_candidates(resource_dir: &Path) -> Vec<PathBuf> {
    vec![
        resource_dir.join("Watcher Server"),
        resource_dir.join("server"),
        resource_dir.join("resources").join("server"),
    ]
}

fn bundled_server_root(app: &AppHandle) -> Option<PathBuf> {
    let Ok(resource_dir) = app.path().resource_dir() else {
        return None;
    };

    for candidate in bundled_server_root_candidates(&resource_dir) {
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

fn writable_data_root(app: &AppHandle) -> PathBuf {
    app.path()
        .app_local_data_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| watcher_server_project_root_for_app(app))
}

fn ready_timeout() -> Duration {
    std::env::var("WATCHER_SERVER_READY_TIMEOUT_SECS")
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(Duration::from_secs)
        .unwrap_or_else(|| Duration::from_secs(45))
}

fn bundled_binary_exists(app: &AppHandle) -> bool {
    bundled_server_root(app)
        .map(|root| {
            let binary_name = binary_executable_name();
            root.join(binary_name).exists() || root.join("dist").join(binary_name).exists()
        })
        .unwrap_or(false)
}

fn runtime_preference(app: &AppHandle) -> String {
    std::env::var("WATCHER_SERVER_RUNTIME_MODE")
        .ok()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| matches!(value.as_str(), "binary" | "python" | "auto"))
        .unwrap_or_else(|| {
            if bundled_binary_exists(app) {
                "auto".to_string()
            } else {
                DEFAULT_RUNTIME_PREFERENCE.to_string()
            }
        })
}

fn configured_http_management_port(app: &AppHandle) -> Option<u16> {
    let mut config_paths = Vec::new();

    if let Some(root) = bundled_server_root(app) {
        config_paths.push(root.join("config").join("system.json"));
    }

    config_paths.extend([
        paths::server_root().join("config").join("system.json"),
        watcher_server_project_root_for_app(app)
            .join("config")
            .join("system.json"),
        watcher_server_project_root()
            .join("config")
            .join("system.json"),
    ]);

    for config_path in config_paths {
        let Ok(contents) = fs::read_to_string(&config_path) else {
            continue;
        };
        let Ok(Value::Object(config)) = serde_json::from_str::<Value>(&contents) else {
            continue;
        };

        let enabled = config
            .get("http_management_enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        if !enabled {
            continue;
        }

        let Some(port) = config
            .get("http_management_port")
            .and_then(Value::as_u64)
            .and_then(|value| u16::try_from(value).ok())
        else {
            continue;
        };

        return Some(port);
    }

    None
}

fn watcher_server_project_root() -> PathBuf {
    if let Some(root) = configured_server_root_from_env() {
        return root;
    }

    let workspace_root = paths::server_root();
    if workspace_root.join("main.py").exists() {
        return workspace_root;
    }

    let legacy_resource_root = paths::app_root().join("resources").join("server");
    if legacy_resource_root.join("main.py").exists() {
        return legacy_resource_root;
    }

    let packaged_resource_root = paths::app_root()
        .join("resources")
        .join("resources")
        .join("server");
    if packaged_resource_root.join("main.py").exists() {
        return packaged_resource_root;
    }

    if let Some(legacy_sibling_root) = std::env::current_dir()
        .ok()
        .and_then(|cwd| cwd.parent().map(|parent| parent.join("watcher-server")))
        .filter(|root| root.join("main.py").exists())
    {
        return legacy_sibling_root;
    }

    workspace_root
}

fn watcher_server_project_root_for_app(app: &AppHandle) -> PathBuf {
    if let Some(root) = configured_server_root_from_env() {
        return root;
    }

    if let Some(root) = bundled_server_root(app).filter(|root| {
        root.join("main.py").exists() || root.join("config").exists() || root.join("dist").exists()
    }) {
        return root;
    }

    watcher_server_project_root()
}

fn backend_envs(runtime_root: &Path, data_root: &Path, ws_port: u16) -> Vec<(String, String)> {
    vec![
        (
            "WATCHER_SERVER_PROJECT_ROOT".to_string(),
            runtime_root.display().to_string(),
        ),
        (
            "WATCHER_SERVER_ROOT".to_string(),
            runtime_root.display().to_string(),
        ),
        (
            "WATCHER_SERVER_DATA_DIR".to_string(),
            data_root.display().to_string(),
        ),
        ("WATCHER_SERVER_WS_PORT".to_string(), ws_port.to_string()),
    ]
}

fn python_envs(runtime_root: &Path, data_root: &Path, ws_port: u16) -> Vec<(String, String)> {
    let mut envs = backend_envs(runtime_root, data_root, ws_port);
    envs.extend([
        ("PYTHONIOENCODING".to_string(), "utf-8".to_string()),
        ("PYTHONUTF8".to_string(), "1".to_string()),
        ("PYTHONUNBUFFERED".to_string(), "1".to_string()),
    ]);
    envs
}

fn binary_executable_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "watcher-server-backend.exe"
    } else {
        "watcher-server-backend"
    }
}

fn binary_envs(runtime_root: &Path, data_root: &Path, ws_port: u16) -> Vec<(String, String)> {
    backend_envs(runtime_root, data_root, ws_port)
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if paths.iter().any(|candidate| candidate == &path) {
        return;
    }
    paths.push(path);
}

fn copy_if_needed(source: &Path, target: &Path) -> Result<(), String> {
    let should_copy = match (source.metadata(), target.metadata()) {
        (Ok(source_meta), Ok(target_meta)) => {
            source_meta.len() != target_meta.len()
                || source_meta
                    .modified()
                    .ok()
                    .zip(target_meta.modified().ok())
                    .map(|(source_time, target_time)| source_time > target_time)
                    .unwrap_or(true)
        }
        (Ok(_), Err(_)) => true,
        (Err(error), _) => {
            return Err(format!("读取源文件失败 {}: {}", source.display(), error));
        }
    };

    if should_copy {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("创建目录失败 {}: {}", parent.display(), error))?;
        }
        fs::copy(source, target).map_err(|error| {
            format!(
                "复制文件失败 {} -> {}: {}",
                source.display(),
                target.display(),
                error
            )
        })?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(target)
            .map_err(|error| format!("读取目标文件权限失败 {}: {}", target.display(), error))?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(target, permissions)
            .map_err(|error| format!("设置可执行权限失败 {}: {}", target.display(), error))?;
    }

    Ok(())
}

fn sync_tree(source: &Path, target: &Path, overwrite_existing: bool) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }

    fs::create_dir_all(target)
        .map_err(|error| format!("创建目录失败 {}: {}", target.display(), error))?;

    for entry in fs::read_dir(source)
        .map_err(|error| format!("读取目录失败 {}: {}", source.display(), error))?
    {
        let entry = entry.map_err(|error| format!("读取目录项失败: {}", error))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|error| format!("读取文件类型失败 {}: {}", source_path.display(), error))?;

        if file_type.is_dir() {
            sync_tree(&source_path, &target_path, overwrite_existing)?;
        } else if overwrite_existing || !target_path.exists() {
            copy_if_needed(&source_path, &target_path)?;
        }
    }

    Ok(())
}

fn sync_missing_files(source: &Path, target: &Path) -> Result<(), String> {
    sync_tree(source, target, false)
}

fn sync_runtime_files(source: &Path, target: &Path) -> Result<(), String> {
    sync_tree(source, target, true)
}

fn binary_config_roots(binary_path: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(config_root) = std::env::var("WATCHER_SERVER_CONFIG_ROOT") {
        push_unique_path(&mut roots, PathBuf::from(config_root));
    }

    if let Some(parent) = binary_path.parent() {
        push_unique_path(&mut roots, parent.join("config"));
        if parent.file_name().and_then(|name| name.to_str()) == Some("dist") {
            if let Some(root) = parent.parent() {
                push_unique_path(&mut roots, root.join("config"));
            }
        }
    }

    push_unique_path(&mut roots, paths::server_root().join("config"));
    push_unique_path(&mut roots, watcher_server_project_root().join("config"));

    roots
}

fn prepare_binary_runtime(
    app: &AppHandle,
    source_binary: &Path,
) -> Result<(PathBuf, PathBuf), String> {
    let runtime_root = writable_data_root(app).join(RUNTIME_BINARY_DIR);
    let runtime_binary = runtime_root.join(binary_executable_name());

    fs::create_dir_all(&runtime_root).map_err(|error| {
        format!(
            "创建二进制运行目录失败 {}: {}",
            runtime_root.display(),
            error
        )
    })?;
    copy_if_needed(source_binary, &runtime_binary)?;

    for config_root in binary_config_roots(source_binary) {
        if config_root.exists() {
            sync_missing_files(&config_root, &runtime_root.join("config"))?;
            break;
        }
    }

    Ok((runtime_root, runtime_binary))
}

fn prepare_python_runtime(app: &AppHandle, source_root: &Path) -> Result<PathBuf, String> {
    let runtime_root = writable_data_root(app).join(RUNTIME_PYTHON_DIR);

    fs::create_dir_all(&runtime_root).map_err(|error| {
        format!(
            "创建 Python 运行目录失败 {}: {}",
            runtime_root.display(),
            error
        )
    })?;

    let runtime_main = runtime_root.join("main.py");
    let source_main = source_root.join("main.py");
    if !source_main.exists() {
        return Err(format!("未找到 Python 启动入口: {}", source_main.display()));
    }
    copy_if_needed(&source_main, &runtime_main)?;

    let source_src = source_root.join("src");
    if !source_src.join("main.py").exists() {
        return Err(format!("未找到 Python 源码目录: {}", source_src.display()));
    }

    sync_runtime_files(&source_src, &runtime_root.join("src"))?;
    sync_missing_files(&source_root.join("config"), &runtime_root.join("config"))?;

    for file_name in ["requirements.txt", "environment.yml"] {
        let source_file = source_root.join(file_name);
        if source_file.exists() {
            copy_if_needed(&source_file, &runtime_root.join(file_name))?;
        }
    }

    Ok(runtime_root)
}

fn binary_search_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    push_unique_path(&mut dirs, paths::server_root());
    push_unique_path(&mut dirs, paths::server_root().join("dist"));

    if let Ok(resource_dir) = app.path().resource_dir() {
        for root in bundled_server_root_candidates(&resource_dir) {
            push_unique_path(&mut dirs, root.join("dist"));
            push_unique_path(&mut dirs, root);
        }
        push_unique_path(&mut dirs, resource_dir);
    }

    let app_root = paths::app_root();
    push_unique_path(&mut dirs, app_root.join("resources").join("server"));
    push_unique_path(
        &mut dirs,
        app_root.join("resources").join("resources").join("server"),
    );
    push_unique_path(&mut dirs, app_root.join("dist").join("server"));
    push_unique_path(&mut dirs, app_root.join("dist"));
    push_unique_path(
        &mut dirs,
        watcher_server_project_root_for_app(app).join("dist"),
    );

    dirs
}

fn binary_command_candidates(app: &AppHandle) -> Vec<CommandSpec> {
    let data_root = writable_data_root(app);
    let ws_port = paths::server_ws_port();
    let mut commands = Vec::new();

    for env_name in CONFIGURED_BINARY_ENV_VARS {
        if let Ok(configured_path) = std::env::var(env_name) {
            let binary_path = PathBuf::from(configured_path);
            let Ok((runtime_root, runtime_binary)) = prepare_binary_runtime(app, &binary_path)
            else {
                continue;
            };

            commands.push(CommandSpec {
                program: runtime_binary,
                args: Vec::new(),
                current_dir: runtime_root.clone(),
                envs: binary_envs(&runtime_root, &data_root, ws_port),
                label: format!("configured backend binary via {}", env_name),
                mode: "binary".to_string(),
            });
        }
    }

    for dir in binary_search_dirs(app) {
        let binary_path = dir.join(binary_executable_name());
        if !binary_path.exists() {
            continue;
        }

        let Ok((runtime_root, runtime_binary)) = prepare_binary_runtime(app, &binary_path) else {
            continue;
        };

        let label = if dir.file_name().and_then(|name| name.to_str()) == Some("server")
            || dir.file_name().and_then(|name| name.to_str()) == Some("Watcher Server")
        {
            "bundled backend binary"
        } else if dir.ends_with("dist/server") || dir.ends_with("dist") {
            "dist backend binary"
        } else {
            "runtime backend binary"
        };

        commands.push(CommandSpec {
            program: runtime_binary,
            args: Vec::new(),
            current_dir: runtime_root.clone(),
            envs: binary_envs(&runtime_root, &data_root, ws_port),
            label: label.to_string(),
            mode: "binary".to_string(),
        });
    }

    commands
}

fn python_command_candidates(app: &AppHandle) -> Vec<CommandSpec> {
    let source_root = watcher_server_project_root_for_app(app);
    let data_root = writable_data_root(app);
    let ws_port = paths::server_ws_port();
    let mut commands = Vec::new();
    let Ok(runtime_root) = prepare_python_runtime(app, &source_root) else {
        return commands;
    };

    let pinned_python = PathBuf::from(PINNED_WATCHER_SERVER_PYTHON_BIN);
    if pinned_python.exists() {
        commands.push(CommandSpec {
            program: pinned_python,
            args: vec!["main.py".to_string()],
            current_dir: runtime_root.clone(),
            envs: python_envs(&runtime_root, &data_root, ws_port),
            label: "pinned watcher-server conda python".to_string(),
            mode: "python".to_string(),
        });
        return commands;
    }

    if let Ok(python_bin) = std::env::var("WATCHER_SERVER_PYTHON_BIN") {
        commands.push(CommandSpec {
            program: PathBuf::from(python_bin),
            args: vec!["main.py".to_string()],
            current_dir: runtime_root.clone(),
            envs: python_envs(&runtime_root, &data_root, ws_port),
            label: "configured python interpreter".to_string(),
            mode: "python".to_string(),
        });
    }

    let local_venv_candidates = if cfg!(target_os = "windows") {
        vec![
            source_root.join("venv").join("Scripts").join("python.exe"),
            source_root.join(".venv").join("Scripts").join("python.exe"),
        ]
    } else {
        vec![
            source_root.join("venv").join("bin").join("python"),
            source_root.join("venv").join("bin").join("python3"),
            source_root.join(".venv").join("bin").join("python"),
            source_root.join(".venv").join("bin").join("python3"),
        ]
    };

    for candidate in local_venv_candidates {
        if candidate.exists() {
            commands.push(CommandSpec {
                program: candidate,
                args: vec!["main.py".to_string()],
                current_dir: runtime_root.clone(),
                envs: python_envs(&runtime_root, &data_root, ws_port),
                label: "local virtualenv python".to_string(),
                mode: "python".to_string(),
            });
            break;
        }
    }

    if cfg!(target_os = "windows") {
        commands.push(CommandSpec {
            program: PathBuf::from("py"),
            args: vec!["-3".to_string(), "main.py".to_string()],
            current_dir: runtime_root.clone(),
            envs: python_envs(&runtime_root, &data_root, ws_port),
            label: "system python launcher".to_string(),
            mode: "python".to_string(),
        });
    } else {
        commands.push(CommandSpec {
            program: PathBuf::from("python3"),
            args: vec!["main.py".to_string()],
            current_dir: runtime_root.clone(),
            envs: python_envs(&runtime_root, &data_root, ws_port),
            label: "system python3".to_string(),
            mode: "python".to_string(),
        });
        commands.push(CommandSpec {
            program: PathBuf::from("python"),
            args: vec!["main.py".to_string()],
            current_dir: runtime_root.clone(),
            envs: python_envs(&runtime_root, &data_root, ws_port),
            label: "system python".to_string(),
            mode: "python".to_string(),
        });
    }

    commands
}

fn command_candidates(app: &AppHandle) -> Result<Vec<CommandSpec>, String> {
    let project_root = watcher_server_project_root_for_app(app);
    let binary_commands = binary_command_candidates(app);
    let python_commands = python_command_candidates(app);
    let mut commands = Vec::new();

    match runtime_preference(app).as_str() {
        "python" => {
            commands.extend(python_commands);
        }
        "auto" | "binary" => {
            commands.extend(binary_commands);
            commands.extend(python_commands);
        }
        _ => {}
    }

    if commands.is_empty() {
        return Err(format!(
            "未找到可用的后端启动方式。请确认已提供 watcher-server 二进制，或确保 Watcher Server 存在于 {} 并安装好 Python/虚拟环境。",
            project_root.display()
        ));
    }

    Ok(commands)
}

fn child_survived_startup(child: &mut Child, startup_wait: Duration) -> Result<bool, String> {
    std::thread::sleep(startup_wait);
    child
        .try_wait()
        .map(|status| status.is_none())
        .map_err(|error| format!("检查启动状态失败: {}", error))
}

pub(crate) fn port_accepts_connections(port: u16) -> bool {
    let address = ("127.0.0.1", port);
    let Ok(mut candidates) = address.to_socket_addrs() else {
        return false;
    };
    let Some(socket_addr) = candidates.next() else {
        return false;
    };

    TcpStream::connect_timeout(&socket_addr, Duration::from_millis(200)).is_ok()
}

fn wait_for_server_ready(child: &mut Child, port: u16, timeout: Duration) -> Result<bool, String> {
    let started_at = std::time::Instant::now();

    loop {
        if port_accepts_connections(port) {
            return Ok(true);
        }

        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("检查启动状态失败: {}", error))?
        {
            return Err(format!("进程已退出，退出码: {:?}", status.code()));
        }

        if started_at.elapsed() >= timeout {
            return Ok(false);
        }

        std::thread::sleep(Duration::from_millis(200));
    }
}

fn spawn_exit_monitor(app: AppHandle, state: ServerState) {
    let child_state = Arc::clone(&state.child);
    let running_state = Arc::clone(&state.is_running);
    let runtime_mode_state = Arc::clone(&state.runtime_mode);

    std::thread::spawn(move || loop {
        let exit_code = {
            let mut child_guard = child_state.lock().unwrap();
            match child_guard.as_mut() {
                Some(child) => match child.try_wait() {
                    Ok(Some(status)) => {
                        let code = status.code();
                        child_guard.take();
                        Some(code)
                    }
                    Ok(None) => None,
                    Err(error) => {
                        let _ = app.emit(
                            "server-log",
                            format!("[错误] 检查服务器进程状态失败: {}", error),
                        );
                        child_guard.take();
                        Some(None)
                    }
                },
                None => break,
            }
        };

        if let Some(code) = exit_code {
            if let Ok(mut is_running) = running_state.lock() {
                *is_running = false;
            }
            if let Ok(mut runtime_mode) = runtime_mode_state.lock() {
                *runtime_mode = "unknown".to_string();
            }
            let _ = app.emit(
                "server-log",
                format!("[系统] 服务器进程已终止 (退出码: {:?})", code),
            );
            let _ = app.emit("server-exited", ());
            break;
        }

        std::thread::sleep(Duration::from_millis(500));
    });
}

pub fn start_server(
    app: tauri::AppHandle,
    state: ServerState,
) -> Result<StartServerResult, String> {
    {
        let is_running = state.is_running.lock().unwrap();
        if *is_running {
            return Err("服务器已在运行中".to_string());
        }
    }

    clear_port_conflicts(&app, paths::server_ws_port())?;
    if let Some(http_port) = configured_http_management_port(&app) {
        if http_port != paths::server_ws_port() {
            clear_port_conflicts(&app, http_port)?;
        }
    }

    let mut last_error = None;
    let startup_wait = Duration::from_millis(300);
    let ready_timeout = ready_timeout();
    let ws_port = paths::server_ws_port();

    for spec in command_candidates(&app)? {
        let display = format!("{} {}", spec.program.display(), spec.args.join(" "))
            .trim()
            .to_string();

        let _ = app.emit(
            "server-log",
            format!("[系统] 尝试启动后端: {} ({})", display, spec.label),
        );
        println!(
            "[WatcherServerLauncher] 尝试启动后端: {} ({})",
            display, spec.label
        );

        if !spec.current_dir.exists() {
            last_error = Some(format!("工作目录不存在: {}", spec.current_dir.display()));
            continue;
        }

        let mut command = Command::new(&spec.program);
        command
            .args(&spec.args)
            .current_dir(&spec.current_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for (key, value) in &spec.envs {
            command.env(key, value);
        }

        match command.spawn() {
            Ok(mut child) => {
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();

                if let Some(stdout) = stdout {
                    spawn_log_forwarder(app.clone(), stdout, "stdout");
                }
                if let Some(stderr) = stderr {
                    spawn_log_forwarder(app.clone(), stderr, "stderr");
                }

                match child_survived_startup(&mut child, startup_wait) {
                    Ok(true) => {}
                    Ok(false) => {
                        let message = format!("{}: 进程在启动后立即退出", display);
                        let _ = app.emit("server-log", format!("[警告] {}", message));
                        eprintln!("[WatcherServerLauncher] {}", message);
                        last_error = Some(message);
                        continue;
                    }
                    Err(error) => {
                        let message = format!("{}: {}", display, error);
                        let _ = app.emit("server-log", format!("[警告] {}", message));
                        eprintln!("[WatcherServerLauncher] {}", message);
                        last_error = Some(message);
                        continue;
                    }
                }

                match wait_for_server_ready(&mut child, ws_port, ready_timeout) {
                    Ok(true) => {}
                    Ok(false) => {
                        let _ = app.emit(
                            "server-log",
                            format!(
                                "[警告] {}: 服务端口 {} 在 {} 秒内未就绪",
                                display,
                                ws_port,
                                ready_timeout.as_secs()
                            ),
                        );
                        eprintln!(
                            "[WatcherServerLauncher] {}: 服务端口 {} 在 {} 秒内未就绪",
                            display,
                            ws_port,
                            ready_timeout.as_secs()
                        );
                        let _ = child.kill();
                        let _ = child.wait();
                        let message = format!(
                            "{}: 服务端口 {} 在 {} 秒内未就绪",
                            display,
                            ws_port,
                            ready_timeout.as_secs()
                        );
                        last_error = Some(message);
                        continue;
                    }
                    Err(error) => {
                        let message = format!("{}: {}", display, error);
                        let _ = app.emit("server-log", format!("[警告] {}", message));
                        eprintln!("[WatcherServerLauncher] {}", message);
                        last_error = Some(message);
                        continue;
                    }
                }

                {
                    let mut child_slot = state.child.lock().unwrap();
                    *child_slot = Some(child);
                }

                {
                    let mut is_running = state.is_running.lock().unwrap();
                    *is_running = true;
                }

                {
                    let mut runtime_mode = state.runtime_mode.lock().unwrap();
                    *runtime_mode = spec.mode.clone();
                }

                let _ = app.emit(
                    "server-log",
                    format!("[系统] 服务器进程已就绪: {} ({})", display, spec.label),
                );
                println!(
                    "[WatcherServerLauncher] 服务器进程已就绪: {} ({})",
                    display, spec.label
                );

                spawn_exit_monitor(app.clone(), state.clone());
                return Ok(StartServerResult {
                    mode: spec.mode,
                    label: spec.label,
                    command: display,
                });
            }
            Err(error) => {
                let message = format!("{}: {}", display, error);
                let _ = app.emit("server-log", format!("[警告] 启动命令失败: {}", message));
                eprintln!("[WatcherServerLauncher] 启动命令失败: {}", message);
                last_error = Some(message);
            }
        }
    }

    let error = last_error.unwrap_or_else(|| "没有可用的服务启动命令".to_string());
    Err(format!("启动失败: {}", error))
}
