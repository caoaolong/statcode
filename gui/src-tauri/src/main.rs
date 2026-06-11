#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::Duration;
use std::env;
use tauri::{Manager, Emitter};

/// How long `read_response` will wait for the matching LSP response before
/// returning an error. rust-analyzer's first `documentSymbol` request can be
/// queued behind workspace indexing, so this is intentionally generous.
const LSP_READ_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileAnalysis {
    pub extension: String,
    pub file_count: u32,
    pub total_lines: u32,
    pub total_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnalysisResult {
    pub project_path: String,
    pub project_name: String,
    pub total_files: u32,
    pub total_lines: u32,
    pub total_bytes: u64,
    pub by_type: Vec<FileAnalysis>,
}

const STCIGNORE_FILENAME: &str = ".stcignore";

/// Build a WalkBuilder for the given path.
/// If the project has a `.stcignore`, it takes priority.
/// Otherwise, if `ignore_rules` is provided, write them to a temp file and use it.
fn build_walker(path: &str, ignore_rules: &Option<String>) -> (WalkBuilder, Option<std::path::PathBuf>) {
    let project_path = Path::new(path);
    let has_stcignore = project_path.join(STCIGNORE_FILENAME).is_file();

    let mut walker = WalkBuilder::new(path);
    walker.standard_filters(true);

    let mut temp_file: Option<std::path::PathBuf> = None;

    if has_stcignore {
        // Project-level .stcignore takes priority
        walker.add_custom_ignore_filename(STCIGNORE_FILENAME);
    } else if let Some(rules) = ignore_rules {
        if !rules.trim().is_empty() {
            // Write shared rules to a temp file (not in the project directory)
            let temp_path = env::temp_dir().join(format!("stcignore_{}.tmp", std::process::id()));
            if fs::write(&temp_path, rules).is_ok() {
                walker.add_custom_ignore_filename(&temp_path);
                temp_file = Some(temp_path);
            }
        }
    }

    (walker, temp_file)
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
fn analyze_code(path: String, ignore_rules: Option<String>) -> Result<AnalysisResult, String> {
    let project_path = Path::new(&path);
    if !project_path.exists() || !project_path.is_dir() {
        return Err("路径不存在或不是目录".to_string());
    }

    let project_name = project_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let (walker, _temp_file) = build_walker(&path, &ignore_rules);

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

#[derive(Serialize)]
struct LspServerInfo {
    id: String,
    language: String,
    command: String,
    args: Vec<String>,
    extensions: Vec<String>,
    available: bool,
    version: Option<String>,
    path: Option<String>,
    error: Option<String>,
}

#[tauri::command]
fn detect_lsp_servers() -> Vec<LspServerInfo> {
    let defs: Vec<(&str, &str, &[&str], &[&str], &[&str], &[&str])> = vec![
        ("rust-analyzer", "Rust", &["rust-analyzer"], &["--version"], &[".rs"], &[]),
        (
            "typescript-language-server",
            "TypeScript / JavaScript",
            &["typescript-language-server", "typescript-language-server.cmd"],
            &["--version"],
            &[".ts", ".tsx", ".js", ".jsx"],
            &["--stdio"],
        ),
        (
            "pyright",
            "Python",
            &["pyright-langserver", "pyright"],
            &["--version"],
            &[".py"],
            &[],
        ),
        ("gopls", "Go", &["gopls"], &["version"], &[".go"], &[]),
        (
            "clangd",
            "C / C++",
            &["clangd"],
            &["--version"],
            &[".c", ".cc", ".cpp", ".cxx", ".h", ".hpp"],
            &[],
        ),
        (
            "jdtls",
            "Java",
            &["jdtls"],
            &["--version"],
            &[".java"],
            &[],
        ),
        (
            "csharp-ls",
            "C#",
            &["csharp-language-server", "csharp-ls"],
            &["--version"],
            &[".cs"],
            &[],
        ),
        (
            "lua-ls",
            "Lua",
            &["lua-language-server"],
            &["--version"],
            &[".lua"],
            &["--stdio"],
        ),
    ];

    defs.into_iter()
        .map(|(id, lang, cmds, ver_args, exts, lsp_args)| {
            let det = detect_command(cmds, ver_args);
            LspServerInfo {
                id: id.to_string(),
                language: lang.to_string(),
                command: cmds[0].to_string(),
                args: lsp_args.iter().map(|s| s.to_string()).collect(),
                extensions: exts.iter().map(|s| s.to_string()).collect(),
                available: det.available,
                version: det.version,
                path: det.path,
                error: det.error,
            }
        })
        .collect()
}

// ── LSP Client ────────────────────────────────────────────────────────

static LSP_REQ_ID: AtomicI64 = AtomicI64::new(1);

struct LspClient {
    child: Child,
    receiver: mpsc::Receiver<serde_json::Value>,
}

impl LspClient {
    fn spawn(command: &str, args: &[String]) -> Result<Self, String> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("启动 LSP 服务器失败: {}", e))?;
        let stdout = child.stdout.take().ok_or("无法获取 stdout")?;
        let (tx, rx) = mpsc::channel();

        // Dedicated reader thread: parses LSP messages off stdout and pushes
        // them onto a channel. Keeping this off the main thread lets
        // `read_response` use `recv_timeout` to bound how long we wait for
        // each request (rust-analyzer in particular can sit in workspace
        // indexing for a long time before answering `documentSymbol`).
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut content_length: Option<usize> = None;
                loop {
                    let mut header = String::new();
                    match reader.read_line(&mut header) {
                        Ok(0) => return, // EOF
                        Ok(_) => {}
                        Err(_) => return,
                    }
                    let header = header.trim();
                    if header.is_empty() {
                        break;
                    }
                    if let Some(val) = header.strip_prefix("Content-Length: ") {
                        content_length = val.parse().ok();
                    }
                }

                let length = match content_length {
                    Some(l) => l,
                    None => continue,
                };

                let mut body = vec![0u8; length];
                if reader.read_exact(&mut body).is_err() {
                    return;
                }

                let value: serde_json::Value = match serde_json::from_slice(&body) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                if tx.send(value).is_err() {
                    return; // main thread dropped receiver, client is gone
                }
            }
        });

        Ok(Self { child, receiver: rx })
    }

    fn send_request(&mut self, method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
        let id = LSP_REQ_ID.fetch_add(1, Ordering::SeqCst);
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        self.send_message(&msg)?;
        self.read_response(id)
    }

    fn send_notification(&mut self, method: &str, params: serde_json::Value) -> Result<(), String> {
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        self.send_message(&msg)
    }

    fn send_message(&mut self, msg: &serde_json::Value) -> Result<(), String> {
        let body = serde_json::to_string(msg).map_err(|e| e.to_string())?;
        let stdin = self.child.stdin.as_mut().ok_or("无法写入 stdin")?;
        write!(stdin, "Content-Length: {}\r\n\r\n{}", body.len(), body)
            .map_err(|e| format!("写入失败: {}", e))?;
        stdin.flush().map_err(|e| format!("刷新失败: {}", e))?;
        Ok(())
    }

    fn read_response(&mut self, expected_id: i64) -> Result<serde_json::Value, String> {
        loop {
            let value = match self.receiver.recv_timeout(LSP_READ_TIMEOUT) {
                Ok(v) => v,
                Err(RecvTimeoutError::Timeout) => {
                    return Err(format!(
                        "LSP 响应超时 ({:?}), 服务器可能正在索引大型工作区 (rust-analyzer) 或已卡住",
                        LSP_READ_TIMEOUT
                    ));
                }
                Err(RecvTimeoutError::Disconnected) => {
                    return Err("LSP 服务器意外关闭 (进程已退出)".to_string());
                }
            };

            // Server-to-client request (has method + id): the server is
            // single-threaded and blocks waiting for our reply. We don't
            // implement any of these (e.g. client/registerCapability,
            // window/workDoneProgress/create, workspace/configuration), so ack
            // with MethodNotFound to unblock it.
            if value.get("method").is_some() {
                if let Some(id) = value.get("id").and_then(|v| v.as_i64()) {
                    let err_resp = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": { "code": -32601, "message": "Method not found" }
                    });
                    self.send_message(&err_resp)?;
                }
                continue;
            }

            // Notification (no id): skip
            if value.get("id").is_none() {
                continue;
            }

            let resp_id = value["id"].as_i64().unwrap_or(-1);
            if resp_id == expected_id {
                if let Some(err) = value.get("error") {
                    return Err(format!("LSP 错误: {}", err));
                }
                return Ok(value.get("result").cloned().unwrap_or(serde_json::Value::Null));
            }
            // Response with mismatched id (not initiated by us): skip
        }
    }

    fn shutdown(mut self) -> Result<(), String> {
        let _ = self.send_request("shutdown", serde_json::Value::Null);
        let _ = self.send_notification("exit", serde_json::Value::Null);
        let _ = self.child.wait();
        Ok(())
    }
}

