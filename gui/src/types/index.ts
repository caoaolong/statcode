export interface FileAnalysis {
  extension: string;
  file_count: number;
  total_lines: number;
  total_bytes: number;
}

export interface AnalysisResult {
  project_path: string;
  project_name: string;
  total_files: number;
  total_lines: number;
  total_bytes: number;
  by_type: FileAnalysis[];
}

export type Page = "project" | "analysis" | "architecture" | "functionGraph" | "settings";

export type Theme = "light" | "dark" | "system";

export type LspStatus = "running" | "stopped" | "error" | "not-installed";

export interface LspDetection {
  id: string;
  available: boolean;
  version: string | null;
  path: string | null;
  error: string | null;
}

export interface LspServerInfo {
  id: string;
  language: string;
  command: string;
  args: string[];
  extensions: string[];
  available: boolean;
  version: string | null;
  path: string | null;
  error: string | null;
}

export interface LspServer {
  id: string;
  language: string;
  name: string;
  command: string;
  args: string[];
  extensions: string[];
  status: LspStatus;
  description: string;
  install: LspInstallCommand[];
  version?: string | null;
  detectedPath?: string | null;
  detectionError?: string | null;
}

export interface LspInstallCommand {
  manager:
    | "npm"
    | "pnpm"
    | "yarn"
    | "cargo"
    | "brew"
    | "go"
    | "apt"
    | "scoop"
    | "winget"
    | "dotnet"
    | "pip"
    | "manual";
  command: string;
}

// ── Font Settings ───────────────────────────────────────────────────

export interface FontInfo {
  name: string;
  type: string;
}

// ── Symbol Analysis ──────────────────────────────────────────────────

export interface SymbolInfo {
  name: string;
  kind: string;
  file_path: string;
  line: number;
  column: number;
  reference_count: number;
  detail: string;
}

export interface SymbolAnalysisResult {
  language: string;
  symbols: SymbolInfo[];
  total_symbols: number;
  files_scanned: number;
}

// ── Module Analysis ──────────────────────────────────────────────────

export interface ModuleNode {
  file_path: string;
  short_path: string;
  line_count: number;
  symbol_count: number;
}

export interface ModuleEdge {
  from: string;
  to: string;
  symbols: string[];
}

export interface ModuleAnalysisResult {
  language: string;
  nodes: ModuleNode[];
  edges: ModuleEdge[];
  files_scanned: number;
}

// ── Function Graph ─────────────────────────────────────────────────

export interface FunctionNode {
  id: string;
  name: string;
  kind: string;
  file_path: string;
  short_path: string;
  line: number;
  caller_count: number;
  callee_count: number;
}

export interface FunctionEdge {
  id: string;
  source: string;
  target: string;
}

export interface FunctionGraphResult {
  language: string;
  nodes: FunctionNode[];
  edges: FunctionEdge[];
  files_scanned: number;
}

// ── Analysis History ─────────────────────────────────────────────────

export interface AnalysisRecord {
  id: string;
  project_path: string;
  project_name: string;
  analyzed_at: string;
  languages: string[];
  language_ids: string[];
  analysis: AnalysisResult;
  symbols: Record<string, SymbolAnalysisResult>;
  modules: Record<string, ModuleAnalysisResult>;
  functionGraphs?: Record<string, FunctionGraphResult>;
}
