import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { GraphCanvas, type GraphNode, type GraphEdge } from "reagraph";
import {
  Play,
  Search,
  GitBranch,
  Layers,
  FileCode,
  Link2,
  X,
  ArrowUpRight,
  ArrowDownRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutGrid,
} from "lucide-react";
import { useProject } from "../context/ProjectContext";
import type { FunctionGraphResult, FunctionNode, LspServerInfo } from "../types";

const KIND_COLORS: Record<string, string> = {
  Function: "#3b82f6",
  Method: "#22c55e",
  Constructor: "#a855f7",
  Class: "#f59e0b",
  Struct: "#06b6d4",
};

function getKindColor(kind: string): string {
  return KIND_COLORS[kind] || "#6b7280";
}

// ── Summary Cards ──────────────────────────────────────────────────

function SummaryCards({ result }: { result: FunctionGraphResult }) {
  const maxCallers = result.nodes.reduce((m, n) => Math.max(m, n.caller_count), 0);
  const mostCalled = result.nodes.find((n) => n.caller_count === maxCallers);

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
          <GitBranch size={14} /> 函数总数
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {result.nodes.length}
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
          <Link2 size={14} /> 调用关系
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {result.edges.length}
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
          <FileCode size={14} /> 扫描文件
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {result.files_scanned}
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
          <Layers size={14} /> 被调用最多
        </div>
        <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate" title={mostCalled?.name}>
          {mostCalled ? `${mostCalled.name} (${maxCallers})` : "—"}
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ───────────────────────────────────────────────────

function DetailPanel({
  node,
  result,
  onClose,
  onSelectNode,
}: {
  node: FunctionNode;
  result: FunctionGraphResult;
  onClose: () => void;
  onSelectNode: (id: string) => void;
}) {
  const callers = result.edges
    .filter((e) => e.target === node.id)
    .map((e) => result.nodes.find((n) => n.id === e.source))
    .filter(Boolean) as FunctionNode[];

  const callees = result.edges
    .filter((e) => e.source === node.id)
    .map((e) => result.nodes.find((n) => n.id === e.target))
    .filter(Boolean) as FunctionNode[];

  return (
    <div className="w-72 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {node.name}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span
            className="px-2 py-0.5 rounded text-xs font-medium text-white"
            style={{ backgroundColor: getKindColor(node.kind) }}
          >
            {node.kind}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            行 {node.line}
          </span>
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 break-all">
          {node.file_path}
        </div>

        {/* Callers */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            <ArrowDownRight size={12} className="text-green-500" />
            调用者 ({callers.length})
          </div>
          {callers.length === 0 ? (
            <div className="text-xs text-gray-400 italic">无调用者（入口函数）</div>
          ) : (
            <div className="space-y-1">
              {callers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectNode(c.id)}
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getKindColor(c.kind) }}
                  />
                  <span className="truncate">{c.name}</span>
                  <span className="text-gray-400 ml-auto flex-shrink-0">
                    :{c.line}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Callees */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            <ArrowUpRight size={12} className="text-blue-500" />
            被调用者 ({callees.length})
          </div>
          {callees.length === 0 ? (
            <div className="text-xs text-gray-400 italic">无被调用者（叶子函数）</div>
          ) : (
            <div className="space-y-1">
              {callees.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectNode(c.id)}
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getKindColor(c.kind) }}
                  />
                  <span className="truncate">{c.name}</span>
                  <span className="text-gray-400 ml-auto flex-shrink-0">
                    :{c.line}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export default function FunctionGraph() {
  const {
    projectPath,
    availableLanguages,
    selectedLanguages,
    functionGraphResults,
    setFunctionGraphResult,
  } = useProject();

  const [activeTab, setActiveTab] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [layout, setLayout] = useState<"forceDirected2d" | "hierarchicalTd">("forceDirected2d");

  const graphRef = useRef<any>(null);

  // Set active tab to first selected language
  useEffect(() => {
    if (selectedLanguages.length > 0 && !selectedLanguages.includes(activeTab)) {
      setActiveTab(selectedLanguages[0]);
    }
  }, [selectedLanguages, activeTab]);

  // Listen for progress events
  useEffect(() => {
    const unlisten = listen<{ stage: string; message: string }>(
      "function-graph-progress",
      (event) => {
        setProgress(event.payload.message);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const currentResult = activeTab ? functionGraphResults[activeTab] : null;

  const handleAnalyze = useCallback(async () => {
    if (!projectPath || !activeTab) return;

    const langInfo: LspServerInfo | undefined = availableLanguages.find(
      (l) => l.id === activeTab
    );
    if (!langInfo) return;

    setAnalyzing(true);
    setError(null);
    setProgress("正在启动分析...");
    setSelectedNodeId(null);

    try {
      const result = await invoke<FunctionGraphResult>("analyze_function_graph", {
        projectPath,
        language: langInfo.language,
        command: langInfo.command,
        args: langInfo.args,
        extensions: langInfo.extensions,
        ignoreRules: null,
      });
      setFunctionGraphResult(activeTab, result);
      setProgress("");
    } catch (err) {
      setError(String(err));
      setProgress("");
    } finally {
      setAnalyzing(false);
    }
  }, [projectPath, activeTab, availableLanguages, setFunctionGraphResult]);

  // Build reagraph data
  const graphNodes: GraphNode[] = (currentResult?.nodes || []).map((n) => ({
    id: n.id,
    label: n.name,
    fill: getKindColor(n.kind),
  }));

  const graphEdges: GraphEdge[] = (currentResult?.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));

  // Filter by search
  const matchingIds = new Set<string>();
  if (searchQuery && currentResult) {
    const q = searchQuery.toLowerCase();
    for (const n of currentResult.nodes) {
      if (
        n.name.toLowerCase().includes(q) ||
        n.short_path.toLowerCase().includes(q)
      ) {
        matchingIds.add(n.id);
      }
    }
  }

  const isFiltering = searchQuery.length > 0;

  // Filtered graph data
  const displayNodes: GraphNode[] = isFiltering
    ? graphNodes.filter((n) => matchingIds.has(n.id))
    : graphNodes;

  const displayEdges: GraphEdge[] = isFiltering
    ? graphEdges.filter((e) => matchingIds.has(e.source) && matchingIds.has(e.target))
    : graphEdges;

  // Selected node data
  const selectedNode = currentResult?.nodes.find((n) => n.id === selectedNodeId) || null;

  // Highlighted nodes (connected to selected)
  const highlightedIds = new Set<string>();
  if (selectedNodeId && currentResult) {
    highlightedIds.add(selectedNodeId);
    for (const e of currentResult.edges) {
      if (e.source === selectedNodeId) highlightedIds.add(e.target);
      if (e.target === selectedNodeId) highlightedIds.add(e.source);
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              函数图谱
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              扫描项目函数，分析调用关系，生成知识图谱
            </p>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !projectPath || selectedLanguages.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={14} />
            {analyzing ? "分析中..." : "开始分析"}
          </button>
        </div>

        {/* Language tabs */}
        {selectedLanguages.length > 0 && (
          <div className="flex gap-1">
            {selectedLanguages.map((langId) => {
              const lang = availableLanguages.find((l) => l.id === langId);
              const hasResult = !!functionGraphResults[langId];
              return (
                <button
                  key={langId}
                  onClick={() => {
                    setActiveTab(langId);
                    setSelectedNodeId(null);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activeTab === langId
                      ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {lang?.language || langId}
                  {hasResult && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Progress / Error */}
      {progress && (
        <div className="flex-shrink-0 px-6 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            {progress}
          </div>
        </div>
      )}
      {error && (
        <div className="flex-shrink-0 px-6 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
        </div>
      )}

      {/* Content */}
      {!currentResult ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <GitBranch
              size={48}
              className="mx-auto mb-4 text-gray-300 dark:text-gray-600"
            />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {selectedLanguages.length === 0
                ? "请先在项目选择页面选择编程语言"
                : "点击「开始分析」扫描函数调用关系"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Graph area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Toolbar */}
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="relative flex-1 max-w-xs">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="搜索函数名或文件..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-3">
                <button
                  onClick={() => setLayout(layout === "forceDirected2d" ? "hierarchicalTd" : "forceDirected2d")}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                  title={layout === "forceDirected2d" ? "切换为层次布局" : "切换为力导向布局"}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => {
                    if (graphRef.current?.centerGraph) {
                      graphRef.current.centerGraph();
                    }
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                  title="居中"
                >
                  <Maximize2 size={14} />
                </button>
                <button
                  onClick={() => {
                    if (graphRef.current?.zoomIn) {
                      graphRef.current.zoomIn();
                    }
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                  title="放大"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  onClick={() => {
                    if (graphRef.current?.zoomOut) {
                      graphRef.current.zoomOut();
                    }
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                  title="缩小"
                >
                  <ZoomOut size={14} />
                </button>
              </div>

              {isFiltering && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  显示 {displayNodes.length}/{graphNodes.length} 个节点
                </span>
              )}
            </div>

            {/* Summary cards */}
            <div className="flex-shrink-0 px-4 pt-3">
              <SummaryCards result={currentResult} />
            </div>

            {/* Graph */}
            <div className="flex-1 min-h-0 relative">
              {displayNodes.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  {isFiltering ? "没有匹配的函数" : "没有发现函数"}
                </div>
              ) : (
                <GraphCanvas
                  ref={graphRef}
                  nodes={displayNodes}
                  edges={displayEdges}
                  layoutType={layout}
                  edgeArrowPosition="end"
                  edgeInterpolation="curved"
                  labelType="auto"
                  selections={selectedNodeId ? [selectedNodeId] : []}
                  actives={highlightedIds.size > 0 ? Array.from(highlightedIds) : undefined}
                  onNodeClick={(node) => {
                    setSelectedNodeId(node.id);
                  }}
                  onCanvasClick={() => {
                    setSelectedNodeId(null);
                  }}
                />
              )}
            </div>
          </div>

          {/* Detail panel */}
          {selectedNode && (
            <DetailPanel
              node={selectedNode}
              result={currentResult}
              onClose={() => setSelectedNodeId(null)}
              onSelectNode={(id) => setSelectedNodeId(id)}
            />
          )}
        </div>
      )}
    </div>
  );
}
