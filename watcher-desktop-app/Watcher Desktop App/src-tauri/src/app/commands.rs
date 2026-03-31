use crate::shared::paths;

#[tauri::command]
pub fn get_integration_paths() -> paths::IntegrationPaths {
    paths::integration_paths()
}

#[tauri::command]
pub fn debug_log(
    level: String,
    scope: String,
    message: String,
    details: Option<String>,
) -> Result<(), String> {
    let normalized_level = level.trim().to_ascii_uppercase();
    let line = match details
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(details) => format!(
            "[WatcherDebug][{}][{}] {} | {}",
            normalized_level, scope, message, details
        ),
        None => format!(
            "[WatcherDebug][{}][{}] {}",
            normalized_level, scope, message
        ),
    };

    match normalized_level.as_str() {
        "ERROR" | "WARN" => eprintln!("{}", line),
        _ => println!("{}", line),
    }

    Ok(())
}
