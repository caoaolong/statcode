#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

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

const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".venv",
    "venv",
    ".idea",
    ".vscode",
    ".next",
    ".nuxt",
    "vendor",
    "bin",
    "obj",
];

fn should_skip_dir(name: &str) -> bool {
    IGNORED_DIRS.contains(&name)
}

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

    let mut type_map: HashMap<String, FileAnalysis> = HashMap::new();
    let mut total_files: u32 = 0;
    let mut total_lines: u32 = 0;
    let mut total_bytes: u64 = 0;

    for entry in WalkDir::new(&path)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_str().unwrap_or("");
            !should_skip_dir(name)
        })
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![analyze_code, get_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
