use serde::Serialize;
use std::path::PathBuf;

fn env_or_path<F>(name: &str, default: F) -> PathBuf
where
    F: FnOnce() -> PathBuf,
{
    std::env::var(name)
        .map(PathBuf::from)
        .unwrap_or_else(|_| default())
}

pub fn app_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn workspace_root() -> PathBuf {
    app_root()
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(app_root)
}

fn embedded_server_root() -> PathBuf {
    let workspace_root = workspace_root();
    let sibling_root = workspace_root.join("Watcher Server");

    if sibling_root.exists() {
        sibling_root
    } else {
        let legacy_resource_root = app_root().join("resources").join("server");
        if legacy_resource_root.exists() {
            legacy_resource_root
        } else {
            sibling_root
        }
    }
}

pub fn installer_root() -> PathBuf {
    env_or_path("WATCHER_DESKTOP_INSTALLER_ROOT", app_root)
}

pub fn assistant_root() -> PathBuf {
    env_or_path("WATCHER_DESKTOP_ASSISTANT_ROOT", app_root)
}

pub fn server_root() -> PathBuf {
    env_or_path("WATCHER_SERVER_RESOURCE_ROOT", embedded_server_root)
}

pub fn server_ws_port() -> u16 {
    std::env::var("WATCHER_SERVER_WS_PORT")
        .or_else(|_| std::env::var("WS_PORT"))
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .unwrap_or(8765)
}

pub fn server_ws_url() -> String {
    format!("ws://127.0.0.1:{}", server_ws_port())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationPaths {
    pub app_root: String,
    pub installer_root: String,
    pub assistant_root: String,
    pub server_root: String,
    pub ws_url: String,
}

pub fn integration_paths() -> IntegrationPaths {
    IntegrationPaths {
        app_root: app_root().display().to_string(),
        installer_root: installer_root().display().to_string(),
        assistant_root: assistant_root().display().to_string(),
        server_root: server_root().display().to_string(),
        ws_url: server_ws_url(),
    }
}