// ── Symbol extraction types ───────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct SymbolInfo {
    name: String,
    kind: String,
    file_path: String,
    line: u32,
    column: u32,
    reference_count: u32,
    detail: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct SymbolAnalysisResult {
    language: String,
    symbols: Vec<SymbolInfo>,
    total_symbols: u32,
    files_scanned: u32,
}

fn lsp_symbol_kind_name(kind: i32) -> &'static str {
    match kind {
        1 => "File",
        2 => "Module",
        3 => "Namespace",
        4 => "Package",
        5 => "Class",
        6 => "Method",
        7 => "Property",
        8 => "Field",
        9 => "Constructor",
        10 => "Enum",
        11 => "Interface",
        12 => "Function",
        13 => "Variable",
        14 => "Constant",
        15 => "String",
        16 => "Number",
        17 => "Boolean",
        18 => "Array",
        19 => "Object",
        20 => "Key",
        21 => "Null",
        22 => "EnumMember",
        23 => "Struct",
        24 => "Event",
        25 => "Operator",
        26 => "TypeParameter",
        _ => "Unknown",
    }
}

/// Kinds for which we query references
fn should_query_references(kind: i32) -> bool {
    matches!(kind, 2 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 22 | 23 | 26)
    // Module(2) Class(5) Method(6) Property(7) Field(8) Constructor(9)
    // Enum(10) Interface(11) Function(12) Variable(13) Constant(14)
    // EnumMember(22) Struct(23) TypeParameter(26)
}

