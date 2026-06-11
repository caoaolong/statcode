import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Network,
  FileCode,
  Loader2,
  Play,
  Layers,
  GitBranch,
  AlertTriangle,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ForceGraph2D from "react-force-graph-2d";
import { useProject } from "../context/ProjectContext";
import { getExtColor } from "../lib/utils";
import type { ModuleAnalysisResult, ModuleNode } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────

function shortenPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  if (parts.length <= 2) return parts.join("/");
  return parts.slice(-3).join("/");
}

function getExtFromPath(p: string): string {
  const m = p.match(/\.(\w+)$/);
  return m ? m[1].toLowerCase() : "";
}

// ── Graph Node / Link types ──────────────────────────────────────────

interface GNode {
  id: string;
  label: string;
  shortPath: string;
  lineCount: number;
  color: string;
  isCycle: boolean;
  isRoot: boolean;
  isLeaf: boolean;
  outCount: number;
  inCount: number;
  node: ModuleNode;
  x?: number;
  y?: number;
}

interface GLink {
  source: string;
  target: string;
  symbols: string[];
  isCycle: boolean;
}

// ── Knowledge Graph Component ────────────────────────────────────────

function KnowledgeGraph({
  result,
  selectedNode,
  onSelectNode,
  searchQuery,
}: {
  result: ModuleAnalysisResult;
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
  searchQuery: string;
}) {
  const fgRef = useRef<any>(null);
  const hoverNodeRef = useRef<GNode | null>(null);
  const [hoverNode, setHoverNode] = useState<GNode | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipUpdateTimer = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({ w: entry.contentRect.width, h: Math.max(400, entry.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build cycle set
  const cycleSet = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < result.edges.length; i++) {
      for (let j = i + 1; j < result.edges.length; j++) {
        if (result.edges[i].from === result.edges[j].to && result.edges[i].to === result.edges[j].from) {
          set.add(result.edges[i].from);
          set.add(result.edges[i].to);
        }
      }
    }
    return set;
  }, [result.edges]);

  // Build graph data
  const { nodes, links } = useMemo(() => {
    const outMap = new Map<string, number>();
    const inMap = new Map<string, number>();
    result.edges.forEach((e) => {
      outMap.set(e.from, (outMap.get(e.from) || 0) + 1);
      inMap.set(e.to, (inMap.get(e.to) || 0) + 1);
    });

    const nodes: GNode[] = result.nodes.map((n) => {
      const out = outMap.get(n.file_path) || 0;
      const inp = inMap.get(n.file_path) || 0;
      return {
        id: n.file_path,
        label: shortenPath(n.short_path),
        shortPath: n.short_path,
        lineCount: n.line_count,
        color: getExtColor(getExtFromPath(n.short_path)),
        isCycle: cycleSet.has(n.file_path),
        isRoot: inp === 0 && out > 0,
        isLeaf: out === 0 && inp > 0,
        outCount: out,
        inCount: inp,
        node: n,
      };
    });

    const links: GLink[] = result.edges.map((e) => ({
      source: e.from,
      target: e.to,
      symbols: e.symbols,
      isCycle: cycleSet.has(e.from) && cycleSet.has(e.to),
    }));

    return { nodes, links };
  }, [result.nodes, result.edges, cycleSet]);

  // Highlight connected nodes on select
  const highlightSet = useMemo(() => {
    if (!selectedNode) return null;
    const set = new Set<string>();
    set.add(selectedNode);
    links.forEach((l) => {
      const sid = typeof l.source === "object" ? (l.source as any).id : l.source;
      const tid = typeof l.target === "object" ? (l.target as any).id : l.target;
      if (sid === selectedNode) set.add(tid);
      if (tid === selectedNode) set.add(sid);
    });
    return set;
  }, [selectedNode, links]);

  // Search highlight
  const searchSet = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return new Set(nodes.filter((n) => n.shortPath.toLowerCase().includes(q) || n.label.toLowerCase().includes(q)).map((n) => n.id));
  }, [nodes, searchQuery]);

  // Custom node rendering
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const n = node as GNode;
    const w = Math.max(80, n.label.length * 7 + 24);
    const h = 32;
    const x = n.x! - w / 2;
    const y = n.y! - h / 2;

    const hovered = hoverNode;
    const isSelected = selectedNode === n.id;
    const isHovered = hovered?.id === n.id;
    const isConnectedToHover = hovered && links.some((l) => {
      const sid = typeof l.source === "object" ? (l.source as any).id : l.source;
      const tid = typeof l.target === "object" ? (l.target as any).id : l.target;
      return (sid === hovered.id && tid === n.id) || (tid === hovered.id && sid === n.id);
    });
    const isHL = highlightSet ? highlightSet.has(n.id) : searchSet ? searchSet.has(n.id) : true;
    const isHoverHL = !hovered || isHovered || isConnectedToHover;
    const opacity = ((highlightSet || searchSet) && !isHL) || (!isHoverHL && !highlightSet && !searchSet) ? 0.15 : 1;

    ctx.globalAlpha = opacity;

    // Shadow
    if (isSelected) {
      ctx.shadowColor = n.color + "66";
      ctx.shadowBlur = 12;
    }

    // Background
    ctx.fillStyle = isSelected ? n.color + "22" : "#1e293b";
    ctx.strokeStyle = isSelected ? n.color : n.isCycle ? "#ef4444" : "#334155";
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Left color bar
    ctx.fillStyle = n.color;
    ctx.beginPath();
    ctx.roundRect(x, y, 4, h, [6, 0, 0, 6]);
    ctx.fill();

    // Label
    ctx.fillStyle = isHL ? "#f1f5f9" : "#94a3b8";
    ctx.font = `11px monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const displayLabel = n.label.length > 22 ? n.label.slice(0, 20) + "…" : n.label;
    ctx.fillText(displayLabel, x + 10, y + h / 2 - 1);

    // Line count
    ctx.fillStyle = "#64748b";
    ctx.font = `${9}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`${n.lineCount}L`, x + w - 6, y + h / 2);

    // Status badge
    if (n.isCycle) {
      ctx.fillStyle = "#ef444433";
      ctx.beginPath();
      ctx.roundRect(x + w - 28, y + 3, 24, 12, 3);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.font = `${8}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("循环", x + w - 16, y + 10);
    } else if (n.isRoot) {
      ctx.fillStyle = "#6366f133";
      ctx.beginPath();
      ctx.roundRect(x + w - 28, y + 3, 24, 12, 3);
      ctx.fill();
      ctx.fillStyle = "#6366f1";
      ctx.font = `${8}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("根", x + w - 16, y + 10);
    }

    ctx.globalAlpha = 1;
  }, [selectedNode, highlightSet, searchSet, links, hoverNode]);

  // Custom pointer area (larger click target)
  const nodePointerAreaPaint = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const n = node as GNode;
    const w = Math.max(80, n.label.length * 7 + 24);
    const h = 32;
    ctx.fillStyle = color;
    ctx.fillRect(n.x! - w / 2, n.y! - h / 2, w, h);
  }, []);

  // Custom link rendering
  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const l = link as GLink & { source: any; target: any };
    const sid = typeof l.source === "object" ? l.source.id : l.source;
    const tid = typeof l.target === "object" ? l.target.id : l.target;

    const hovered = hoverNode;
    const isConnectedToHover = hovered && (sid === hovered.id || tid === hovered.id);

    const isHL = highlightSet
      ? (highlightSet.has(sid) && highlightSet.has(tid))
      : searchSet
        ? (searchSet.has(sid) && searchSet.has(tid))
        : true;
    const isHoverHL = !hovered || isConnectedToHover;
    const opacity = ((highlightSet || searchSet) && !isHL) || (!isHoverHL && !highlightSet && !searchSet) ? 0.05 : 0.7;

    ctx.globalAlpha = opacity;

    const sx = l.source.x;
    const sy = l.source.y;
    const tx = l.target.x;
    const ty = l.target.y;

    // Bezier curve
    const dx = tx - sx;
    const dy = ty - sy;
    const curvature = 0.15;
    const mx = (sx + tx) / 2 + dy * curvature;
    const my = (sy + ty) / 2 - dx * curvature;

    const isActive = (highlightSet?.has(sid) && highlightSet.has(tid)) || isConnectedToHover;
    ctx.strokeStyle = l.isCycle ? "#ef4444" : isActive ? "#818cf8" : "#475569";
    ctx.lineWidth = isActive ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, tx, ty);
    ctx.stroke();

    // Arrow
    const t = 0.85;
    const ax = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * tx;
    const ay = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ty;
    const atx = 2 * (1 - t) * (mx - sx) + 2 * t * (tx - mx);
    const aty = 2 * (1 - t) * (my - sy) + 2 * t * (ty - my);
    const angle = Math.atan2(aty, atx);
    const arrowLen = 6;

    ctx.fillStyle = l.isCycle ? "#ef4444" : highlightSet?.has(sid) && highlightSet.has(tid) ? "#6366f1" : "#64748b";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - arrowLen * Math.cos(angle - Math.PI / 6), ay - arrowLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(ax - arrowLen * Math.cos(angle + Math.PI / 6), ay - arrowLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
  }, [highlightSet, searchSet, hoverNode]);

  // Click handler
  const handleNodeClick = useCallback((node: any) => {
    const n = node as GNode;
    onSelectNode(selectedNode === n.id ? null : n.id);
  }, [selectedNode, onSelectNode]);

  const handleBgClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  // Debounced hover handler — update ref immediately for canvas, debounce state for tooltip
  const handleNodeHover = useCallback((node: any) => {
    const n = node as GNode | null;
    hoverNodeRef.current = n;
    // Debounce the React state update; the new callback identity for
    // nodeCanvasObject / linkCanvasObject will trigger a canvas redraw via
    // kapsule's notifyRedraw (onChange on those props).
    if (tooltipUpdateTimer.current) clearTimeout(tooltipUpdateTimer.current);
    tooltipUpdateTimer.current = window.setTimeout(() => {
      setHoverNode(n);
    }, 80);
  }, []);

  // Zoom controls
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

  return (
    <div ref={containerRef} className="relative">
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button onClick={handleZoomIn} className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--bg-subtle)] transition-colors"><ZoomIn size={14} /></button>
        <button onClick={handleZoomOut} className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--bg-subtle)] transition-colors"><ZoomOut size={14} /></button>
        <button onClick={handleFit} className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--bg-subtle)] transition-colors"><Maximize2 size={14} /></button>
      </div>

      {/* Hover tooltip */}
      {hoverNode && (
        <div className="absolute top-3 left-3 z-10 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-3 shadow-lg max-w-xs">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hoverNode.color }} />
            <span className="text-sm font-mono font-medium text-[var(--text-primary)]">{hoverNode.label}</span>
          </div>
          <p className="text-xs text-[var(--text-faint)] mb-1">{hoverNode.shortPath}</p>
          <div className="flex gap-3 text-xs text-[var(--text-muted)]">
            <span>{hoverNode.lineCount} 行</span>
            <span>→ {hoverNode.outCount} 依赖</span>
            <span>← {hoverNode.inCount} 被依赖</span>
          </div>
        </div>
      )}

      <div className="border border-[var(--border-default)] rounded-xl overflow-hidden bg-[#0f172a]" style={{ height: "55vh" }}>
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
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onBackgroundClick={handleBgClick}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.4}
          warmupTicks={50}
          cooldownTime={2000}
          d3Force={{
            charge: { strength: -800, distanceMax: 400 },
            link: { distance: 200, iterations: 3 },
            center: { strength: 0.05 },
          }}
          enableNodeDrag={true}
          enableZoomPanInteraction={true}
        />
      </div>
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────────

