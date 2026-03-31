use crate::modules::openclaw::runtime_settings;

use super::shell::{
    check_ca_certificates, check_command_exists_candidates, check_command_version, command_exists,
    openclaw_command_candidates,
};
use super::types::{ComponentStatus, EnvironmentStatus, ToolsStatus};

pub fn check_environment() -> Result<EnvironmentStatus, String> {
    let nodejs = check_command_version(&["node"], "--version")
        .map(|version| ComponentStatus {
            installed: true,
            version: Some(version.trim().trim_start_matches('v').to_string()),
        })
        .unwrap_or(ComponentStatus {
            installed: false,
            version: None,
        });

    let openclaw = check_command_version(&openclaw_command_candidates(), "--version")
        .map(|version| ComponentStatus {
            installed: true,
            version: Some(version.trim().to_string()),
        })
        .or_else(|| {
            check_command_exists_candidates(&openclaw_command_candidates()).then_some(
                ComponentStatus {
                    installed: true,
                    version: None,
                },
            )
        })
        .unwrap_or(ComponentStatus {
            installed: false,
            version: None,
        });

    if openclaw.installed {
        let _ = runtime_settings::ensure_runtime_defaults();
    }

    let tools = ToolsStatus {
        curl: command_exists("curl"),
        tar: command_exists("tar"),
        ca_certificates: check_ca_certificates(),
    };

    Ok(EnvironmentStatus {
        nodejs,
        openclaw,
        tools,
    })
}