#[tauri::command]
async fn extract_symbols(
    project_path: String,
    language: String,
    command: String,
    args: Vec<String>,
    extensions: Vec<String>,
    ignore_rules: Option<String>,
) -> Result<SymbolAnalysisResult, String> {
    // Collect matching files
    let project_root = Path::new(&project_path);
    if !project_root.exists() || !project_root.is_dir() {
        return Err("路径不存在或不是目录".to_string());
    }

    let (walker, _temp_file) = build_walker(&project_path, &ignore_rules);

    let ext_set: std::collections::HashSet<String> =
        extensions.iter().map(|e| e.trim_start_matches('.').to_lowercase()).collect();

    let mut files: Vec<String> = Vec::new();
    for entry in walker.build().flatten() {
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let ext = get_extension(entry.path());
        if ext_set.contains(&ext) {
            if let Some(p) = entry.path().to_str() {
                files.push(p.to_string());
            }
        }
    }

    let files_scanned = files.len() as u32;
    if files.is_empty() {
        return Ok(SymbolAnalysisResult {
            language,
            symbols: Vec::new(),
            total_symbols: 0,
            files_scanned: 0,
        });
    }

    // Spawn LSP
    let mut client = LspClient::spawn(&command, &args)?;

    // Initialize
    let root_uri = format!("file:///{}", project_path.replace('\\', "/"));
    let init_params = serde_json::json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": {
            "textDocument": {
                "documentSymbol": {
                    "dynamicRegistration": false,
                    "hierarchicalDocumentSymbolSupport": true,
                    "symbolKind": { "valueSet": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26] }
                },
                "references": { "dynamicRegistration": false }
            }
        }
    });
    client.send_request("initialize", init_params)?;
    client.send_notification("initialized", serde_json::json!({}))?;

    // Give the server a moment to initialize
    std::thread::sleep(std::time::Duration::from_millis(500));

    let mut all_symbols: Vec<SymbolInfo> = Vec::new();

    for file_path in &files {
        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let uri = format!("file:///{}", file_path.replace('\\', "/"));
        let language_id = match language.as_str() {
            "Rust" => "rust",
            "TypeScript / JavaScript" => "typescript",
            "Python" => "python",
            "Go" => "go",
            "C / C++" => "cpp",
            "Java" => "java",
            "C#" => "csharp",
            "Lua" => "lua",
            _ => "plaintext",
        };

        // didOpen
        let _ = client.send_notification(
            "textDocument/didOpen",
            serde_json::json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id,
                    "version": 1,
                    "text": content
                }
            }),
        );

        // documentSymbol
        let symbols_result = client.send_request(
            "textDocument/documentSymbol",
            serde_json::json!({
                "textDocument": { "uri": uri }
            }),
        );

        if let Ok(symbols_value) = symbols_result {
            let symbol_list = if symbols_value.is_array() {
                symbols_value.as_array().cloned().unwrap_or_default()
            } else {
                Vec::new()
            };

            // Flatten nested symbols (DocumentSymbol has children)
            let mut flat_symbols: Vec<(String, i32, u32, u32, String, String)> = Vec::new();
            flatten_symbols(&symbol_list, "", &mut flat_symbols);

            for (name, kind, line, col, detail, parent) in flat_symbols {
                // Query references for meaningful symbols
                let ref_count = if should_query_references(kind) {
                    match client.send_request(
                        "textDocument/references",
                        serde_json::json!({
                            "textDocument": { "uri": uri },
                            "position": { "line": line, "character": col },
                            "context": { "includeDeclaration": true }
                        }),
                    ) {
                        Ok(refs) => refs.as_array().map(|a| a.len() as u32).unwrap_or(0),
                        Err(_) => 0,
                    }
                } else {
                    0
                };

                // Build meaningful detail string
                let kind_name = lsp_symbol_kind_name(kind);
                // Use LSP detail if available, otherwise extract from source
                let effective_detail = if detail.is_empty() {
                    extract_detail_from_source(&content, kind, line)
                } else {
                    detail.clone()
                };
                let detail_str = match kind_name {
                    "Method" | "Field" | "Property" => {
                        if !parent.is_empty() && !effective_detail.is_empty() {
                            format!("{} · {}", parent, effective_detail)
                        } else if !parent.is_empty() {
                            parent.clone()
                        } else {
                            effective_detail
                        }
                    }
                    "EnumMember" => {
                        if !parent.is_empty() {
                            format!("{}::{}", parent, name)
                        } else {
                            effective_detail
                        }
                    }
                    _ => effective_detail,
                };

                all_symbols.push(SymbolInfo {
                    name,
                    kind: kind_name.to_string(),
                    file_path: file_path.clone(),
                    line: line + 1, // LSP is 0-based, display as 1-based
                    column: col + 1,
                    reference_count: ref_count,
                    detail: detail_str,
                });
            }
        }

        // didClose
        let _ = client.send_notification(
            "textDocument/didClose",
            serde_json::json!({ "textDocument": { "uri": uri } }),
        );
    }

    let total_symbols = all_symbols.len() as u32;
    client.shutdown()?;

    Ok(SymbolAnalysisResult {
        language,
        symbols: all_symbols,
        total_symbols,
        files_scanned,
    })
}

fn flatten_symbols(symbols: &[serde_json::Value], parent: &str, out: &mut Vec<(String, i32, u32, u32, String, String)>) {
    for sym in symbols {
        let name = sym["name"].as_str().unwrap_or("").to_string();
        let kind = sym["kind"].as_i64().unwrap_or(0) as i32;
        let detail = sym["detail"].as_str().unwrap_or("").to_string();

        // Try DocumentSymbol format
        if let Some(range) = sym.get("range") {
            // Use selectionRange (identifier position) for references queries,
            // fall back to range (full declaration) if selectionRange is absent.
            let sel = sym.get("selectionRange").unwrap_or(range);
            let line = sel["start"]["line"].as_u64().unwrap_or_else(|| range["start"]["line"].as_u64().unwrap_or(0)) as u32;
            let col = sel["start"]["character"].as_u64().unwrap_or_else(|| range["start"]["character"].as_u64().unwrap_or(0)) as u32;
            out.push((name.clone(), kind, line, col, detail, parent.to_string()));
        }
        // Try SymbolInformation format (has location.range.start)
        else if let Some(location) = sym.get("location") {
            let line = location["range"]["start"]["line"].as_u64().unwrap_or(0) as u32;
            let col = location["range"]["start"]["character"].as_u64().unwrap_or(0) as u32;
            out.push((name.clone(), kind, line, col, detail, parent.to_string()));
        }

        // Recurse into children (DocumentSymbol) — current name becomes parent
        if let Some(children) = sym.get("children").and_then(|c| c.as_array()) {
            flatten_symbols(children, &name, out);
        }
    }
}

/// Extract a meaningful detail snippet from source code for a symbol.
fn extract_detail_from_source(content: &str, kind: i32, line: u32) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let line_idx = line as usize;
    if line_idx >= lines.len() {
        return String::new();
    }

    let kind_name = lsp_symbol_kind_name(kind);
    let start_line = lines[line_idx];

    match kind_name {
        "Function" | "Method" | "Constructor" => {
            // Find 'fn' keyword from the symbol position, scan forward
            // Try to find the full signature: collect lines until we see '{' or ';'
            let mut sig = String::new();
            let mut found_brace = false;
            for i in line_idx..lines.len().min(line_idx + 10) {
                let l = lines[i].trim();
                if i == line_idx {
                    // From 'fn' onwards
                    if let Some(pos) = l.find("fn ") {
                        sig = l[pos..].to_string();
                    } else if let Some(pos) = l.find("pub ") {
                        sig = l[pos..].to_string();
                    } else {
                        sig = l.to_string();
                    }
                } else {
                    sig.push(' ');
                    sig.push_str(l);
                }
                if sig.contains('{') {
                    sig = sig.split('{').next().unwrap_or(&sig).trim().to_string();
                    found_brace = true;
                    break;
                }
                if sig.contains(';') {
                    sig = sig.split(';').next().unwrap_or(&sig).trim().to_string();
                    found_brace = true;
                    break;
                }
            }
            if !found_brace {
                sig = sig.trim().to_string();
            }
            // Remove trailing '{' and clean up
            sig.trim_end_matches('{').trim().to_string()
        }
        "Constant" | "Variable" | "Static" => {
            // Extract the declaration line
            let trimmed = start_line.trim();
            trimmed.to_string()
        }
        "Field" | "Property" => {
            // Extract field declaration
            let trimmed = start_line.trim();
            trimmed.trim_end_matches(',').to_string()
        }
        "Struct" | "Enum" | "Interface" | "Class" => {
            // Just the definition line
            let trimmed = start_line.trim();
            if let Some(pos) = trimmed.find('{') {
                trimmed[..pos].trim().to_string()
            } else {
                trimmed.to_string()
            }
        }
        _ => String::new(),
    }
}

