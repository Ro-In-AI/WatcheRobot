use crate::modules::installer::service;

#[tauri::command]
pub fn check_environment() -> Result<service::EnvironmentStatus, String> {
    service::check_environment()
}

#[tauri::command]
pub async fn start_installation(app: tauri::AppHandle) -> Result<(), String> {
    service::start_installation(app).await
}
