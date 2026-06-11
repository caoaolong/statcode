import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ForceGraph2D from "react-force-graph-2d";
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
  Filter,
} from "lucide-react";
import { useProject } from "../context/ProjectContext";
import type { FunctionGraphResult, FunctionNode, FunctionEdge, LspServerInfo } from "../types";

const KIND_COLORS: Record<string, string> = {
  Function: "#3b82f6",
  Method: "#22c55e",
  Constructor: "#a855f7",
  Class: "#f59e0b",
  Struct: "#06b6d4",
};

const MAX_COMPACT_NODES = 200;
const MAX_FOCUS_NODES = 350;
const LARGE_GRAPH_THRESHOLD = 180;
const SIMPLE_LINK_THRESHOLD = 250;

function getKindColor(kind: string): string {
  return KIND_COLORS[kind] || "#6b7280";
}

function buildNeighborMap(edges: FunctionEdge[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!map.has(e.source)) map.set(e.source, new Set());
    if (!map.has(e.target)) map.set(e.target, new Set());
    map.get(e.source)!.add(e.target);
    map.get(e.target)!.add(e.source);
  }
  return map;
}

function selectDisplayGraph(
  result: FunctionGraphResult,
  opts: {
    showAll: boolean;
    selectedId: string | null;
    searchQuery: string;
  },
): { nodes: FunctionNode[]; edges: FunctionEdge[]; truncated: boolean } {
  const { nodes: allNodes, edges: allEdges } = result;

  if (opts.showAll) {
    return { nodes: allNodes, edges: allEdges, truncated: false };
  }

  const filterEdges = (nodeIds: Set<string>) =>
    allEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  if (opts.searchQuery.trim()) {
    const q = opts.searchQuery.toLowerCase();
    const ids = new Set<string>();
    for (const n of allNodes) {
      if (n.name.toLowerCase().includes(q) || n.short_path.toLowerCase().includes(q)) {
        ids.add(n.id);
      }
    }
    for (const id of [...ids]) {
      for (const e of allEdges) {
        if (e.source === id) ids.add(e.target);
        if (e.target === id) ids.add(e.source);
      }
    }
    return {
      nodes: allNodes.filter((n) => ids.has(n.id)),
      edges: filterEdges(ids),
      truncated: ids.size < allNodes.length,
    };
  }

  if (opts.selectedId) {
    const ids = new Set<string>([opts.selectedId]);
    const hop1 = new Set<string>();
    for (const e of allEdges) {
      if (e.source === opts.selectedId) hop1.add(e.target);
      if (e.target === opts.selectedId) hop1.add(e.source);
    }
    hop1.forEach((id) => ids.add(id));
    if (ids.size < MAX_FOCUS_NODES) {
      for (const id of hop1) {
        for (const e of allEdges) {
          if (e.source === id) ids.add(e.target);
          if (e.target === id) ids.add(e.source);
        }
      }
    }
    if (ids.size > MAX_FOCUS_NODES) {
      ids.clear();
      ids.add(opts.selectedId);
      hop1.forEach((id) => ids.add(id));
    }
    return {
      nodes: allNodes.filter((n) => ids.has(n.id)),
      edges: filterEdges(ids),
      truncated: ids.size < allNodes.length,
    };
  }

  const sorted = [...allNodes].sort(
    (a, b) =>
      b.caller_count + b.callee_count - (a.caller_count + a.callee_count),
  );
  const top = sorted.slice(0, MAX_COMPACT_NODES);
  const ids = new Set(top.map((n) => n.id));
  return {
    nodes: top,
    edges: filterEdges(ids),
    truncated: allNodes.length > MAX_COMPACT_NODES,
  };
}

function shouldUseGridLayout(nodeCount: number, edgeCount: number): boolean {
  return edgeCount === 0 || (nodeCount > 120 && edgeCount / nodeCount < 0.08);
}

function applyGridLayout(
  nodes: FGNode[],
  width: number,
  height: number,
): void {
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const rows = Math.ceil(nodes.length / cols);
  const cellW = width / Math.max(cols, 1);
  const cellH = height / Math.max(rows, 1);
  nodes.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW + cellW / 2;
    const y = row * cellH + cellH / 2;
    n.fx = x;
    n.fy = y;
    n.x = x;
    n.y = y;
  });
}

