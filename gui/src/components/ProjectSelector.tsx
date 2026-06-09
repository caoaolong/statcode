import { FolderOpen, Scan, FileCode, Layers, ArrowRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useProject } from "../context/ProjectContext";
import { formatLines } from "../lib/utils";
import type { AnalysisResult, Page } from "../types";

interface ProjectSelectorProps {
  onNavigate: (page: Page) => void;
}

export default function ProjectSelector({ onNavigate }: ProjectSelectorProps) {
  const {
    projectPath,
    projectName,
    analysisResult,
    isAnalyzing,
    error,
    setProject,
    setAnalysis,
    setAnalyzing,
    setError,
  } = useProject();

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要分析的项目文件夹",
      });

      if (selected) {
        setProject(selected);
        await runAnalysis(selected);
      }
    } catch (err) {
      setError(`选择文件夹失败: ${err}`);
    }
  };

  const runAnalysis = async (path: string) => {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await invoke<AnalysisResult>("analyze_code", { path });
      setAnalysis(result);
    } catch (err) {
      setError(`分析失败: ${err}`);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">项目选择</h2>
        <p className="text-[var(--text-muted)]">
          选择一个项目文件夹开始分析代码结构和统计信息
        </p>
      </div>

      {/* Select Card */}
      <div
        onClick={handleSelectFolder}
        className={`
          relative overflow-hidden rounded-2xl border-2 border-dashed cursor-pointer
          transition-all duration-300 group
          ${projectPath
            ? "border-indigo-200 dark:border-indigo-500/40 bg-indigo-50/50 dark:bg-indigo-500/10 hover:border-indigo-300 dark:hover:border-indigo-400"
            : "border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5"
          }
        `}
      >
        <div className="p-10 flex flex-col items-center text-center">
          <div
            className={`
              w-16 h-16 rounded-2xl flex items-center justify-center mb-5
              transition-all duration-300 group-hover:scale-110
              ${projectPath
                ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300"
                : "bg-[var(--bg-muted)] text-[var(--text-faint)] group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 group-hover:text-indigo-500 dark:group-hover:text-indigo-300"
              }
            `}
          >
            <FolderOpen size={28} />
          </div>

          {projectPath ? (
            <>
              <p className="text-sm text-[var(--text-muted)] mb-1">当前项目</p>
              <p className="text-lg font-semibold text-[var(--text-primary)] mb-1">
                {projectName}
              </p>
              <p className="text-xs text-[var(--text-faint)] font-mono max-w-md truncate">
                {projectPath}
              </p>
              <p className="text-sm text-indigo-500 dark:text-indigo-400 mt-4 group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                点击重新选择项目
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-[var(--text-secondary)] mb-2">
                选择项目文件夹
              </p>
              <p className="text-sm text-[var(--text-faint)] mb-4">
                点击此处浏览并选择要分析的项目目录
              </p>
              <div className="flex items-center gap-2 text-sm text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                <span>浏览文件夹</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </>
          )}
        </div>

        {/* Loading overlay */}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-sm font-medium text-indigo-600">
                正在分析项目...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Quick Stats */}
      {analysisResult && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <StatCard
            icon={FileCode}
            label="文件总数"
            value={analysisResult.total_files.toLocaleString()}
            color="indigo"
          />
          <StatCard
            icon={Layers}
            label="代码行数"
            value={formatLines(analysisResult.total_lines)}
            color="emerald"
          />
          <StatCard
            icon={Scan}
            label="文件类型"
            value={analysisResult.by_type.length.toString()}
            color="amber"
          />
        </div>
      )}

      {/* Go to analysis */}
      {analysisResult && (
        <button
          onClick={() => onNavigate("analysis")}
          className="mt-6 w-full py-3 px-6 bg-indigo-600 text-white rounded-xl font-medium
            hover:bg-indigo-700 active:bg-indigo-800 transition-colors flex items-center justify-center gap-2"
        >
          <span>查看详细分析</span>
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; icon: string; border: string }> = {
    indigo: {
      bg: "bg-indigo-50 dark:bg-indigo-500/10",
      text: "text-indigo-700 dark:text-indigo-300",
      icon: "text-indigo-500 dark:text-indigo-400",
      border: "border-indigo-100 dark:border-indigo-500/20",
    },
    emerald: {
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
      text: "text-emerald-700 dark:text-emerald-300",
      icon: "text-emerald-500 dark:text-emerald-400",
      border: "border-emerald-100 dark:border-emerald-500/20",
    },
    amber: {
      bg: "bg-amber-50 dark:bg-amber-500/10",
      text: "text-amber-700 dark:text-amber-300",
      icon: "text-amber-500 dark:text-amber-400",
      border: "border-amber-100 dark:border-amber-500/20",
    },
  };
  const c = colorMap[color] || colorMap.indigo;

  return (
    <div className={`${c.bg} rounded-xl p-5 border ${c.border}`}>
      <Icon size={20} className={`${c.icon} mb-3`} />
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
      <p className="text-sm text-[var(--text-muted)] mt-1">{label}</p>
    </div>
  );
}
