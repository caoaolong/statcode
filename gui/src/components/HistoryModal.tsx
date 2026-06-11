import { useState, useEffect, useCallback } from "react";
import { X, Trash2, RotateCcw, Clock, FileCode, Layers, Scan } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useProject } from "../context/ProjectContext";
import { formatLines } from "../lib/utils";
import type { AnalysisRecord, Page } from "../types";

interface HistoryModalProps {
  projectPath: string;
  projectName: string;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  onChanged: () => void;
}

export default function HistoryModal({ projectPath, projectName, onClose, onNavigate, onChanged }: HistoryModalProps) {
  const { restoreAnalysis } = useProject();
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const all = await invoke<AnalysisRecord[]>("load_history");
      const filtered = all
        .filter((r) => r.project_path === projectPath)
        .sort((a, b) => new Date(b.analyzed_at).getTime() - new Date(a.analyzed_at).getTime());
      setRecords(filtered);
    } catch (err) {
      console.error("加载历史记录失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_analysis", { id });
      setRecords((prev) => prev.filter((r) => r.id !== id));
      onChanged();
    } catch (err) {
      console.error("删除记录失败:", err);
    }
  };

  const handleLoad = (record: AnalysisRecord) => {
    restoreAnalysis(record);
    onNavigate("analysis");
    onClose();
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">分析历史</h3>
            <p className="text-sm text-[var(--text-muted)] mt-0.5 font-mono truncate max-w-md">
              {projectName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-faint)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <Clock size={32} className="mb-3 text-[var(--text-faint)]" />
              <p>暂无分析记录</p>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-xl p-4 hover:border-[var(--border-strong)] transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {formatTime(record.analyzed_at)}
                      </p>
                      {record.languages.length > 0 && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          符号分析: {record.languages.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleLoad(record)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                          bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <RotateCcw size={12} />
                        加载
                      </button>
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                          bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30
                          rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                      >
                        <Trash2 size={12} />
                        删除
                      </button>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <FileCode size={14} className="text-indigo-500" />
                      <span>{record.analysis.total_files.toLocaleString()} 文件</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <Layers size={14} className="text-emerald-500" />
                      <span>{formatLines(record.analysis.total_lines)} 代码行</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <Scan size={14} className="text-amber-500" />
                      <span>
                        {Object.values(record.symbols).reduce((s, r) => s + r.total_symbols, 0).toLocaleString()} 符号
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-default)]">
          <p className="text-xs text-[var(--text-faint)]">
            共 {records.length} 条分析记录 · {projectPath}
          </p>
        </div>
      </div>
    </div>
  );
}
