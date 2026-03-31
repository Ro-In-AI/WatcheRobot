use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentStatus {
    pub nodejs: ComponentStatus,
    pub openclaw: ComponentStatus,
    pub tools: ToolsStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentStatus {
    pub installed: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolsStatus {
    pub curl: bool,
    pub tar: bool,
    pub ca_certificates: bool,
}
