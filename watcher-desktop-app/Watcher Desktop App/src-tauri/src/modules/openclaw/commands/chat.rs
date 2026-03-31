use crate::modules::openclaw::chat;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn openclaw_chat_connect(
    app: AppHandle,
    state: State<'_, chat::OpenClawChatState>,
) -> Result<chat::OpenClawChatGatewayStatus, String> {
    chat::connect(&app, &state).await
}

#[tauri::command]
pub async fn openclaw_chat_disconnect(
    app: AppHandle,
    state: State<'_, chat::OpenClawChatState>,
) -> Result<chat::OpenClawChatGatewayStatus, String> {
    chat::disconnect(&app, &state).await
}

#[tauri::command]
pub fn openclaw_chat_gateway_health() -> Result<serde_json::Value, String> {
    chat::gateway_health()
}

#[tauri::command]
pub fn openclaw_chat_start_gateway() -> Result<String, String> {
    chat::start_gateway()
}

#[tauri::command]
pub async fn openclaw_chat_list_sessions(
    app: AppHandle,
    state: State<'_, chat::OpenClawChatState>,
) -> Result<serde_json::Value, String> {
    chat::list_sessions(&app, &state).await
}

#[tauri::command]
pub async fn openclaw_chat_get_history(
    app: AppHandle,
    state: State<'_, chat::OpenClawChatState>,
    session_key: String,
) -> Result<serde_json::Value, String> {
    chat::get_history(&app, &state, &session_key).await
}

#[tauri::command]
pub async fn openclaw_chat_send_message(
    app: AppHandle,
    state: State<'_, chat::OpenClawChatState>,
    session_key: String,
    message: String,
    idempotency_key: Option<String>,
    thinking: Option<String>,
) -> Result<serde_json::Value, String> {
    chat::send_message(
        &app,
        &state,
        &session_key,
        &message,
        idempotency_key.as_deref(),
        thinking.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn openclaw_chat_abort_session(
    app: AppHandle,
    state: State<'_, chat::OpenClawChatState>,
    session_key: String,
) -> Result<serde_json::Value, String> {
    chat::abort_session(&app, &state, &session_key).await
}

#[tauri::command]
pub async fn openclaw_chat_delete_session(
    app: AppHandle,
    state: State<'_, chat::OpenClawChatState>,
    session_key: String,
) -> Result<serde_json::Value, String> {
    chat::delete_session(&app, &state, &session_key).await
}
