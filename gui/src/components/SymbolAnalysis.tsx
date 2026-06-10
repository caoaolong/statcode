import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  Scan,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileCode,
  Loader2,
  Layers,
  Hash,
} from "lucide-react";
import { useProject } from "../context/ProjectContext";

type SortKey = "name" | "kind" | "file_path" | "line" | "reference_count";
type SortDir = "asc" | "desc";

const KIND_COLORS: Record<string, { bg: string; text: string }> = {
  Function: { bg: "bg-blue-100 dark:bg-blue-500/20", text: "text-blue-700 dark:text-blue-300" },
  Method: { bg: "bg-green-100 dark:bg-green-500/20", text: "text-green-700 dark:text-green-300" },
  Class: { bg: "bg-purple-100 dark:bg-purple-500/20", text: "text-purple-700 dark:text-purple-300" },
  Struct: { bg: "bg-cyan-100 dark:bg-cyan-500/20", text: "text-cyan-700 dark:text-cyan-300" },
  Interface: { bg: "bg-pink-100 dark:bg-pink-500/20", text: "text-pink-700 dark:text-pink-300" },
  Enum: { bg: "bg-orange-100 dark:bg-orange-500/20", text: "text-orange-700 dark:text-orange-300" },
  EnumMember: { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-300" },
  Variable: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-700 dark:text-slate-300" },
  Constant: { bg: "bg-teal-100 dark:bg-teal-500/20", text: "text-teal-700 dark:text-teal-300" },
  Field: { bg: "bg-indigo-100 dark:bg-indigo-500/20", text: "text-indigo-700 dark:text-indigo-300" },
  Property: { bg: "bg-violet-100 dark:bg-violet-500/20", text: "text-violet-700 dark:text-violet-300" },
  Module: { bg: "bg-lime-100 dark:bg-lime-500/20", text: "text-lime-700 dark:text-lime-300" },
  Namespace: { bg: "bg-emerald-100 dark:bg-emerald-500/20", text: "text-emerald-700 dark:text-emerald-300" },
  Constructor: { bg: "bg-sky-100 dark:bg-sky-500/20", text: "text-sky-700 dark:text-sky-300" },
};

const DEFAULT_KIND_COLOR = { bg: "bg-gray-100 dark:bg-gray-500/20", text: "text-gray-700 dark:text-gray-300" };

function getKindColor(kind: string) {
  return KIND_COLORS[kind] || DEFAULT_KIND_COLOR;
}

function KindBadge({ kind }: { kind: string }) {
  const c = getKindColor(kind);
  return (
    <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${c.bg} ${c.text}`}>
      {kind}
    </span>
  );
}

function shortenPath(filePath: string, projectPath: string | null): string {
  if (!projectPath) return filePath;
  const normalized = projectPath.replace(/\\/g, "/");
  const normalizedFile = filePath.replace(/\\/g, "/");
  if (normalizedFile.startsWith(normalized)) {
    return normalizedFile.slice(normalized.length).replace(/^\//, "");
  }
  return filePath;
}

export default function SymbolAnalysis() {
  const { symbolResults, isAnalyzingSymbols, availableLanguages, selectedLanguages, projectPath } = useProject();
  const [activeTab, setActiveTab] = useState<string>(() => {
    const keys = Object.keys(symbolResults);
    if (keys.length > 0) return keys[0];
    return selectedLanguages[0] || "";
  });
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("reference_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Virtual scroll
  const ROW_HEIGHT = 40;
  const OVERSCAN = 8;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop);
    }
  }, []);

  const langTabs = useMemo(() => {
    return selectedLanguages.map((id) => {
      const lang = availableLanguages.find((l) => l.id === id);
      const result = symbolResults[id];
      return {
        id,
        label: lang?.language || id,
        count: result?.total_symbols ?? 0,
        loaded: !!result,
      };
    });
  }, [selectedLanguages, availableLanguages, symbolResults]);

  const currentResult = symbolResults[activeTab];

  const availableKinds = useMemo(() => {
    if (!currentResult) return [];
    const kinds = new Set(currentResult.symbols.map((s) => s.kind));
    return Array.from(kinds).sort();
  }, [currentResult]);

  const filteredSymbols = useMemo(() => {
    if (!currentResult) return [];
    let symbols = currentResult.symbols;

    // Filter by kind
    if (kindFilter) {
      symbols = symbols.filter((s) => s.kind === kindFilter);
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      symbols = symbols.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.kind.toLowerCase().includes(q) ||
          s.file_path.toLowerCase().includes(q),
      );
    }

    // Sort
    symbols = [...symbols].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "kind":
          cmp = a.kind.localeCompare(b.kind);
          break;
        case "file_path":
          cmp = a.file_path.localeCompare(b.file_path);
          break;
        case "line":
          cmp = a.line - b.line;
          break;
        case "reference_count":
          cmp = a.reference_count - b.reference_count;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return symbols;
  }, [currentResult, search, kindFilter, sortKey, sortDir]);

  // Virtual scroll calculations
  const { startIndex, endIndex, offsetY, totalHeight } = useMemo(() => {
    const total = filteredSymbols.length * ROW_HEIGHT;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);
    const end = Math.min(filteredSymbols.length, start + visibleCount + OVERSCAN * 2);
    return {
      startIndex: start,
      endIndex: end,
      offsetY: start * ROW_HEIGHT,
      totalHeight: total,
    };
  }, [filteredSymbols.length, scrollTop, containerHeight]);

  // Reset scroll on filter/sort change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [search, kindFilter, sortKey, sortDir, activeTab]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "reference_count" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown size={12} className="text-[var(--text-faint)]" />;
    return sortDir === "asc" ? (
      <ArrowUp size={12} className="text-indigo-500" />
    ) : (
      <ArrowDown size={12} className="text-indigo-500" />
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">符号分析</h2>
        <p className="text-[var(--text-muted)]">
          基于 LSP 协议提取项目中的代码符号及其引用关系
        </p>
      </div>

      {/* Language Tabs */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl overflow-hidden">
        <div className="flex border-b border-[var(--border-default)] px-2 overflow-x-auto">
          {langTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearch("");
                  setKindFilter("");
                }}
                className={`
                  relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                  transition-colors
                  ${isActive
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }
                `}
              >
                <FileCode size={16} />
                {tab.label}
                {tab.loaded && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-faint)]">
                    {tab.count}
                  </span>
                )}
                {!tab.loaded && isAnalyzingSymbols && (
                  <Loader2 size={12} className="animate-spin text-indigo-400" />
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-600 rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Loading state */}
          {!currentResult && isAnalyzingSymbols && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={32} className="text-indigo-500 animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">正在进行符号分析...</p>
            </div>
          )}

          {/* No results */}
          {!currentResult && !isAnalyzingSymbols && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Scan size={48} className="text-[var(--text-faint)]" />
              <p className="text-[var(--text-muted)]">暂无符号分析数据</p>
              <p className="text-sm text-[var(--text-faint)]">
                请先在项目选择页面选择语言并开始分析
              </p>
            </div>
          )}

          {/* Results */}
          {currentResult && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers size={16} className="text-indigo-500" />
                    <span className="text-xs text-[var(--text-faint)]">总符号数</span>
                  </div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">
                    {currentResult.total_symbols.toLocaleString()}
                  </p>
                </div>
                <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <FileCode size={16} className="text-emerald-500" />
                    <span className="text-xs text-[var(--text-faint)]">扫描文件</span>
                  </div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">
                    {currentResult.files_scanned.toLocaleString()}
                  </p>
                </div>
                <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Hash size={16} className="text-amber-500" />
                    <span className="text-xs text-[var(--text-faint)]">引用总数</span>
                  </div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">
                    {currentResult.symbols
                      .reduce((sum, s) => sum + s.reference_count, 0)
                      .toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Search & Filter */}
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
                  />
                  <input
                    type="text"
                    placeholder="搜索符号名称、类型或文件路径..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-subtle)] border border-[var(--border-default)]
                      rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)]
                      focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
                      transition-colors"
                  />
                </div>
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                  className="px-3 py-2.5 bg-[var(--bg-subtle)] border border-[var(--border-default)]
                    rounded-xl text-sm text-[var(--text-primary)]
                    focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
                    transition-colors cursor-pointer appearance-none pr-8
                    bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
                    bg-[length:12px] bg-[right_10px_center] bg-no-repeat"
                >
                  <option value="">全部类型</option>
                  {availableKinds.map((kind) => (
                    <option key={kind} value={kind}>{kind}</option>
                  ))}
                </select>
              </div>

              {/* Table */}
              <div className="border border-[var(--border-default)] rounded-xl overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-[var(--bg-subtle)]">
                    <tr>
                      <th
                        onClick={() => handleSort("name")}
                        className="text-left px-4 py-3 font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors w-[22%]"
                      >
                        <div className="flex items-center gap-1.5">
                          符号名称
                          <SortIcon column="name" />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("kind")}
                        className="text-left px-4 py-3 font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors w-[13%]"
                      >
                        <div className="flex items-center gap-1.5">
                          类型
                          <SortIcon column="kind" />
                        </div>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)] w-[50%]">
                        详情
                      </th>
                      <th
                        onClick={() => handleSort("reference_count")}
                        className="text-right px-4 py-3 font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors w-[15%]"
                      >
                        <div className="flex items-center gap-1.5 justify-end">
                          引用次数
                          <SortIcon column="reference_count" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                </table>
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="overflow-y-auto max-h-[60vh]"
                >
                  {filteredSymbols.length === 0 ? (
                    <div className="px-4 py-12 text-center text-[var(--text-muted)] text-sm">
                      {(search || kindFilter) ? "没有匹配的符号" : "未找到符号"}
                    </div>
                  ) : (
                    <div style={{ height: totalHeight, position: "relative" }}>
                      <table className="w-full text-sm table-fixed" style={{ transform: `translateY(${offsetY}px)` }}>
                        <tbody>
                          {filteredSymbols.slice(startIndex, endIndex).map((sym, i) => {
                            const idx = startIndex + i;
                            return (
                              <tr
                                key={`${sym.file_path}-${sym.line}-${sym.column}-${idx}`}
                                className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] transition-colors"
                                style={{ height: ROW_HEIGHT }}
                              >
                                <td className="px-4 w-[22%]">
                                  <span
                                    className="font-mono text-[var(--text-primary)] font-medium truncate block"
                                    title={`${shortenPath(sym.file_path, projectPath)}:${sym.line}:${sym.column}`}
                                  >
                                    {sym.name}
                                  </span>
                                </td>
                                <td className="px-4 w-[13%]">
                                  <KindBadge kind={sym.kind} />
                                </td>
                                <td className="px-4 w-[50%]">
                                  <span className="text-xs font-mono text-[var(--text-muted)] truncate block" title={sym.detail || undefined}>
                                    {sym.detail || "—"}
                                  </span>
                                </td>
                                <td className="px-4 text-right w-[15%]">
                                  <span
                                    className={`
                                      inline-block text-xs font-mono px-2 py-0.5 rounded-full
                                      ${sym.reference_count > 10
                                        ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold"
                                        : sym.reference_count > 0
                                          ? "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                                          : "bg-[var(--bg-subtle)] text-[var(--text-faint)]"
                                      }
                                    `}
                                  >
                                    {sym.reference_count}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer info */}
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-faint)]">
                <span>
                  显示 {filteredSymbols.length} / {currentResult.total_symbols} 个符号
                  {kindFilter && <span className="ml-1">· 类型: {kindFilter}</span>}
                </span>
                {(search || kindFilter) && (
                  <button
                    onClick={() => { setSearch(""); setKindFilter(""); }}
                    className="text-indigo-500 hover:text-indigo-600 transition-colors"
                  >
                    清除筛选
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
