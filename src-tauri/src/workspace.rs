use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;

use serde::Serialize;

const MAX_FILES: usize = 400;
const MAX_FILE_BYTES: u64 = 512 * 1024;

const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "target",
    ".turbo",
    ".cache",
    ".venv",
    "venv",
];

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub path: String,
    pub language: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct LoadedFolder {
    #[serde(rename = "rootName")]
    pub root_name: String,
    #[serde(rename = "rootPath")]
    pub root_path: String,
    pub files: HashMap<String, FileEntry>,
}

fn language_for(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    match ext {
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "json" => "json",
        "md" => "markdown",
        "css" => "css",
        "scss" => "scss",
        "html" => "html",
        "rs" => "rust",
        "py" => "python",
        "go" => "go",
        "java" => "java",
        "yml" | "yaml" => "yaml",
        "toml" => "toml",
        "sh" => "shell",
        "sql" => "sql",
        _ => "plaintext",
    }
}

fn is_text_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    matches!(
        ext,
        "ts" | "tsx"
            | "js"
            | "jsx"
            | "mjs"
            | "cjs"
            | "json"
            | "md"
            | "css"
            | "scss"
            | "html"
            | "rs"
            | "py"
            | "go"
            | "java"
            | "yml"
            | "yaml"
            | "toml"
            | "sh"
            | "sql"
            | "txt"
            | "gitignore"
    ) || !name.contains('.')
}

fn pick_folder_dialog() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let out = Command::new("osascript")
            .args([
                "-e",
                "try",
                "-e",
                "POSIX path of (choose folder with prompt \"Open folder in Web IDE\")",
                "-e",
                "on error",
                "-e",
                "return \"\"",
                "-e",
                "end try",
            ])
            .output()
            .map_err(|e| format!("osascript: {e}"))?;
        let s = String::from_utf8_lossy(&out.stdout)
            .trim()
            .trim_end_matches('/')
            .to_string();
        return Ok(if s.is_empty() { None } else { Some(s) });
    }
    #[cfg(target_os = "linux")]
    {
        let out = Command::new("zenity")
            .args([
                "--file-selection",
                "--directory",
                "--title=Open folder in Web IDE",
            ])
            .output()
            .map_err(|e| format!("zenity not available: {e}"))?;
        if !out.status.success() {
            return Ok(None);
        }
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return Ok(if s.is_empty() { None } else { Some(s) });
    }
    #[cfg(target_os = "windows")]
    {
        let ps = "Add-Type -AssemblyName System.Windows.Forms | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }";
        let out = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps])
            .output()
            .map_err(|e| format!("powershell: {e}"))?;
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return Ok(if s.is_empty() { None } else { Some(s) });
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("folder picker not supported on this platform".into())
    }
}

fn walk_dir(
    current: &Path,
    prefix: &str,
    out: &mut HashMap<String, FileEntry>,
) {
    if out.len() >= MAX_FILES {
        return;
    }
    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_FILES {
            return;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let path_str = format!("{prefix}/{name}");
        if ft.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                continue;
            }
            walk_dir(&entry.path(), &path_str, out);
            continue;
        }
        if !ft.is_file() {
            continue;
        }
        if !is_text_name(&name) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() > MAX_FILE_BYTES {
            continue;
        }
        let content = match fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue,
        };
        out.insert(
            path_str.clone(),
            FileEntry {
                path: path_str,
                language: language_for(&name).into(),
                content,
            },
        );
    }
}

#[tauri::command]
pub async fn pick_and_load_folder() -> Result<Option<LoadedFolder>, String> {
    let path = match pick_folder_dialog()? {
        Some(p) => p,
        None => return Ok(None),
    };
    let root_path = Path::new(&path);
    let root_name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let mut files: HashMap<String, FileEntry> = HashMap::new();
    walk_dir(root_path, &root_name, &mut files);
    Ok(Some(LoadedFolder {
        root_name,
        root_path: path,
        files,
    }))
}
