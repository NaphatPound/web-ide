use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;

use parking_lot::Mutex;
use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyRegistry {
    pub sessions: Mutex<HashMap<String, Arc<Mutex<PtySession>>>>,
}

#[derive(Serialize, Clone)]
pub struct PtyDataEvent {
    pub id: String,
    pub data: String,
}

#[derive(Serialize, Clone)]
pub struct PtyExitEvent {
    pub id: String,
    pub code: Option<u32>,
}

fn default_shell() -> String {
    if cfg!(target_os = "windows") {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    }
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    registry: State<'_, PtyRegistry>,
    cols: u16,
    rows: u16,
    shell: Option<String>,
    cwd: Option<String>,
    initial_cmd: Option<String>,
) -> Result<String, String> {
    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty: {e}"))?;

    let shell_cmd = shell.unwrap_or_else(default_shell);
    let mut cmd = CommandBuilder::new(shell_cmd);
    if let Some(cwd) = cwd {
        cmd.cwd(cwd);
    } else if let Ok(cwd) = std::env::current_dir() {
        cmd.cwd(cwd);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn: {e}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("reader: {e}"))?;
    let mut writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("writer: {e}"))?;

    if let Some(cmd) = initial_cmd {
        let trimmed = cmd.trim_end();
        if !trimmed.is_empty() {
            let mut line = String::with_capacity(trimmed.len() + 1);
            line.push_str(trimmed);
            line.push('\n');
            let _ = writer.write_all(line.as_bytes());
            let _ = writer.flush();
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let session = Arc::new(Mutex::new(PtySession {
        master: pair.master,
        writer,
        child,
    }));

    registry.sessions.lock().insert(id.clone(), session.clone());

    let read_id = id.clone();
    let read_app = app.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = read_app.emit(
                        "pty:data",
                        PtyDataEvent {
                            id: read_id.clone(),
                            data: chunk,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = read_app.emit(
            "pty:exit",
            PtyExitEvent {
                id: read_id.clone(),
                code: None,
            },
        );
    });

    Ok(id)
}

#[tauri::command]
pub fn pty_write(
    registry: State<'_, PtyRegistry>,
    id: String,
    data: String,
) -> Result<(), String> {
    let session = registry
        .sessions
        .lock()
        .get(&id)
        .cloned()
        .ok_or_else(|| format!("no pty: {id}"))?;
    session
        .lock()
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    registry: State<'_, PtyRegistry>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = registry
        .sessions
        .lock()
        .get(&id)
        .cloned()
        .ok_or_else(|| format!("no pty: {id}"))?;
    session
        .lock()
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn pty_kill(registry: State<'_, PtyRegistry>, id: String) -> Result<(), String> {
    let session = registry.sessions.lock().remove(&id);
    if let Some(session) = session {
        let _ = session.lock().child.kill();
    }
    Ok(())
}