// ── System Font Scanning ─────────────────────────────────────────────

#[derive(Serialize)]
struct FontInfo {
    name: String,
    #[serde(rename = "type")]
    font_type: String,
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn scan_system_fonts() -> Result<Vec<FontInfo>, String> {
    use winapi::shared::minwindef::HKEY;
    use winapi::um::winnt::{KEY_READ, REG_SZ};
    use winapi::um::winreg::{RegOpenKeyExW, RegCloseKey, HKEY_LOCAL_MACHINE};
    use std::ptr;

    let subkey: Vec<u16> = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
        .encode_utf16()
        .collect();

    let mut hkey: HKEY = ptr::null_mut();
    let result = unsafe {
        RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            subkey.as_ptr(),
            0,
            KEY_READ,
            &mut hkey,
        )
    };
    if result != 0 {
        return Err(format!("无法打开注册表键: 错误码 {}", result));
    }

    let mut fonts: Vec<FontInfo> = Vec::new();
    let mut index: u32 = 0;
    let mut name_buf = [0u16; 512];
    let mut value_buf = [0u16; 1024];

    loop {
        let mut name_len = name_buf.len() as u32;
        let mut value_len = (value_buf.len() * 2) as u32;
        let mut value_type: u32 = 0;

        let ret = unsafe {
            winapi::um::winreg::RegEnumValueW(
                hkey,
                index,
                name_buf.as_mut_ptr(),
                &mut name_len,
                ptr::null_mut(),
                &mut value_type,
                value_buf.as_mut_ptr() as *mut u8,
                &mut value_len,
            )
        };

        if ret != 0 {
            break;
        }

        if value_type == REG_SZ && name_len > 0 {
            let display_name = String::from_utf16_lossy(&name_buf[..name_len as usize]);

            // Extract font family name: "Arial (TrueType)" → "Arial"
            let family = display_name
                .split(" (")
                .next()
                .unwrap_or(&display_name)
                .trim()
                .to_string();

            // Determine font type from the suffix
            let font_type = if display_name.contains("TrueType") {
                "TrueType".to_string()
            } else if display_name.contains("OpenType") || display_name.contains("OTF") {
                "OpenType".to_string()
            } else if display_name.contains("Type 1") {
                "Type 1".to_string()
            } else {
                "Other".to_string()
            };

            // Deduplicate by family name
            if !family.is_empty() && !fonts.iter().any(|f| f.name == family) {
                fonts.push(FontInfo {
                    name: family,
                    font_type,
                });
            }
        }

        index += 1;
    }

    unsafe {
        RegCloseKey(hkey);
    }

    fonts.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(fonts)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn scan_system_fonts() -> Result<Vec<FontInfo>, String> {
    // Fallback for non-Windows: return common fonts
    Ok(vec![
        FontInfo { name: "Arial".into(), font_type: "System".into() },
        FontInfo { name: "Courier New".into(), font_type: "System".into() },
        FontInfo { name: "Georgia".into(), font_type: "System".into() },
        FontInfo { name: "Times New Roman".into(), font_type: "System".into() },
        FontInfo { name: "Trebuchet MS".into(), font_type: "System".into() },
        FontInfo { name: "Verdana".into(), font_type: "System".into() },
        FontInfo { name: "Consolas".into(), font_type: "System".into() },
        FontInfo { name: "monospace".into(), font_type: "Generic".into() },
        FontInfo { name: "sans-serif".into(), font_type: "Generic".into() },
        FontInfo { name: "serif".into(), font_type: "Generic".into() },
    ])
}

// ── Analysis History Persistence ──────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct AnalysisRecord {
    id: String,
    project_path: String,
    project_name: String,
    analyzed_at: String,
    languages: Vec<String>,
    language_ids: Vec<String>,
    analysis: AnalysisResult,
    symbols: HashMap<String, SymbolAnalysisResult>,
    modules: HashMap<String, ModuleAnalysisResult>,
    #[serde(default, rename = "functionGraphs")]
    function_graphs: HashMap<String, FunctionGraphResult>,
}

fn history_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| env::temp_dir());
    let _ = fs::create_dir_all(&dir);
    dir.join("history.json")
}

fn read_history(path: &std::path::Path) -> Vec<AnalysisRecord> {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
fn save_analysis(app: tauri::AppHandle, record: AnalysisRecord) -> Result<(), String> {
    let path = history_path(&app);
    let mut history = read_history(&path);
    history.push(record);
    let json = serde_json::to_string_pretty(&history).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_history(app: tauri::AppHandle) -> Result<Vec<AnalysisRecord>, String> {
    let path = history_path(&app);
    Ok(read_history(&path))
}

#[tauri::command]
fn delete_analysis(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = history_path(&app);
    let mut history = read_history(&path);
    history.retain(|r| r.id != id);
    let json = serde_json::to_string_pretty(&history).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// ── Module Analysis ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct ModuleNode {
    file_path: String,
    short_path: String,
    line_count: u32,
    symbol_count: u32,
}

#[derive(Serialize, Deserialize, Clone)]
struct ModuleEdge {
    from: String,
    to: String,
    symbols: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ModuleAnalysisResult {
    language: String,
    nodes: Vec<ModuleNode>,
    edges: Vec<ModuleEdge>,
    files_scanned: u32,
}

/// Extract import paths from source code for a given language.
fn extract_imports(content: &str, language: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        // Skip comments
        if trimmed.starts_with("//") || trimmed.starts_with("#") || trimmed.starts_with("/*") {
            continue;
        }
        match language {
            "rust" => {
                if let Some(cap) = trimmed.strip_prefix("use ") {
                    let path = cap.trim_end_matches(';').trim();
                    // Skip grouped imports like use crate::{a, b}
                    if !path.contains('{') && !path.is_empty() {
                        imports.push(path.to_string());
                    }
                }
                if let Some(cap) = trimmed.strip_prefix("mod ") {
                    let name = cap.trim_end_matches(';').trim();
                    if !name.is_empty() && !name.contains('{') {
                        imports.push(name.to_string());
                    }
                }
            }
            "typescript" | "typescriptreact" => {
                if let Some(from_pos) = line.find(" from ") {
                    let after_from = &line[from_pos + 6..].trim();
                    let path = after_from.trim_start_matches('\'').trim_start_matches('"')
                        .trim_end_matches('\'').trim_end_matches('"')
                        .trim_end_matches(';').trim();
                    if path.starts_with('.') {
                        imports.push(path.to_string());
                    }
                }
            }
            "python" => {
                if trimmed.starts_with("from .") {
                    let rest = &trimmed[5..];
                    let path = rest.split_whitespace().next().unwrap_or("");
                    if !path.is_empty() {
                        imports.push(path.to_string());
                    }
                }
            }
            "go" => {
                if trimmed.starts_with("import ") {
                    let rest = &trimmed[7..].trim();
                    if rest.starts_with('"') {
                        let path = rest.trim_start_matches('"').trim_end_matches('"')
                            .trim_end_matches(';').trim();
                        if !path.is_empty() {
                            imports.push(path.to_string());
                        }
                    }
                }
                if trimmed.starts_with('"') && !trimmed.starts_with("\"\"\"") {
                    let path = trimmed.trim_start_matches('"').trim_end_matches('"')
                        .trim_end_matches(';').trim();
                    if !path.is_empty() {
                        imports.push(path.to_string());
                    }
                }
            }
            _ => {}
        }
    }
    imports
}

/// Find all crate roots (directories containing Cargo.toml) in the project.
fn find_crate_roots(project_path: &str) -> Vec<std::path::PathBuf> {
    let mut roots = Vec::new();
    let root = Path::new(project_path);
    // Check if root itself has Cargo.toml
    if root.join("Cargo.toml").exists() {
        roots.push(root.to_path_buf());
    }
    // Check one-level subdirectories for workspace members
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.join("Cargo.toml").exists() {
                roots.push(p);
            }
        }
    }
    roots
}

