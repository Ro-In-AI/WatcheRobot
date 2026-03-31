use crate::modules::openclaw::model_config;
use serde_json::Value;

#[tauri::command]
pub fn get_openclaw_provider_ids() -> Result<Vec<String>, String> {
    model_config::get_provider_ids()
}

#[tauri::command]
pub fn get_openclaw_provider(provider_id: String) -> Result<Option<Value>, String> {
    model_config::get_provider(&provider_id)
}

#[tauri::command]
pub fn set_openclaw_provider(
    provider_id: String,
    config: Value,
) -> Result<model_config::OpenClawWriteOutcome, String> {
    model_config::set_provider(&provider_id, config)
}

#[tauri::command]
pub fn remove_openclaw_provider(
    provider_id: String,
) -> Result<model_config::OpenClawWriteOutcome, String> {
    model_config::remove_provider(&provider_id)
}

#[tauri::command]
pub fn get_openclaw_default_model() -> Result<Option<model_config::OpenClawDefaultModel>, String> {
    model_config::get_default_model()
}

#[tauri::command]
pub fn set_openclaw_default_model(
    model: model_config::OpenClawDefaultModel,
) -> Result<model_config::OpenClawWriteOutcome, String> {
    model_config::set_default_model(&model)
}

#[tauri::command]
pub fn get_openclaw_models() -> Result<Value, String> {
    model_config::get_models()
}

#[tauri::command]
pub fn ensure_openclaw_models_field() -> Result<model_config::OpenClawWriteOutcome, String> {
    model_config::ensure_models_field()
}

#[tauri::command]
pub fn get_openclaw_config() -> Result<Value, String> {
    model_config::get_openclaw_config()
}

#[tauri::command]
pub fn set_openclaw_config(config: Value) -> Result<model_config::OpenClawWriteOutcome, String> {
    model_config::set_openclaw_config(&config)
}
