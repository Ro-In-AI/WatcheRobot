mod app;
mod modules;
mod shared;

use modules::{openclaw::chat::OpenClawChatState, server::service::ServerState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OpenClawChatState::default())
        .manage(ServerState::default())
        .invoke_handler(tauri::generate_handler![
            app::commands::get_integration_paths,
            app::commands::debug_log,
            modules::installer::commands::check_environment,
            modules::installer::commands::start_installation,
            modules::openclaw::commands::model_config::get_openclaw_provider_ids,
            modules::openclaw::commands::model_config::get_openclaw_provider,
            modules::openclaw::commands::model_config::set_openclaw_provider,
            modules::openclaw::commands::model_config::remove_openclaw_provider,
            modules::openclaw::commands::model_config::get_openclaw_default_model,
            modules::openclaw::commands::model_config::set_openclaw_default_model,
            modules::openclaw::commands::agent_config::get_openclaw_agents_defaults,
            modules::openclaw::commands::agent_config::get_openclaw_agents,
            modules::openclaw::commands::agent_config::get_openclaw_agent_skills,
            modules::openclaw::commands::agent_config::install_openclaw_agent_skill,
            modules::openclaw::commands::agent_config::set_openclaw_agent,
            modules::openclaw::commands::agent_config::remove_openclaw_agent,
            modules::openclaw::commands::agent_config::get_openclaw_agent_workspace_docs,
            modules::openclaw::commands::agent_config::set_openclaw_agent_workspace_doc,
            modules::openclaw::commands::agent_config::get_openclaw_session_bindings_overview,
            modules::openclaw::commands::agent_config::set_openclaw_session_binding,
            modules::openclaw::commands::agent_config::set_openclaw_agents_defaults,
            modules::openclaw::commands::runtime_settings::get_openclaw_env,
            modules::openclaw::commands::runtime_settings::set_openclaw_env,
            modules::openclaw::commands::runtime_settings::get_openclaw_tools,
            modules::openclaw::commands::runtime_settings::set_openclaw_tools,
            modules::openclaw::commands::runtime_settings::scan_openclaw_health,
            modules::openclaw::commands::model_config::get_openclaw_models,
            modules::openclaw::commands::model_config::ensure_openclaw_models_field,
            modules::openclaw::commands::model_config::get_openclaw_config,
            modules::openclaw::commands::model_config::set_openclaw_config,
            modules::openclaw::commands::chat::openclaw_chat_connect,
            modules::openclaw::commands::chat::openclaw_chat_disconnect,
            modules::openclaw::commands::chat::openclaw_chat_gateway_health,
            modules::openclaw::commands::chat::openclaw_chat_start_gateway,
            modules::openclaw::commands::chat::openclaw_chat_list_sessions,
            modules::openclaw::commands::chat::openclaw_chat_get_history,
            modules::openclaw::commands::chat::openclaw_chat_send_message,
            modules::openclaw::commands::chat::openclaw_chat_abort_session,
            modules::openclaw::commands::chat::openclaw_chat_delete_session,
            modules::server::commands::start_server,
            modules::server::commands::stop_server,
            modules::server::commands::is_server_running,
            modules::server::commands::get_server_runtime_mode
        ])
        .run(tauri::generate_context!())
        .expect("error while running watcher desktop");
}