/// Resolve an import path to a file path within the project.
fn resolve_import_to_file(
    project_path: &str,
    source_file: &str,
    import_path: &str,
    language: &str,
    crate_roots: &[std::path::PathBuf],
) -> Option<String> {
    let source_dir = Path::new(source_file).parent()?;
    let project_root = Path::new(project_path);

    match language {
        "rust" => {
            let segments: Vec<&str> = if let Some(rest) = import_path.strip_prefix("crate::") {
                rest.split("::").collect()
            } else if let Some(rest) = import_path.strip_prefix("super::") {
                let mut segs: Vec<&str> = rest.split("::").collect();
                segs.insert(0, "..");
                segs
            } else if let Some(rest) = import_path.strip_prefix("self::") {
                rest.split("::").collect()
            } else {
                vec![import_path]
            };

            if segments.is_empty() {
                return None;
            }

            let rel = segments.join("/");

            // For crate:: paths, try all crate roots
            if import_path.starts_with("crate::") {
                for cr in crate_roots {
                    // Try src/ subdirectory first (standard layout)
                    for base in &[cr.join("src"), cr.clone()] {
                        let c1 = base.join(format!("{}.rs", rel));
                        if c1.exists() {
                            return c1.to_str().map(|s| s.replace('\\', "/"));
                        }
                        let c2 = base.join(format!("{}/mod.rs", rel));
                        if c2.exists() {
                            return c2.to_str().map(|s| s.replace('\\', "/"));
                        }
                    }
                }
                return None;
            }

            // For relative paths (super::, self::, bare), resolve from source dir
            let base = source_dir.to_path_buf();
            let c1 = base.join(format!("{}.rs", rel));
            if c1.exists() {
                return c1.to_str().map(|s| s.replace('\\', "/"));
            }
            let c2 = base.join(format!("{}/mod.rs", rel));
            if c2.exists() {
                return c2.to_str().map(|s| s.replace('\\', "/"));
            }

            // For bare names, also try as sibling in the same directory
            if !import_path.contains("::") {
                let c3 = source_dir.join(format!("{}.rs", import_path));
                if c3.exists() {
                    return c3.to_str().map(|s| s.replace('\\', "/"));
                }
            }

            None
        }
        "typescript" | "typescriptreact" | "javascript" | "javascriptreact" => {
            if import_path.starts_with('.') {
                let base = source_dir.join(import_path);
                for ext in &[".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"] {
                    let candidate = PathBuf::from(format!("{}{}", base.display(), ext));
                    if candidate.exists() {
                        return candidate.to_str().map(|s| s.replace('\\', "/"));
                    }
                }
            }
            None
        }
        "python" => {
            let base = source_dir.join(import_path.replace('.', "/"));
            let candidate = base.join("__init__.py");
            if candidate.exists() {
                return candidate.to_str().map(|s| s.replace('\\', "/"));
            }
            let candidate = PathBuf::from(format!("{}.py", base.display()));
            if candidate.exists() {
                return candidate.to_str().map(|s| s.replace('\\', "/"));
            }
            None
        }
        "go" => {
            let rel = import_path;
            let candidate_dir = project_root.join(rel);
            if candidate_dir.exists() && candidate_dir.is_dir() {
                if let Ok(entries) = fs::read_dir(&candidate_dir) {
                    for e in entries.flatten() {
                        let p = e.path();
                        if p.extension().map(|e| e == "go").unwrap_or(false) {
                            return p.to_str().map(|s| s.replace('\\', "/"));
                        }
                    }
                }
            }
            None
        }
        _ => None,
    }
}

/// Normalize a file path for comparison (lowercase drive letter on Windows).
fn normalize_path(p: &str) -> String {
    let p = p.replace('\\', "/");
    if p.len() >= 2 && p.as_bytes()[1] == b':' {
        format!("{}{}", &p[..1].to_lowercase(), &p[1..])
    } else {
        p
    }
}