function DetailPanel({
  result,
  nodeId,
  onClose,
}: {
  result: ModuleAnalysisResult;
  nodeId: string;
  onClose: () => void;
}) {
  const node = result.nodes.find((n) => n.file_path === nodeId);
  if (!node) return null;

  const outEdges = result.edges.filter((e) => e.from === nodeId);
  const inEdges = result.edges.filter((e) => e.to === nodeId);
  const color = getExtColor(getExtFromPath(node.short_path));

  const pathToName = (p: string) => {
    const n = result.nodes.find((nd) => nd.file_path === p);
    return n ? shortenPath(n.short_path) : shortenPath(p);
  };

  return (
    <div className="mt-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-mono font-medium text-[var(--text-primary)]">{node.short_path}</span>
          <span className="text-xs text-[var(--text-faint)]">{node.line_count} 行</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-faint)]"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-6 p-4 text-xs">
        <div>
          <p className="text-[var(--text-faint)] font-medium mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            依赖的模块 ({outEdges.length})
          </p>
          {outEdges.length === 0 ? (
            <p className="text-[var(--text-muted)] pl-4">无</p>
          ) : (
            <ul className="space-y-1.5 pl-4">
              {outEdges.map((e, i) => (
                <li key={i}>
                  <span className="font-mono text-[var(--text-secondary)]">{pathToName(e.to)}</span>
                  <span className="text-[var(--text-faint)] ml-1">— {e.symbols.slice(0, 4).join(", ")}{e.symbols.length > 4 ? ` +${e.symbols.length - 4}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[var(--text-faint)] font-medium mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            被依赖 ({inEdges.length})
          </p>
          {inEdges.length === 0 ? (
            <p className="text-[var(--text-muted)] pl-4">无</p>
          ) : (
            <ul className="space-y-1.5 pl-4">
              {inEdges.map((e, i) => (
                <li key={i}>
                  <span className="font-mono text-[var(--text-secondary)]">{pathToName(e.from)}</span>
                  <span className="text-[var(--text-faint)] ml-1">— {e.symbols.slice(0, 4).join(", ")}{e.symbols.length > 4 ? ` +${e.symbols.length - 4}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function ModuleAnalysis() {
  const {
    projectPath,
    availableLanguages,
    selectedLanguages,
    moduleResults,
    setModuleResult,
  } = useProject();

  const [activeTab, setActiveTab] = useState<string>(() => selectedLanguages[0] || "");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const langTabs = useMemo(() => {
    return selectedLanguages.map((id) => {
      const lang = availableLanguages.find((l) => l.id === id);
      const result = moduleResults[id];
      return {
        id,
        label: lang?.language || id,
        loaded: !!result,
        nodeCount: result?.nodes.length ?? 0,
        edgeCount: result?.edges.length ?? 0,
      };
    });
  }, [selectedLanguages, availableLanguages, moduleResults]);

  const currentResult = moduleResults[activeTab];

  const handleAnalyze = useCallback(async () => {
    if (!projectPath) return;
    const lang = availableLanguages.find((l) => l.id === activeTab);
    if (!lang || !lang.available) return;

    setAnalyzing(true);
    setError(null);
    setProgress(null);
    setSelectedNode(null);
    setSearchQuery("");

    const unlisten = await listen<{ stage: string; message: string }>("module-progress", (event) => {
      setProgress(event.payload.message);
    });

    try {
      const result = await invoke<ModuleAnalysisResult>("analyze_modules", {
        projectPath,
        language: lang.language,
        command: lang.path || lang.command,
        args: lang.args,
        extensions: lang.extensions,
        ignoreRules: null,
      });
      setModuleResult(activeTab, result);
    } catch (err) {
      setError(`模块分析失败: ${err}`);
    } finally {
      unlisten();
      setAnalyzing(false);
      setProgress(null);
    }
  }, [projectPath, activeTab, availableLanguages, setModuleResult]);

  // Cycle count
  const cycleCount = useMemo(() => {
    if (!currentResult) return 0;
    const set = new Set<string>();
    for (let i = 0; i < currentResult.edges.length; i++) {
      for (let j = i + 1; j < currentResult.edges.length; j++) {
        if (currentResult.edges[i].from === currentResult.edges[j].to && currentResult.edges[i].to === currentResult.edges[j].from) {
          set.add(currentResult.edges[i].from);
        }
      }
    }
    return set.size;
  }, [currentResult]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">模块分析</h2>
        <p className="text-[var(--text-muted)]">分析项目内部模块间的引用依赖关系</p>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl overflow-hidden">
        {/* Tabs + Search + Analyze */}
        <div className="flex items-center border-b border-[var(--border-default)] px-2 overflow-x-auto">
          {langTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSelectedNode(null); setSearchQuery(""); }}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
              >
                <FileCode size={16} />
                {tab.label}
                {tab.loaded && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-faint)]">
                    {tab.nodeCount}模块
                  </span>
                )}
                {isActive && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-600 rounded-t" />}
              </button>
            );
          })}
          <div className="flex-1" />
          {/* Search */}
          {currentResult && currentResult.nodes.length > 0 && (
            <div className="relative mr-2 mb-1.5">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                type="text"
                placeholder="搜索模块..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-indigo-500 w-40"
              />
            </div>
          )}
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !availableLanguages.find((l) => l.id === activeTab)?.available}
            className="flex items-center gap-2 px-4 py-2 mr-2 mb-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {analyzing ? "分析中..." : "开始分析"}
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-300">{error}</div>
          )}

          {!currentResult && !analyzing && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Network size={48} className="text-[var(--text-faint)]" />
              <p className="text-[var(--text-muted)]">暂无模块分析数据</p>
              <p className="text-sm text-[var(--text-faint)]">选择语言后点击"开始分析"</p>
            </div>
          )}

          {analyzing && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={32} className="text-indigo-500 animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">{progress || "正在分析模块依赖关系..."}</p>
            </div>
          )}

          {currentResult && !analyzing && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-4 gap-3 mb-5">
                <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1"><FileCode size={16} className="text-indigo-500" /><span className="text-xs text-[var(--text-faint)]">扫描文件</span></div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{currentResult.files_scanned}</p>
                </div>
                <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1"><Layers size={16} className="text-emerald-500" /><span className="text-xs text-[var(--text-faint)]">模块节点</span></div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{currentResult.nodes.length}</p>
                </div>
                <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1"><GitBranch size={16} className="text-amber-500" /><span className="text-xs text-[var(--text-faint)]">依赖边</span></div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{currentResult.edges.length}</p>
                </div>
                <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1"><AlertTriangle size={16} className={cycleCount > 0 ? "text-red-500" : "text-[var(--text-faint)]"} /><span className="text-xs text-[var(--text-faint)]">循环依赖</span></div>
                  <p className={`text-2xl font-bold ${cycleCount > 0 ? "text-red-500" : "text-[var(--text-primary)]"}`}>{cycleCount}</p>
                </div>
              </div>

              {currentResult.nodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                  <Network size={32} className="mb-3 text-[var(--text-faint)]" />
                  <p>未发现模块间的依赖关系</p>
                </div>
              ) : (
                <>
                  {/* Knowledge Graph */}
                  <KnowledgeGraph
                    result={currentResult}
                    selectedNode={selectedNode}
                    onSelectNode={setSelectedNode}
                    searchQuery={searchQuery}
                  />

                  {/* Detail Panel */}
                  {selectedNode && (
                    <DetailPanel
                      result={currentResult}
                      nodeId={selectedNode}
                      onClose={() => setSelectedNode(null)}
                    />
                  )}

                  {/* Legend */}
                  <div className="mt-4 flex items-center gap-6 text-xs text-[var(--text-faint)]">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-500 rounded" /> 点击节点查看详情</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-500 rounded" /> 循环依赖</span>
                    <span className="flex items-center gap-1.5"><Info size={12} /> 拖拽节点 / 滚轮缩放 / 拖拽画布平移</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
