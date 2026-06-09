#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use ignore::WalkBuilder;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
pub struct FileAnalysis {
    pub extension: String,
    pub file_count: u32,
    pub total_lines: u32,
    pub total_bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct AnalysisResult {
    pub project_path: String,
    pub project_name: String,
    pub total_files: u32,
    pub total_lines: u32,
    pub total_bytes: u64,
    pub by_type: Vec<FileAnalysis>,
}

const STCIGNORE_FILENAME: &str = ".stcignore";

fn count_lines(content: &str) -> u32 {
    if content.is_empty() {
        return 0;
    }
    content.lines().count() as u32
}

fn get_extension(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("no_extension")
        .to_lowercase()
}

#[tauri::command]
fn analyze_code(path: String) -> Result<AnalysisResult, String> {
    let project_path = Path::new(&path);
    if !project_path.exists() || !project_path.is_dir() {
        return Err("路径不存在或不是目录".to_string());
    }

    let project_name = project_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let has_stcignore = project_path.join(STCIGNORE_FILENAME).is_file();

    let mut walker = WalkBuilder::new(&path);
    walker
        .standard_filters(true)
        .add_custom_ignore_filename(STCIGNORE_FILENAME);
    if !has_stcignore {
        walker.ignore(true);
    }

    let mut type_map: HashMap<String, FileAnalysis> = HashMap::new();
    let mut total_files: u32 = 0;
    let mut total_lines: u32 = 0;
    let mut total_bytes: u64 = 0;

    for entry in walker.build().flatten() {
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }

        let file_path = entry.path();

        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let ext = get_extension(file_path);
        let lines = count_lines(&content);
        let bytes = content.len() as u64;

        total_files += 1;
        total_lines += lines;
        total_bytes += bytes;

        let analysis = type_map.entry(ext.clone()).or_insert(FileAnalysis {
            extension: ext,
            file_count: 0,
            total_lines: 0,
            total_bytes: 0,
        });
        analysis.file_count += 1;
        analysis.total_lines += lines;
        analysis.total_bytes += bytes;
    }

    let mut by_type: Vec<FileAnalysis> = type_map.into_values().collect();
    by_type.sort_by(|a, b| b.total_lines.cmp(&a.total_lines));

    Ok(AnalysisResult {
        project_path: path,
        project_name,
        total_files,
        total_lines,
        total_bytes,
        by_type,
    })
}

#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[derive(serde::Serialize)]
struct LspDetection {
    id: String,
    available: bool,
    version: Option<String>,
    path: Option<String>,
    error: Option<String>,
}

fn detect_command(commands: &[&str], version_args: &[&str]) -> LspDetection {
    let mut last_err: Option<String> = None;
    for cmd in commands {
        let mut candidate = std::process::Command::new(cmd);
        candidate
            .args(version_args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        match candidate.output() {
            Ok(out) if out.status.success() => {
                let version = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .next()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());
                return LspDetection {
                    id: cmd.to_string(),
                    available: true,
                    version,
                    path: Some(cmd.to_string()),
                    error: None,
                };
            }
            Ok(out) => {
                last_err = Some(
                    String::from_utf8_lossy(&out.stderr)
                        .lines()
                        .next()
                        .map(|s| s.trim().to_string())
                        .unwrap_or_default(),
                );
            }
            Err(e) => {
                last_err = Some(e.to_string());
            }
        }
    }
    LspDetection {
        id: commands.first().copied().unwrap_or("").to_string(),
        available: false,
        version: None,
        path: None,
        error: last_err,
    }
}

#[tauri::command]
fn detect_lsp_servers() -> Vec<LspDetection> {
    vec![
        detect_command(&["rust-analyzer"], &["--version"]),
        detect_command(
            &["typescript-language-server", "typescript-language-server.cmd"],
            &["--version"],
        ),
    ]
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![analyze_code, get_version, detect_lsp_servers])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
