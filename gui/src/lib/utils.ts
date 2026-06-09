// Language color map for file extensions
const EXT_COLORS: Record<string, string> = {
  // Web
  js: "#f7df1e",
  jsx: "#61dafb",
  ts: "#3178c6",
  tsx: "#3178c6",
  html: "#e34c26",
  css: "#563d7c",
  scss: "#cf649a",
  less: "#1d365d",
  vue: "#42b883",
  svelte: "#ff3e00",
  // Systems
  rs: "#dea584",
  c: "#555555",
  cpp: "#f34b7d",
  h: "#a3b18a",
  go: "#00add8",
  // Scripting
  py: "#3572a5",
  rb: "#cc342d",
  php: "#4f5d95",
  pl: "#0298c3",
  lua: "#000080",
  // JVM
  java: "#b07219",
  kt: "#a97bff",
  scala: "#c22d40",
  // Other
  sh: "#89e051",
  bash: "#89e051",
  ps1: "#012456",
  json: "#292929",
  yaml: "#cb171e",
  yml: "#cb171e",
  xml: "#0060ac",
  md: "#083fa1",
  sql: "#e38c00",
  r: "#198ce7",
  dart: "#00b4ab",
  swift: "#f05138",
  zig: "#ec915c",
  toml: "#9c4221",
  ini: "#5a5a5a",
  txt: "#808080",
};

const DEFAULT_COLOR = "#94a3b8";

export function getExtColor(ext: string): string {
  return EXT_COLORS[ext.toLowerCase()] || DEFAULT_COLOR;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatLines(lines: number): string {
  if (lines >= 1000000) return (lines / 1000000).toFixed(1) + "M";
  if (lines >= 1000) return (lines / 1000).toFixed(1) + "K";
  return lines.toString();
}

export function formatPercent(value: number, total: number): string {
  if (total === 0) return "0%";
  return ((value / total) * 100).toFixed(1) + "%";
}

// Pie chart color palette
export const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a78bfa",
  "#c4b5fd",
  "#06b6d4",
  "#0891b2",
  "#14b8a6",
  "#10b981",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#6d28d9",
  "#4338ca",
  "#1e40af",
  "#0ea5e9",
  "#22c55e",
  "#84cc16",
  "#eab308",
];
