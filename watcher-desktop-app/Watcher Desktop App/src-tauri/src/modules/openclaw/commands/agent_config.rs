use crate::modules::openclaw::agent_config;
use serde_json::Value;

#[tauri::command]
pub fn get_openclaw_agents_defaults() -> Result<Option<agent_config::OpenClawAgentsDefaults>, String>
{
    agent_config::get_agents_defaults()
}

#[tauri::command]
pub fn get_openclaw_agents() -> Result<Value, String> {
    agent_config::get_agents()
}

#[tauri::command]
pub fn get_openclaw_agent_skills(
    agent_id: String,
) -> Result<agent_config::OpenClawAgentSkillsInventory, String> {
    agent_config::get_agent_skills(&agent_id)
}

#[tauri::command]
pub async fn install_openclaw_agent_skill(
    agent_id: String,
    skill_slug: String,
) -> Result<agent_config::OpenClawAgentSkillsInventory, String> {
    tauri::async_runtime::spawn_blocking(move || {
        agent_config::install_agent_skill(&agent_id, &skill_slug)
    })
    .await
    .map_err(|error| format!("Failed to join OpenClaw install task: {}", error))?
}

#[tauri::command]
pub fn set_openclaw_agent(
    agent_id: String,
    agent: Value,
) -> Result<agent_config::OpenClawWriteOutcome, String> {
    agent_config::set_agent(&agent_id, agent)
}

#[tauri::command]
pub fn remove_openclaw_agent(
    agent_id: String,
) -> Result<agent_config::OpenClawWriteOutcome, String> {
    agent_config::remove_agent(&agent_id)
}

#[tauri::command]
pub fn get_openclaw_agent_workspace_docs(agent_id: String) -> Result<Value, String> {
    agent_config::get_agent_workspace_docs(&agent_id)
}

#[tauri::command]
pub fn set_openclaw_agent_workspace_doc(
    agent_id: String,
    file_name: String,
    content: String,
) -> Result<(), String> {
    agent_config::set_agent_workspace_doc(&agent_id, &file_name, &content)
}

#[tauri::command]
pub fn get_openclaw_session_bindings_overview(
) -> Result<agent_config::OpenClawSessionBindingsOverview, String> {
    agent_config::get_session_bindings_overview()
}

#[tauri::command]
pub fn set_openclaw_session_binding(
    agent_id: Option<String>,
    r#match: agent_config::OpenClawSessionBindingMatch,
) -> Result<agent_config::OpenClawWriteOutcome, String> {
    agent_config::set_session_binding(agent_id.as_deref(), &r#match)
}

#[tauri::command]
pub fn set_openclaw_agents_defaults(
    defaults: agent_config::OpenClawAgentsDefaults,
) -> Result<agent_config::OpenClawWriteOutcome, String> {
    agent_config::set_agents_defaults(&defaults)
}
