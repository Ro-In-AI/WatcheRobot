mod logging;
mod process;
mod startup;
mod state;

pub use self::startup::start_server;
pub use self::state::{ServerState, StartServerResult};

use crate::shared::paths;
use tauri::Emitter;

pub async fn stop_server(app: tauri::AppHandle, state: ServerState) -> Result<(), String> {
    let mut child = {
        let mut child_slot = state.child.lock().unwrap();
        child_slot.take()
    };

    if child.is_none() {
        let is_running = state.is_running.lock().unwrap();
        if !*is_running {
            return Err("服务器未运行".to_string());
        }
    }

    if let Some(ref mut child_process) = child {
        if let Err(error) = child_process.kill() {
            return Err(format!("停止失败: {}", error));
        }
        let _ = child_process.wait();
    }

    {
        let mut is_running = state.is_running.lock().unwrap();
        *is_running = false;
    }

    {
        let mut runtime_mode = state.runtime_mode.lock().unwrap();
        *runtime_mode = "unknown".to_string();
    }

    let _ = app.emit("server-log", "[系统] 服务器已停止".to_string());
    let _ = app.emit("server-stopped", ());
    Ok(())
}

pub fn is_running(state: &ServerState) -> Result<bool, String> {
    let is_running = state.is_running.lock().unwrap();
    if *is_running {
        return Ok(true);
    }

    Ok(startup::port_accepts_connections(paths::server_ws_port()))
}

pub fn runtime_mode(state: &ServerState) -> Result<String, String> {
    let runtime_mode = state.runtime_mode.lock().unwrap();
    Ok(runtime_mode.clone())
}
