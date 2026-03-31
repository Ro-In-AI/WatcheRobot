use serde::Serialize;
use std::path::PathBuf;
use std::process::Child;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct ServerState {
    pub is_running: Arc<Mutex<bool>>,
    pub child: Arc<Mutex<Option<Child>>>,
    pub runtime_mode: Arc<Mutex<String>>,
}

impl Default for ServerState {
    fn default() -> Self {
        Self {
            is_running: Arc::new(Mutex::new(false)),
            child: Arc::new(Mutex::new(None)),
            runtime_mode: Arc::new(Mutex::new("unknown".to_string())),
        }
    }
}

pub(super) struct CommandSpec {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub current_dir: PathBuf,
    pub envs: Vec<(String, String)>,
    pub label: String,
    pub mode: String,
}

#[derive(Debug, Serialize)]
pub struct StartServerResult {
    pub mode: String,
    pub label: String,
    pub command: String,
}
