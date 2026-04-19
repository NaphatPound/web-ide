use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum StartupAction {
    OpenFiles { files: Vec<String> },
    SetMode { mode: String },
    RunTerminal { commands: Vec<RunTerminalCommand> },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RunTerminalCommand {
    pub title: String,
    pub cmd: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StartupConfig {
    pub startup: Vec<StartupAction>,
}

fn default_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join(".ide-startup.yaml"));
        if let Some(parent) = cwd.parent() {
            paths.push(parent.join(".ide-startup.yaml"));
        }
    }
    paths
}

#[tauri::command]
pub fn read_startup_config() -> Result<Option<StartupConfig>, String> {
    for path in default_paths() {
        if path.is_file() {
            let raw = std::fs::read_to_string(&path)
                .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
            let cfg: StartupConfig = serde_yaml::from_str(&raw)
                .map_err(|e| format!("invalid yaml in {}: {e}", path.display()))?;
            return Ok(Some(cfg));
        }
    }
    Ok(None)
}
