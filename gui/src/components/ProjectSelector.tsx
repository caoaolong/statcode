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
        <h2 className="text-2xl font-bold text-slate-800 mb-2">项目选择</h2>
        <p className="text-slate-500">
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
            ? "border-indigo-200 bg-indigo-50/50 hover:border-indigo-300"
            : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
          }
        `}
      >
        <div className="p-10 flex flex-col items-center text-center">
          <div
            className={`
              w-16 h-16 rounded-2xl flex items-center justify-center mb-5
              transition-all duration-300 group-hover:scale-110
              ${projectPath
                ? "bg-indigo-100 text-indigo-600"
                : "bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-500"
              }
            `}
          >
            <FolderOpen size={28} />
          </div>

          {projectPath ? (
            <>
              <p className="text-sm text-slate-500 mb-1">当前项目</p>
              <p className="text-lg font-semibold text-slate-800 mb-1">
                {projectName}
              </p>
              <p className="text-xs text-slate-400 font-mono max-w-md truncate">
                {projectPath}
              </p>
              <p className="text-sm text-indigo-500 mt-4 group-hover:text-indigo-600">
                点击重新选择项目
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-slate-700 mb-2">
                选择项目文件夹
              </p>
              <p className="text-sm text-slate-400 mb-4">
                点击此处浏览并选择要分析的项目目录
              </p>
              <div className="flex items-center gap-2 text-sm text-indigo-500 group-hover:text-indigo-600">
                <span>浏览文件夹</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </>
          )}
        </div>

        {/* Loading overlay */}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
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
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
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
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    indigo: { bg: "bg-indigo-50", text: "text-indigo-700", icon: "text-indigo-500" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "text-emerald-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", icon: "text-amber-500" },
  };
  const c = colorMap[color] || colorMap.indigo;

  return (
    <div className={`${c.bg} rounded-xl p-5 border border-${color}-100`}>
      <Icon size={20} className={`${c.icon} mb-3`} />
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  );
}
