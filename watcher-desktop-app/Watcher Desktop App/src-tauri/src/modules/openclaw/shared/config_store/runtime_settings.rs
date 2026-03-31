use super::*;
use std::collections::HashMap;

pub fn ensure_runtime_defaults() -> Result<OpenClawWriteOutcome, String> {
    let mut config = read_openclaw_config()?;
    let root = ensure_object(&mut config);
    let agents = root
        .entry("agents".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let defaults = ensure_object(agents)
        .entry("defaults".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let defaults_object = ensure_object(defaults);

    let mut changed = false;

    if defaults_object
        .get("workspace")
        .and_then(Value::as_str)
        .map(|value| value.trim().is_empty())
        .unwrap_or(true)
    {
        defaults_object.insert(
            "workspace".to_string(),
            Value::String(default_openclaw_workspace().display().to_string()),
        );
        changed = true;
    }

    if defaults_object.get("maxConcurrent").is_none() {
        defaults_object.insert(
            "maxConcurrent".to_string(),
            Value::Number(recommended_max_concurrent().into()),
        );
        changed = true;
    }

    if !changed {
        return Ok(OpenClawWriteOutcome::default());
    }

    let agents_value = root
        .get("agents")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
    write_root_section("agents", &agents_value)
}

pub fn get_env_config() -> Result<OpenClawEnvConfig, String> {
    let config = read_openclaw_config()?;

    let Some(env_value) = config.get("env") else {
        return Ok(OpenClawEnvConfig {
            vars: HashMap::new(),
        });
    };

    serde_json::from_value(env_value.clone())
        .map_err(|e| format!("Failed to parse env config: {}", e))
}

pub fn set_env_config(env: &OpenClawEnvConfig) -> Result<OpenClawWriteOutcome, String> {
    let value = serde_json::to_value(env).map_err(|e| format!("Failed to serialize env: {}", e))?;
    write_root_section("env", &value)
}

pub fn get_tools_config() -> Result<OpenClawToolsConfig, String> {
    let config = read_openclaw_config()?;

    let Some(tools_value) = config.get("tools") else {
        return Ok(OpenClawToolsConfig {
            profile: None,
            allow: Vec::new(),
            deny: Vec::new(),
            extra: HashMap::new(),
        });
    };

    serde_json::from_value(tools_value.clone())
        .map_err(|e| format!("Failed to parse tools config: {}", e))
}

pub fn set_tools_config(tools: &OpenClawToolsConfig) -> Result<OpenClawWriteOutcome, String> {
    let value =
        serde_json::to_value(tools).map_err(|e| format!("Failed to serialize tools: {}", e))?;
    write_root_section("tools", &value)
}

pub fn scan_health() -> Result<Vec<OpenClawHealthWarning>, String> {
    let config = read_openclaw_config()?;
    let mut warnings = Vec::new();

    if let Some(profile) = config
        .get("tools")
        .and_then(|tools| tools.get("profile"))
        .and_then(Value::as_str)
    {
        if !OPENCLAW_TOOLS_PROFILES.contains(&profile) {
            warnings.push(OpenClawHealthWarning {
                code: "invalid_tools_profile".to_string(),
                message: format!("tools.profile uses unsupported value '{}'.", profile),
                path: Some("tools.profile".to_string()),
            });
        }
    }

    if config
        .get("agents")
        .and_then(|agents| agents.get("defaults"))
        .and_then(|defaults| defaults.get("timeout"))
        .is_some()
    {
        warnings.push(OpenClawHealthWarning {
            code: "legacy_agents_timeout".to_string(),
            message: "agents.defaults.timeout is deprecated; use agents.defaults.timeoutSeconds."
                .to_string(),
            path: Some("agents.defaults.timeout".to_string()),
        });
    }

    Ok(warnings)
}
