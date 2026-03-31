use super::*;
use serde_json::{json, Map, Value};

pub fn get_provider_ids() -> Result<Vec<String>, String> {
    Ok(get_providers()?.keys().cloned().collect())
}

pub fn get_models() -> Result<Value, String> {
    let config = read_openclaw_config()?;
    Ok(config
        .get("models")
        .and_then(|m| m.get("providers"))
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new())))
}

pub fn set_provider(id: &str, provider_config: Value) -> Result<OpenClawWriteOutcome, String> {
    let mut full_config = read_openclaw_config()?;
    let previous_provider_ids = get_provider_ids()?;
    let next_custom_providers = {
        let root = ensure_object(&mut full_config);
        let models = root.entry("models".to_string()).or_insert_with(|| {
            json!({
                "mode": "merge",
                "providers": {}
            })
        });
        let providers = ensure_object(models)
            .entry("providers".to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        let providers_obj = ensure_object(providers);
        let existing_provider = providers_obj.get(id).cloned();
        let next_provider = normalize_provider_config(existing_provider.as_ref(), &provider_config);
        providers_obj.insert(id.to_string(), next_provider.clone());

        sync_provider_aliases(root, id, &next_provider);

        root.get("models")
            .and_then(|m| m.get("providers"))
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default()
    };

    let outcome = write_full_config_value(&full_config)?;
    sync_agents_models_file(&previous_provider_ids, &next_custom_providers)?;

    Ok(outcome)
}

pub fn remove_provider(id: &str) -> Result<OpenClawWriteOutcome, String> {
    let mut config = read_openclaw_config()?;
    let previous_provider_ids = get_provider_ids()?;
    let mut removed = false;

    if let Some(entries) = config
        .get_mut("models")
        .and_then(|models| models.get_mut("providers"))
        .and_then(Value::as_object_mut)
    {
        removed = entries.remove(id).is_some();
    }

    if let Some(defaults_models) = config
        .get_mut("agents")
        .and_then(|a| a.get_mut("defaults"))
        .and_then(|d| d.get_mut("models"))
        .and_then(Value::as_object_mut)
    {
        let keys_to_remove: Vec<String> = defaults_models
            .keys()
            .filter(|k| k.starts_with(&format!("{}/", id)))
            .cloned()
            .collect();
        for key in keys_to_remove {
            defaults_models.remove(&key);
            removed = true;
        }
    }

    if !removed {
        return Ok(OpenClawWriteOutcome::default());
    }

    let outcome = write_full_config_value(&config)?;

    let next_custom_providers = config
        .get("models")
        .and_then(|m| m.get("providers"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    sync_agents_models_file(&previous_provider_ids, &next_custom_providers)?;

    Ok(outcome)
}

pub fn get_default_model() -> Result<Option<OpenClawDefaultModel>, String> {
    let config = read_openclaw_config()?;

    let Some(model_value) = config
        .get("agents")
        .and_then(|a| a.get("defaults"))
        .and_then(|d| d.get("model"))
    else {
        return Ok(None);
    };

    serde_json::from_value(model_value.clone())
        .map_err(|e| format!("Failed to parse agents.defaults.model: {}", e))
        .map(Some)
}

pub fn set_default_model(model: &OpenClawDefaultModel) -> Result<OpenClawWriteOutcome, String> {
    let mut config = read_openclaw_config()?;
    let root = ensure_object(&mut config);
    let agents = root
        .entry("agents".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let defaults = ensure_object(agents)
        .entry("defaults".to_string())
        .or_insert_with(|| Value::Object(Map::new()));

    let model_value =
        serde_json::to_value(model).map_err(|e| format!("Failed to serialize model: {}", e))?;
    ensure_object(defaults).insert("model".to_string(), model_value);

    let agents_value = root
        .get("agents")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
    write_root_section("agents", &agents_value)
}

pub fn ensure_models_field() -> Result<OpenClawWriteOutcome, String> {
    let config = read_openclaw_config()?;

    if config.get("models").is_some() {
        return Ok(OpenClawWriteOutcome::default());
    }

    let models_value = json!({
        "mode": "merge",
        "providers": {}
    });
    write_root_section("models", &models_value)
}
