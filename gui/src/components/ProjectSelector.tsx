import { useState, useEffect, useCallback } from "react";
import { FolderOpen, Scan, FileCode, Layers, ArrowRight, CheckCircle2, Loader2, Clock, ChevronRight, RotateCcw, GitBranch } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useProject } from "../context/ProjectContext";
import { useSettings } from "../context/SettingsContext";
import { formatLines } from "../lib/utils";
import HistoryModal from "./HistoryModal";
import type { AnalysisResult, AnalysisRecord, LspServerInfo, Page, SymbolAnalysisResult, ModuleAnalysisResult, FunctionGraphResult } from "../types";

interface ProjectSelectorProps {
  onNavigate: (page: Page) => void;
}

interface ProjectGroup {
  project_path: string;
  project_name: string;
  count: number;
  latest: string;
}

export default function ProjectSelector({ onNavigate }: ProjectSelectorProps) {
  const {
    projectPath,
    projectName,
    analysisResult,
    isAnalyzing,
    error,
    availableLanguages,
    selectedLanguages,
    isAnalyzingSymbols,
    functionGraphResults,
    setFunctionGraphResult,
    setProject,
    setAnalysis,
    setAnalyzing,
    setError,
    setAvailableLanguages,
    setSelectedLanguages,
    setAnalyzingSymbols,
    setSymbolError,
    saveAnalysisRecord,
  } = useProject();
  const { ignoreRules } = useSettings();

  const [detectingLsp, setDetectingLsp] = useState(false);
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);
  const [historyGroups, setHistoryGroups] = useState<ProjectGroup[]>([]);
  const [modalProject, setModalProject] = useState<{ path: string; name: string } | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const all = await invoke<AnalysisRecord[]>("load_history");
      const groupMap = new Map<string, ProjectGroup>();
      for (const r of all) {
        const existing = groupMap.get(r.project_path);
        if (!existing || r.analyzed_at > existing.latest) {
          groupMap.set(r.project_path, {
            project_path: r.project_path,
            project_name: r.project_name,
            count: (existing?.count || 0) + 1,
            latest: r.analyzed_at,
          });
        } else {
          existing.count++;
        }
      }
      const groups = Array.from(groupMap.values())
        .sort((a, b) => b.latest.localeCompare(a.latest));
      setHistoryGroups(groups);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Detect LSP servers when project is selected (skip if already detected at startup)
  const detectLanguages = async () => {
    const existing = availableLanguages.filter((s) => s.available);
    if (existing.length > 0) {
      // Already have servers from startup — just auto-select and show
      setSelectedLanguages(existing.map((s) => s.id));
      setShowLanguageSelect(true);
      return;
    }
    setDetectingLsp(true);
    try {
      const servers = await invoke<LspServerInfo[]>("detect_lsp_servers");
      setAvailableLanguages(servers);
      const available = servers.filter((s) => s.available).map((s) => s.id);
      setSelectedLanguages(available);
      if (available.length > 0) {
        setShowLanguageSelect(true);
      }
    } catch {
      // If detection fails, just proceed without language selection
    } finally {
      setDetectingLsp(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要分析的项目文件夹",
      });

      if (selected) {
        setProject(selected);
        setShowLanguageSelect(false);
        await detectLanguages();
      }
    } catch (err) {
      setError(`选择文件夹失败: ${err}`);
    }
  };

  const handleToggleLanguage = (id: string) => {
    setSelectedLanguages(
      selectedLanguages.includes(id)
        ? selectedLanguages.filter((l) => l !== id)
        : [...selectedLanguages, id],
    );
  };

  const handleStartAnalysis = async () => {
    if (!projectPath) return;

    // Run file analysis
    setAnalyzing(true);
    setError(null);
    setAnalysisProgress("正在分析代码结构...");
    let analysisData: AnalysisResult | null = null;
    try {
      analysisData = await invoke<AnalysisResult>("analyze_code", { path: projectPath, ignoreRules });
      setAnalysis(analysisData);
    } catch (err) {
      setError(`分析失败: ${err}`);
    } finally {
      setAnalyzing(false);
    }

    // Run function graph analysis for selected languages
    const collectedSymbols: Record<string, SymbolAnalysisResult> = {};
    const collectedModules: Record<string, ModuleAnalysisResult> = {};
    const collectedFunctionGraphs: Record<string, FunctionGraphResult> = {};
    const langNameMap: Record<string, string> = {};
    for (const lang of availableLanguages) {
      langNameMap[lang.id] = lang.language;
    }

    if (selectedLanguages.length > 0) {
      setAnalyzingSymbols(true);
      setSymbolError(null);
      try {
        for (const langId of selectedLanguages) {
          const lang = availableLanguages.find((l) => l.id === langId);
          if (!lang || !lang.available) continue;

          // Function graph analysis (combines symbol + call relationship analysis)
          setAnalysisProgress(`正在分析 ${lang.language} 函数图谱...`);
          const unlisten = await listen<{ stage: string; message: string }>("function-graph-progress", (event) => {
            setAnalysisProgress(event.payload.message);
          });
          try {
            const fgResult = await invoke<FunctionGraphResult>("analyze_function_graph", {
              projectPath,
              language: lang.language,
              command: lang.path || lang.command,
              args: lang.args,
              extensions: lang.extensions,
              ignoreRules,
            });
            collectedFunctionGraphs[langId] = fgResult;
            setFunctionGraphResult(langId, fgResult);
          } catch (err) {
            console.error(`函数图谱分析失败 (${lang.language}):`, err);
          }
          unlisten();
        }
      } finally {
        setAnalyzingSymbols(false);
        setAnalysisProgress(null);
      }
    }

    // Save to history (use directly collected data, not stale context state)
    if (analysisData) {
      await saveAnalysisRecord(analysisData, selectedLanguages, langNameMap, collectedSymbols, collectedModules, collectedFunctionGraphs);
      await loadHistory();
    }

    setShowLanguageSelect(false);
    setAnalysisProgress(null);
  };

  const installedCount = availableLanguages.filter((l) => l.available).length;
  const hasFunctionGraphResults = Object.keys(functionGraphResults).length > 0;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
        {(isAnalyzing || detectingLsp) && (
          <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-sm font-medium text-indigo-600">
                {detectingLsp ? "正在检测语言服务器..." : "正在分析项目..."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Language Selection */}
      {showLanguageSelect && projectPath && !isAnalyzing && !detectingLsp && (
        <div className="mt-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
              选择分析语言
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              选择需要进行符号分析的编程语言（仅显示已安装 LSP Server 的语言）
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {availableLanguages.map((lang) => {
              const isSelected = selectedLanguages.includes(lang.id);
              const isAvailable = lang.available;

              return (
                <button
                  key={lang.id}
                  onClick={() => isAvailable && handleToggleLanguage(lang.id)}
                  disabled={!isAvailable}
                  className={`
                    relative flex flex-col items-center gap-2 p-4 rounded-xl border text-center
                    transition-all duration-200
                    ${!isAvailable
                      ? "border-[var(--border-subtle)] bg-[var(--bg-subtle)] opacity-50 cursor-not-allowed"
                      : isSelected
                        ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/15 ring-1 ring-indigo-500 dark:ring-indigo-400"
                        : "border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
                    }
                  `}
                >
                  {isSelected && (
                    <CheckCircle2
                      size={16}
                      className="absolute top-2 right-2 text-indigo-600 dark:text-indigo-300"
                    />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      isSelected
                        ? "text-indigo-700 dark:text-indigo-300"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {lang.language}
                  </span>
                  <span className="text-[11px] text-[var(--text-faint)] font-mono">
                    {lang.command}
                  </span>
                  {!isAvailable && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      未安装
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {installedCount === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-2">
              未检测到已安装的 LSP Server，请先在设置中安装对应的语言服务器。
            </p>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--text-muted)]">
                已选择 {selectedLanguages.length} 种语言
              </p>
              <button
                onClick={handleStartAnalysis}
                disabled={selectedLanguages.length === 0}
                className="py-2.5 px-6 bg-indigo-600 text-white rounded-xl font-medium text-sm
                  hover:bg-indigo-700 active:bg-indigo-800 transition-colors flex items-center gap-2
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>开始分析</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Analysis progress */}
      {(isAnalyzingSymbols || analysisProgress) && (
        <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl flex items-center gap-3">
          <Loader2 size={18} className="text-indigo-600 dark:text-indigo-400 animate-spin" />
          <p className="text-sm text-indigo-700 dark:text-indigo-300">
            {analysisProgress || "正在进行分析..."}
          </p>
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

      {/* Go to analysis / function graph */}
      {analysisResult && !isAnalyzingSymbols && (
        <div className="mt-6 grid grid-cols-2 gap-4">
          <button
            onClick={() => onNavigate("analysis")}
            className="py-3 px-6 bg-indigo-600 text-white rounded-xl font-medium
              hover:bg-indigo-700 active:bg-indigo-800 transition-colors flex items-center justify-center gap-2"
          >
            <span>查看详细分析</span>
            <ArrowRight size={18} />
          </button>
          {hasFunctionGraphResults && (
            <button
              onClick={() => onNavigate("functionGraph")}
              className="py-3 px-6 bg-emerald-600 text-white rounded-xl font-medium
                hover:bg-emerald-700 active:bg-emerald-800 transition-colors flex items-center justify-center gap-2"
            >
              <span>查看函数图谱</span>
              <GitBranch size={18} />
            </button>
          )}
        </div>
      )}

      {/* History */}
      {historyGroups.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-[var(--text-faint)]" />
            <h3 className="text-base font-semibold text-[var(--text-primary)]">历史项目</h3>
          </div>
          <div className="space-y-2">
            {historyGroups.map((g) => (
              <div
                key={g.project_path}
                className="flex items-center gap-4 px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border-default)]
                  rounded-xl hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] transition-all group"
              >
                <div
                  className="flex-1 flex items-center gap-4 min-w-0 cursor-pointer"
                  onClick={() => setModalProject({ path: g.project_path, name: g.project_name })}
                >
                  <div className="w-9 h-9 rounded-lg bg-[var(--bg-muted)] flex items-center justify-center flex-shrink-0">
                    <FileCode size={16} className="text-[var(--text-faint)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {g.project_name}
                    </p>
                    <p className="text-xs text-[var(--text-faint)] font-mono truncate">
                      {g.project_path}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-[var(--text-muted)]">{formatTime(g.latest)}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">{g.count} 次分析</p>
                  </div>
                  <ChevronRight size={16} className="text-[var(--text-faint)] group-hover:text-[var(--text-secondary)] transition-colors flex-shrink-0" />
                </div>
                <button
                  onClick={async () => {
                    setProject(g.project_path);
                    await detectLanguages();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium
                    hover:bg-indigo-700 active:bg-indigo-800 transition-colors flex-shrink-0"
                >
                  <RotateCcw size={12} />
                  再次分析
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Modal */}
      {modalProject && (
        <HistoryModal
          projectPath={modalProject.path}
          projectName={modalProject.name}
          onClose={() => setModalProject(null)}
          onNavigate={onNavigate}
          onChanged={loadHistory}
        />
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
