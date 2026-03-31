use crate::modules::openclaw::runtime_settings;

#[tauri::command]
pub fn get_openclaw_env() -> Result<runtime_settings::OpenClawEnvConfig, String> {
    runtime_settings::get_env_config()
}

#[tauri::command]
pub fn set_openclaw_env(
    env: runtime_settings::OpenClawEnvConfig,
) -> Result<runtime_settings::OpenClawWriteOutcome, String> {
    runtime_settings::set_env_config(&env)
}

#[tauri::command]
pub fn get_openclaw_tools() -> Result<runtime_settings::OpenClawToolsConfig, String> {
    runtime_settings::get_tools_config()
}

#[tauri::command]
pub fn set_openclaw_tools(
    tools: runtime_settings::OpenClawToolsConfig,
) -> Result<runtime_settings::OpenClawWriteOutcome, String> {
    runtime_settings::set_tools_config(&tools)
}

#[tauri::command]
pub fn scan_openclaw_health() -> Result<Vec<runtime_settings::OpenClawHealthWarning>, String> {
    runtime_settings::scan_health()
}