#[tauri::command]
fn analyze_modules(
    app: tauri::AppHandle,
    project_path: String,
    language: String,
    _command: String,
    _args: Vec<String>,
    extensions: Vec<String>,
    ignore_rules: Option<String>,
) -> Result<ModuleAnalysisResult, String> {
    let project_root = Path::new(&project_path);
    if !project_root.exists() || !project_root.is_dir() {
        return Err("路径不存在或不是目录".to_string());
    }

    // Emit progress: collecting files
    let _ = app.emit("module-progress", serde_json::json!({
        "stage": "collecting", "message": "正在收集源文件..."
    }));

    let (walker, _temp_file) = build_walker(&project_path, &ignore_rules);
    let ext_set: std::collections::HashSet<String> =
        extensions.iter().map(|e| e.trim_start_matches('.').to_lowercase()).collect();

    let mut files: Vec<String> = Vec::new();
    for entry in walker.build().flatten() {
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let ext = get_extension(entry.path());
        if ext_set.contains(&ext) {
            if let Some(p) = entry.path().to_str() {
                files.push(p.to_string());
            }
        }
    }

    let files_scanned = files.len() as u32;
    if files.is_empty() {
        return Ok(ModuleAnalysisResult {
            language,
            nodes: Vec::new(),
            edges: Vec::new(),
            files_scanned: 0,
        });
    }

    let lang_id = match language.as_str() {
        "Rust" => "rust",
        "TypeScript / JavaScript" => "typescript",
        "Python" => "python",
        "Go" => "go",
        _ => "plaintext",
    };

    // Find Rust crate roots for better module resolution
    let crate_roots = find_crate_roots(&project_path);

    // Phase 1: Read all file contents
    let _ = app.emit("module-progress", serde_json::json!({
        "stage": "reading", "message": format!("正在读取 {} 个文件...", files_scanned)
    }));

    let mut file_contents: HashMap<String, String> = HashMap::new();
    for file_path in &files {
        if let Ok(content) = fs::read_to_string(file_path) {
            file_contents.insert(file_path.clone(), content);
        }
    }

    // Phase 2: Path-based resolution (primary method)
    let _ = app.emit("module-progress", serde_json::json!({
        "stage": "resolving", "message": "正在解析模块依赖..."
    }));

    let project_prefix = normalize_path(&project_path);
    let mut edge_map: HashMap<(String, String), Vec<String>> = HashMap::new();
    let mut node_lines: HashMap<String, u32> = HashMap::new();
    let node_symbols: HashMap<String, u32> = HashMap::new();

    for file_path in &files {
        let content = match file_contents.get(file_path) {
            Some(c) => c.clone(),
            None => continue,
        };

        let line_count = content.lines().count() as u32;
        node_lines.insert(file_path.clone(), line_count);

        let imports = extract_imports(&content, lang_id);

        for import_path in &imports {
            // Primary: path-based resolution
            if let Some(target) = resolve_import_to_file(
                &project_path, file_path, import_path, lang_id, &crate_roots,
            ) {
                let norm_target = normalize_path(&target);
                let norm_source = normalize_path(file_path);
                if norm_target != norm_source {
                    let key = (file_path.clone(), target.clone());
                    edge_map.entry(key).or_default().push(import_path.clone());
                }
            }
        }
    }

    // Build nodes — collect involved files before consuming edge_map
    let mut involved_files: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (from, to) in edge_map.keys() {
        involved_files.insert(from.clone());
        involved_files.insert(to.clone());
    }

    let nodes: Vec<ModuleNode> = involved_files
        .into_iter()
        .map(|fp| {
            let short = fp.strip_prefix(&project_prefix)
                .unwrap_or(&fp)
                .trim_start_matches('/')
                .to_string();
            ModuleNode {
                file_path: fp.clone(),
                short_path: short,
                line_count: node_lines.get(&fp).copied().unwrap_or(0),
                symbol_count: node_symbols.get(&fp).copied().unwrap_or(0),
            }
        })
        .collect();

    let edges: Vec<ModuleEdge> = edge_map
        .into_iter()
        .map(|((from, to), symbols)| ModuleEdge { from, to, symbols })
        .collect();

    // Emit completion
    let _ = app.emit("module-progress", serde_json::json!({
        "stage": "done", "message": format!("完成: {} 个模块, {} 条依赖", nodes.len(), edges.len())
    }));

    Ok(ModuleAnalysisResult {
        language,
        nodes,
        edges,
        files_scanned,
    })
}

// ── Function Graph Analysis ────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct FunctionNode {
    id: String,
    name: String,
    kind: String,
    file_path: String,
    short_path: String,
    line: u32,
    caller_count: u32,
    callee_count: u32,
}

