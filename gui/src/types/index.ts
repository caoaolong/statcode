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

export type Page = "project" | "analysis" | "architecture" | "settings";

export type Theme = "light" | "dark" | "system";

export type LspStatus = "running" | "stopped" | "error" | "not-installed";

export interface LspDetection {
  id: string;
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
