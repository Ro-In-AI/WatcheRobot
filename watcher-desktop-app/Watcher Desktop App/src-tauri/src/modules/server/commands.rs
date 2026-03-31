use crate::modules::server::service::{self, ServerState, StartServerResult};

#[tauri::command]
pub async fn start_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
) -> Result<StartServerResult, String> {
    let app_handle = app.clone();
    let state = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || service::start_server(app_handle, state))
        .await
        .map_err(|error| format!("启动任务执行失败: {}", error))?
}

#[tauri::command]
pub async fn stop_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
) -> Result<(), String> {
    service::stop_server(app, state.inner().clone()).await
}

#[tauri::command]
pub fn is_server_running(state: tauri::State<'_, ServerState>) -> Result<bool, String> {
    service::is_running(state.inner())
}

#[tauri::command]
pub fn get_server_runtime_mode(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    service::runtime_mode(state.inner())
}