function clearFixedPositions(nodes: FGNode[]): void {
  for (const n of nodes) {
    n.fx = undefined;
    n.fy = undefined;
  }
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
  const { callers, callees } = useMemo(() => {
    const nodeMap = new Map(result.nodes.map((n) => [n.id, n]));
    const callers: FunctionNode[] = [];
    const callees: FunctionNode[] = [];
    for (const e of result.edges) {
      if (e.target === node.id) {
        const c = nodeMap.get(e.source);
        if (c) callers.push(c);
      }
      if (e.source === node.id) {
        const c = nodeMap.get(e.target);
        if (c) callees.push(c);
      }
    }
    return { callers, callees };
  }, [node.id, result.nodes, result.edges]);

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

        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            <ArrowDownRight size={12} className="text-green-500" />
            调用者 ({callers.length})
          </div>
          {callers.length === 0 ? (
            <div className="text-xs text-gray-400 italic">无调用者（入口函数）</div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
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

        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            <ArrowUpRight size={12} className="text-blue-500" />
            被调用者 ({callees.length})
          </div>
          {callees.length === 0 ? (
            <div className="text-xs text-gray-400 italic">无被调用者（叶子函数）</div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
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

// ── Force Graph ────────────────────────────────────────────────────

interface FGNode {
  id: string;
  label: string;
  kind: string;
  color: string;
  shortPath: string;
  line: number;
  callerCount: number;
  calleeCount: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface FGLink {
  source: string;
  target: string;
}

function FunctionCallGraph({
  result,
  selectedNodeId,
  onSelectNode,
  searchQuery,
  showAll,
  onToggleShowAll,
}: {
  result: FunctionGraphResult;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  searchQuery: string;
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({
        w: entry.contentRect.width,
        h: Math.max(400, entry.contentRect.height),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayGraph = useMemo(
    () =>
      selectDisplayGraph(result, {
        showAll,
        selectedId: selectedNodeId,
        searchQuery,
      }),
    [result, showAll, selectedNodeId, searchQuery],
  );

  const neighborMap = useMemo(
    () => buildNeighborMap(displayGraph.edges),
    [displayGraph.edges],
  );

  const useGrid = useMemo(
    () => shouldUseGridLayout(displayGraph.nodes.length, displayGraph.edges.length),
    [displayGraph.nodes.length, displayGraph.edges.length],
  );

  const isLargeGraph = displayGraph.nodes.length >= LARGE_GRAPH_THRESHOLD;

  const { nodes, links } = useMemo(() => {
    const nodes: FGNode[] = displayGraph.nodes.map((n) => ({
      id: n.id,
      label: n.name,
      kind: n.kind,
      color: getKindColor(n.kind),
      shortPath: n.short_path,
      line: n.line,
      callerCount: n.caller_count,
      calleeCount: n.callee_count,
    }));
    const links: FGLink[] = displayGraph.edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));

    if (useGrid) {
      applyGridLayout(nodes, dimensions.w, dimensions.h);
    } else {
      clearFixedPositions(nodes);
    }

    return { nodes, links };
  }, [displayGraph.nodes, displayGraph.edges, useGrid, dimensions.w, dimensions.h]);

  const highlightSet = useMemo(() => {
    if (!selectedNodeId) return null;
    const set = new Set<string>([selectedNodeId]);
    const neighbors = neighborMap.get(selectedNodeId);
    if (neighbors) neighbors.forEach((id) => set.add(id));
    return set;
  }, [selectedNodeId, neighborMap]);

  const searchSet = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return new Set(
      nodes
        .filter(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            n.shortPath.toLowerCase().includes(q),
        )
        .map((n) => n.id),
    );
  }, [nodes, searchQuery]);

  const isNodeVisible = useCallback(
    (nodeId: string) => {
      const isHL = highlightSet
        ? highlightSet.has(nodeId)
        : searchSet
          ? searchSet.has(nodeId)
          : true;
      return !((highlightSet || searchSet) && !isHL);
    },
    [highlightSet, searchSet],
  );

  const nodeCanvasObject = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!isNodeVisible(node.id)) {
        ctx.globalAlpha = 0.08;
      } else {
        ctx.globalAlpha = 1;
      }

      const isSelected = selectedNodeId === node.id;
      const showLabel =
        !isLargeGraph || isSelected || globalScale > 1.2;

      if (isLargeGraph) {
        const r = isSelected ? 5 : 3;
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
        ctx.fillStyle = node.color;
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        if (showLabel) {
          ctx.fillStyle = "#f1f5f9";
          ctx.font = "10px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const label =
            node.label.length > 14
              ? node.label.slice(0, 12) + "…"
              : node.label;
          ctx.fillText(label, node.x!, node.y! + r + 2);
        }
        ctx.globalAlpha = 1;
        return;
      }

      const w = Math.max(72, node.label.length * 7 + 20);
      const h = 28;
      const x = node.x! - w / 2;
      const y = node.y! - h / 2;

      if (isSelected) {
        ctx.shadowColor = node.color + "44";
        ctx.shadowBlur = 6;
      }

      ctx.fillStyle = isSelected ? node.color + "22" : "#1e293b";
      ctx.strokeStyle = isSelected ? node.color : "#334155";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 5);
      ctx.fill();
      ctx.stroke();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.roundRect(x, y, 4, h, [5, 0, 0, 5]);
      ctx.fill();

      ctx.fillStyle = "#f1f5f9";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const displayLabel =
        node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label;
      ctx.fillText(displayLabel, x + 8, y + h / 2);

      ctx.globalAlpha = 1;
    },
    [selectedNodeId, isLargeGraph, isNodeVisible],
  );

  const nodePointerAreaPaint = useCallback(
    (node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
      if (isLargeGraph) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, 6, 0, 2 * Math.PI);
        ctx.fill();
        return;
      }
      const w = Math.max(72, node.label.length * 7 + 20);
      const h = 28;
      ctx.fillStyle = color;
      ctx.fillRect(node.x! - w / 2, node.y! - h / 2, w, h);
    },
    [isLargeGraph],
  );

  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => {
      const sid =
        typeof link.source === "object"
          ? (link.source as FGNode).id
          : link.source;
      const tid =
        typeof link.target === "object"
          ? (link.target as FGNode).id
          : link.target;
      const isHL = highlightSet
        ? highlightSet.has(sid) && highlightSet.has(tid)
        : searchSet
          ? searchSet.has(sid) && searchSet.has(tid)
          : true;
      const opacity =
        (highlightSet || searchSet) && !isHL ? 0.04 : 0.55;

      ctx.globalAlpha = opacity;

      const sx = link.source.x!;
      const sy = link.source.y!;
      const tx = link.target.x!;
      const ty = link.target.y!;

      const isActive = highlightSet?.has(sid) && highlightSet.has(tid);
      ctx.strokeStyle = isActive ? "#818cf8" : "#475569";
      ctx.lineWidth = isActive ? 1.8 : 0.8;

      const useSimpleLinks = links.length >= SIMPLE_LINK_THRESHOLD;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      if (useSimpleLinks) {
        ctx.lineTo(tx, ty);
      } else {
        const dx = tx - sx;
        const dy = ty - sy;
        const mx = (sx + tx) / 2 + dy * 0.12;
        const my = (sy + ty) / 2 - dx * 0.12;
        ctx.quadraticCurveTo(mx, my, tx, ty);
      }
      ctx.stroke();

      if (!useSimpleLinks) {
        const dx = tx - sx;
        const dy = ty - sy;
        const angle = Math.atan2(dy, dx);
        const arrowLen = 4;
        const ax = tx - arrowLen * Math.cos(angle);
        const ay = ty - arrowLen * Math.sin(angle);
        ctx.fillStyle = isActive ? "#6366f1" : "#64748b";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(
          ax - arrowLen * 0.5 * Math.cos(angle - Math.PI / 6),
          ay - arrowLen * 0.5 * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
          ax - arrowLen * 0.5 * Math.cos(angle + Math.PI / 6),
          ay - arrowLen * 0.5 * Math.sin(angle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    },
    [highlightSet, searchSet, links.length],
  );

  const handleZoomIn = () => {
    if (fgRef.current) {
      const z = fgRef.current.zoom();
      fgRef.current.zoom(z * 1.3, 300);
    }
  };
  const handleZoomOut = () => {
    if (fgRef.current) {
      const z = fgRef.current.zoom();
      fgRef.current.zoom(z / 1.3, 300);
    }
  };
  const handleFit = () => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 40);
    }
  };

  const forceConfig = useMemo(() => {
    const n = nodes.length;
    if (useGrid) return null;
    if (n > 400) {
      return {
        d3AlphaDecay: 0.12,
        d3VelocityDecay: 0.5,
        warmupTicks: 20,
        cooldownTime: 800,
      };
    }
    if (n > 150) {
      return {
        d3AlphaDecay: 0.08,
        d3VelocityDecay: 0.45,
        warmupTicks: 35,
        cooldownTime: 1200,
      };
    }
    return {
      d3AlphaDecay: 0.05,
      d3VelocityDecay: 0.4,
      warmupTicks: 50,
      cooldownTime: 2000,
    };
  }, [nodes.length, useGrid]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        {searchQuery ? "没有匹配的函数" : "没有发现函数"}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-h-0">
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button
          onClick={onToggleShowAll}
          title={showAll ? "切换为精简视图" : "显示全部函数"}
          className={`p-1.5 border rounded-lg transition-colors ${
            showAll
              ? "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300"
              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
        >
          <Filter size={14} />
        </button>
        <button
          onClick={handleZoomIn}
          className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={handleFit}
          className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        {displayGraph.truncated && (
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
            显示 {nodes.length} / {result.nodes.length} 个重点函数
            {!showAll && " · 点击筛选按钮查看全部"}
          </div>
        )}
        {useGrid && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-1.5 text-xs text-blue-700 dark:text-blue-300">
            调用关系稀疏，已使用网格布局提升性能
          </div>
        )}
      </div>

      <div
        className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-[#0f172a] h-full"
        style={{ minHeight: 400 }}
      >
        <ForceGraph2D
          ref={fgRef}
          graphData={{ nodes, links }}
          width={dimensions.w}
          height={dimensions.h}
          backgroundColor="#0f172a"
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkCanvasObject={linkCanvasObject}
          linkCanvasObjectMode={() => "replace"}
          onNodeClick={(node) => {
            const n = node as FGNode;
            onSelectNode(selectedNodeId === n.id ? null : n.id);
          }}
          onBackgroundClick={() => onSelectNode(null)}
          d3AlphaDecay={forceConfig?.d3AlphaDecay ?? 1}
          d3VelocityDecay={forceConfig?.d3VelocityDecay ?? 0.4}
          warmupTicks={forceConfig?.warmupTicks ?? 0}
          cooldownTime={forceConfig?.cooldownTime ?? 0}
          d3Force={
            useGrid
              ? {
                  charge: { strength: 0 },
                  link: { strength: 0 },
                  center: { strength: 0 },
                }
              : {
                  charge: {
                    strength: isLargeGraph ? -300 : -500,
                    distanceMax: isLargeGraph ? 250 : 350,
                  },
                  link: { distance: 120, iterations: isLargeGraph ? 1 : 2 },
                  center: { strength: 0.03 },
                }
          }
          enableNodeDrag={!useGrid && nodes.length < 300}
          enableZoomPanInteraction
        />
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
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (selectedLanguages.length > 0 && !selectedLanguages.includes(activeTab)) {
      setActiveTab(selectedLanguages[0]);
    }
  }, [selectedLanguages, activeTab]);

  useEffect(() => {
    setShowAll(false);
    setSelectedNodeId(null);
    setSearchQuery("");
  }, [activeTab]);

  useEffect(() => {
    const unlisten = listen<{ stage: string; message: string }>(
      "function-graph-progress",
      (event) => {
        setProgress(event.payload.message);
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const currentResult = activeTab ? functionGraphResults[activeTab] : null;

  const handleAnalyze = useCallback(async () => {
    if (!projectPath || !activeTab) return;

    const langInfo: LspServerInfo | undefined = availableLanguages.find(
      (l) => l.id === activeTab,
    );
    if (!langInfo) return;

    setAnalyzing(true);
    setError(null);
    setProgress("正在启动分析...");
    setSelectedNodeId(null);
    setShowAll(false);

    try {
      const result = await invoke<FunctionGraphResult>("analyze_function_graph", {
        projectPath,
        language: langInfo.language,
        command: langInfo.path || langInfo.command,
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

  const selectedNode =
    currentResult?.nodes.find((n) => n.id === selectedNodeId) || null;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
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
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
              <span className="text-xs text-gray-400">
                默认显示调用最频繁的 {MAX_COMPACT_NODES} 个函数
              </span>
            </div>

            <div className="flex-shrink-0 px-4 pt-3">
              <SummaryCards result={currentResult} />
            </div>

            <FunctionCallGraph
              result={currentResult}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              searchQuery={searchQuery}
              showAll={showAll}
              onToggleShowAll={() => setShowAll((v) => !v)}
            />
          </div>

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
