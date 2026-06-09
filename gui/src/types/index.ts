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

export type Page = "project" | "analysis" | "architecture";