#[derive(Serialize, Deserialize, Clone)]
struct FunctionEdge {
    id: String,
    source: String,
    target: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct FunctionGraphResult {
    language: String,
    nodes: Vec<FunctionNode>,
    edges: Vec<FunctionEdge>,
    files_scanned: u32,
}

/// A flattened function symbol with its location range for call-site resolution.
#[derive(Clone)]
struct FuncSymbol {
    name: String,
    kind: i32,
    file_path: String,
    line: u32,
    col: u32,
    /// (start_line, end_line) of the function body for range matching.
    range_start: u32,
    range_end: u32,
}

fn is_function_like(kind: i32) -> bool {
    matches!(kind, 5 | 6 | 9 | 12 | 23)
    // Class(5) Method(6) Constructor(9) Function(12) Struct(23)
}

/// Flatten DocumentSymbol trees, recording the full range for each function-like symbol.
fn flatten_functions(
    symbols: &[serde_json::Value],
    file_path: &str,
    out: &mut Vec<FuncSymbol>,
) {
    for sym in symbols {
        let name = sym["name"].as_str().unwrap_or("").to_string();
        let kind = sym["kind"].as_i64().unwrap_or(0) as i32;

        if let Some(range) = sym.get("range") {
            let sel = sym.get("selectionRange").unwrap_or(range);
            let line = sel["start"]["line"].as_u64().unwrap_or_else(|| {
                range["start"]["line"].as_u64().unwrap_or(0)
            }) as u32;
            let col = sel["start"]["character"].as_u64().unwrap_or_else(|| {
                range["start"]["character"].as_u64().unwrap_or(0)
            }) as u32;
            let range_start = range["start"]["line"].as_u64().unwrap_or(0) as u32;
            let range_end = range["end"]["line"].as_u64().unwrap_or(0) as u32;

            if is_function_like(kind) {
                out.push(FuncSymbol {
                    name,
                    kind,
                    file_path: file_path.to_string(),
                    line,
                    col,
                    range_start,
                    range_end,
                });
            }
        } else if let Some(location) = sym.get("location") {
            let line = location["range"]["start"]["line"].as_u64().unwrap_or(0) as u32;
            let col = location["range"]["start"]["character"].as_u64().unwrap_or(0) as u32;
            let range_start = line;
            let range_end = location["range"]["end"]["line"].as_u64().unwrap_or(line as u64) as u32;

            if is_function_like(kind) {
                out.push(FuncSymbol {
                    name,
                    kind,
                    file_path: file_path.to_string(),
                    line,
                    col,
                    range_start,
                    range_end,
                });
            }
        }

        if let Some(children) = sym.get("children").and_then(|c| c.as_array()) {
            flatten_functions(children, file_path, out);
        }
    }
}

#[tauri::command]
async fn analyze_function_graph(
    app: tauri::AppHandle,
    project_path: String,
    language: String,
    command: String,
    args: Vec<String>,
    extensions: Vec<String>,
    ignore_rules: Option<String>,
) -> Result<FunctionGraphResult, String> {
    let project_root = Path::new(&project_path);
    if !project_root.exists() || !project_root.is_dir() {
        return Err("路径不存在或不是目录".to_string());
    }

    let _ = app.emit("function-graph-progress", serde_json::json!({
        "stage": "collecting", "message": "正在收集源文件..."
    }));

    let (walker, _temp_file) = build_walker(&project_path, &ignore_rules);
    let ext_set: std::collections::HashSet<String> =
        extensions.iter().map(|e| e.trim_start_matches('.').to_lowercase()).collect();

    let mut files: Vec<String> = Vec::new();
    for entry in walker.build().flatten() {
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let ext = get_extension(entry.path());
        if ext_set.contains(&ext) {
            if let Some(p) = entry.path().to_str() {
                files.push(p.to_string());
            }
        }
    }

    let files_scanned = files.len() as u32;
    if files.is_empty() {
        return Ok(FunctionGraphResult {
            language,
            nodes: Vec::new(),
            edges: Vec::new(),
            files_scanned: 0,
        });
    }

    let _ = app.emit("function-graph-progress", serde_json::json!({
        "stage": "connecting", "message": "正在连接 LSP 服务器..."
    }));

    let mut client = LspClient::spawn(&command, &args)?;

    let root_uri = format!("file:///{}", project_path.replace('\\', "/"));
    let init_params = serde_json::json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": {
            "textDocument": {
                "documentSymbol": {
                    "dynamicRegistration": false,
                    "hierarchicalDocumentSymbolSupport": true,
                    "symbolKind": { "valueSet": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26] }
                },
                "references": { "dynamicRegistration": false }
            }
        }
    });
    client.send_request("initialize", init_params)?;
    client.send_notification("initialized", serde_json::json!({}))?;
    std::thread::sleep(std::time::Duration::from_millis(500));

    let language_id = match language.as_str() {
        "Rust" => "rust",
        "TypeScript / JavaScript" => "typescript",
        "Python" => "python",
        "Go" => "go",
        "C / C++" => "cpp",
        "Java" => "java",
        "C#" => "csharp",
        "Lua" => "lua",
        _ => "plaintext",
    };

    let project_prefix = normalize_path(&project_path);

    // Phase 1: Extract all function-like symbols from all files
    let _ = app.emit("function-graph-progress", serde_json::json!({
        "stage": "extracting", "message": "正在提取函数符号..."
    }));

    let mut all_funcs: Vec<FuncSymbol> = Vec::new();

    for (idx, file_path) in files.iter().enumerate() {
        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let uri = format!("file:///{}", file_path.replace('\\', "/"));

        let _ = client.send_notification(
            "textDocument/didOpen",
            serde_json::json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id,
                    "version": 1,
                    "text": content
                }
            }),
        );

        let symbols_result = client.send_request(
            "textDocument/documentSymbol",
            serde_json::json!({ "textDocument": { "uri": uri } }),
        );

        if let Ok(symbols_value) = symbols_result {
            if let Some(symbol_list) = symbols_value.as_array() {
                flatten_functions(symbol_list, file_path, &mut all_funcs);
            }
        }

        let _ = client.send_notification(
            "textDocument/didClose",
            serde_json::json!({ "textDocument": { "uri": uri } }),
        );

        if (idx + 1) % 20 == 0 || idx + 1 == files.len() {
            let _ = app.emit("function-graph-progress", serde_json::json!({
                "stage": "extracting",
                "message": format!("正在提取函数符号... {}/{}", idx + 1, files.len())
            }));
        }
    }

    let total_funcs = all_funcs.len();
    let _ = app.emit("function-graph-progress", serde_json::json!({
        "stage": "analyzing",
        "message": format!("已发现 {} 个函数，正在分析调用关系...", total_funcs)
    }));

    // Phase 2: Build node index — map (file_path, line) -> index in all_funcs
    let mut node_index: std::collections::HashMap<(String, u32), usize> = std::collections::HashMap::new();
    for (i, f) in all_funcs.iter().enumerate() {
        node_index.insert((f.file_path.clone(), f.line), i);
    }

    // Phase 3: For each function, query references to find callers
    // Build two lookups:
    //   - normalized file path -> Vec<func index>
    //   - (normalized file path, line) -> func index (for precise matching)
    let mut file_func_map: std::collections::HashMap<String, Vec<usize>> = std::collections::HashMap::new();
    let mut pos_func_map: std::collections::HashMap<(String, u32), usize> = std::collections::HashMap::new();
    for (i, f) in all_funcs.iter().enumerate() {
        let norm = normalize_path(&f.file_path);
        file_func_map.entry(norm.clone()).or_default().push(i);
        pos_func_map.insert((norm, f.line), i);
    }

    let mut caller_counts: Vec<u32> = vec![0; total_funcs];
    let mut callee_counts: Vec<u32> = vec![0; total_funcs];
    let mut edge_set: std::collections::HashSet<(usize, usize)> = std::collections::HashSet::new();

    for (i, func) in all_funcs.iter().enumerate() {
        let uri = format!("file:///{}", func.file_path.replace('\\', "/"));

        // We need the file open for references to work
        let content = fs::read_to_string(&func.file_path).unwrap_or_default();
        let _ = client.send_notification(
            "textDocument/didOpen",
            serde_json::json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id,
                    "version": 1,
                    "text": content
                }
            }),
        );

        // Query references INCLUDING the declaration so we always get results.
        let refs_result = client.send_request(
            "textDocument/references",
            serde_json::json!({
                "textDocument": { "uri": uri },
                "position": { "line": func.line, "character": func.col },
                "context": { "includeDeclaration": true }
            }),
        );

        if let Ok(refs) = refs_result {
            if let Some(ref_list) = refs.as_array() {
                if i < 5 {
                    eprintln!("[FG] func '{}' at {}:{} got {} refs", func.name, func.file_path, func.line, ref_list.len());
                }
                for r in ref_list {
                    let ref_uri = r["uri"].as_str().unwrap_or("");
                    let ref_line = r["range"]["start"]["line"].as_u64().unwrap_or(0) as u32;
                    let ref_col = r["range"]["start"]["character"].as_u64().unwrap_or(0) as u32;

                    // Convert URI to normalized path
                    let ref_raw = ref_uri.strip_prefix("file:///").unwrap_or(ref_uri);
                    let ref_os = if cfg!(target_os = "windows") {
                        ref_raw.replace('/', "\\")
                    } else {
                        ref_raw.to_string()
                    };
                    let ref_norm = normalize_path(&ref_os);
                    let func_norm = normalize_path(&func.file_path);

                    if i < 5 {
                        eprintln!("[FG]   ref at {}:{}:{}  norm={}  func_norm={}", ref_uri, ref_line, ref_col, ref_norm, func_norm);
                    }

                    // Skip self-reference (the declaration itself)
                    if ref_norm == func_norm && ref_line == func.line && ref_col == func.col {
                        if i < 5 { eprintln!("[FG]   -> skipped (self)"); }
                        continue;
                    }

                    // Strategy 1: Try to find the exact function containing this
                    // reference by checking function ranges in the reference's file.
                    let mut matched = false;
                    if let Some(indices) = file_func_map.get(&ref_norm) {
                        let mut best_j: Option<usize> = None;
                        let mut best_range = u32::MAX;
                        for &j in indices {
                            if j == i { continue; }
                            let caller = &all_funcs[j];
                            if ref_line >= caller.range_start && ref_line <= caller.range_end {
                                let span = caller.range_end - caller.range_start;
                                if span < best_range {
                                    best_range = span;
                                    best_j = Some(j);
                                }
                            }
                        }
                        if let Some(j) = best_j {
                            if edge_set.insert((j, i)) {
                                caller_counts[i] += 1;
                                callee_counts[j] += 1;
                                if i < 10 {
                                    eprintln!("[FG]   -> EDGE (S1): {} calls {}", all_funcs[j].name, func.name);
                                }
                            }
                            matched = true;
                        }
                    }

                    // Strategy 2: If range matching failed, check if the reference
                    // is at a known function's definition line (the call might be
                    // directly at the function signature, e.g. `fn foo() { bar() }`).
                    if !matched {
                        if let Some(&j) = pos_func_map.get(&(ref_norm.clone(), ref_line)) {
                            if j != i {
                                if edge_set.insert((j, i)) {
                                    caller_counts[i] += 1;
                                    callee_counts[j] += 1;
                                    if i < 10 {
                                        eprintln!("[FG]   -> EDGE (S2): {} calls {}", all_funcs[j].name, func.name);
                                    }
                                }
                                matched = true;
                            }
                        }
                    }

                    // Strategy 3: If still unmatched and reference is in a file
                    // that contains any function, pick the first one as a fallback.
                    // This handles module-level calls and loose code.
                    if !matched {
                        if let Some(indices) = file_func_map.get(&ref_norm) {
                            if let Some(&j) = indices.first() {
                                if j != i {
                                    if edge_set.insert((j, i)) {
                                        caller_counts[i] += 1;
                                        callee_counts[j] += 1;
                                        if i < 10 {
                                            eprintln!("[FG]   -> EDGE (S3): {} calls {}", all_funcs[j].name, func.name);
                                        }
                                    }
                                }
                            }
                        } else if i < 5 {
                            eprintln!("[FG]   -> NO MATCH: ref_norm={} not in file_func_map keys", ref_norm);
                        }
                    }
                }
            }
        }

        let _ = client.send_notification(
            "textDocument/didClose",
            serde_json::json!({ "textDocument": { "uri": uri } }),
        );

        if (i + 1) % 10 == 0 || i + 1 == total_funcs {
            let _ = app.emit("function-graph-progress", serde_json::json!({
                "stage": "analyzing",
                "message": format!("正在分析调用关系... {}/{}", i + 1, total_funcs)
            }));
        }
    }

    let _ = client.shutdown();

    // Phase 4: Build result
    let nodes: Vec<FunctionNode> = all_funcs
        .iter()
        .enumerate()
        .map(|(i, f)| {
            let short = f
                .file_path
                .strip_prefix(&project_prefix)
                .unwrap_or(&f.file_path)
                .trim_start_matches('/')
                .to_string();
            FunctionNode {
                id: format!("{}:{}", f.file_path, f.line + 1),
                name: f.name.clone(),
                kind: lsp_symbol_kind_name(f.kind).to_string(),
                file_path: f.file_path.clone(),
                short_path: short,
                line: f.line + 1,
                caller_count: caller_counts[i],
                callee_count: callee_counts[i],
            }
        })
        .collect();

    let edges: Vec<FunctionEdge> = edge_set
        .iter()
        .map(|&(caller_idx, callee_idx)| {
            let src = &all_funcs[caller_idx];
            let tgt = &all_funcs[callee_idx];
            FunctionEdge {
                id: format!(
                    "{}:{}→{}:{}",
                    src.file_path, src.line + 1,
                    tgt.file_path, tgt.line + 1
                ),
                source: format!("{}:{}", src.file_path, src.line + 1),
                target: format!("{}:{}", tgt.file_path, tgt.line + 1),
            }
        })
        .collect();

    eprintln!("[FG] Summary: {} functions, {} edges, {} files", nodes.len(), edges.len(), files_scanned);
    eprintln!("[FG] file_func_map keys: {:?}", file_func_map.keys().collect::<Vec<_>>());
    if !edges.is_empty() {
        for e in &edges {
            eprintln!("[FG]   edge: {} -> {}", e.source, e.target);
        }
    }

    let _ = app.emit("function-graph-progress", serde_json::json!({
        "stage": "done",
        "message": format!("完成: {} 个函数, {} 条调用关系", nodes.len(), edges.len())
    }));

    Ok(FunctionGraphResult {
        language,
        nodes,
        edges,
        files_scanned,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            analyze_code,
            get_version,
            detect_lsp_servers,
            extract_symbols,
            scan_system_fonts,
            save_analysis,
            load_history,
            delete_analysis,
            analyze_modules,
            analyze_function_graph
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
