import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Server,
  ListX,
  Type,
  Sun,
  Moon,
  Monitor,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Circle,
  Power,
  RefreshCw,
  Copy,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "../context/SettingsContext";
import type { FontInfo, LspServerInfo, LspServer, LspStatus, Theme } from "../types";

type TabId = "general" | "lsp" | "ignore";

const TABS: { id: TabId; label: string; icon: typeof SettingsIcon }[] = [
  { id: "general", label: "常规", icon: SettingsIcon },
  { id: "lsp", label: "LSP Server", icon: Server },
  { id: "ignore", label: "忽略规则", icon: ListX },
];

const LSP_SERVER_DEFS: Omit<LspServer, "status" | "version" | "detectedPath" | "detectionError">[] = [
  {
    id: "rust-analyzer",
    language: "Rust",
    name: "rust-analyzer",
    command: "rust-analyzer",
    args: [],
    extensions: [".rs"],
    description: "Rust 语言的 LSP 实现,提供代码补全、跳转、诊断等功能。",
    install: [
      { manager: "cargo", command: "rustup component add rust-analyzer" },
      { manager: "brew", command: "brew install rust-analyzer" },
      { manager: "scoop", command: "scoop install rust-analyzer" },
    ],
  },
  {
    id: "typescript-language-server",
    language: "TypeScript / JavaScript",
    name: "typescript-language-server",
    command: "typescript-language-server",
    args: ["--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    description: "微软官方 TypeScript / JavaScript 语言服务器。",
    install: [
      { manager: "npm", command: "npm install -g typescript typescript-language-server" },
      { manager: "pnpm", command: "pnpm add -g typescript typescript-language-server" },
      { manager: "yarn", command: "yarn global add typescript typescript-language-server" },
    ],
  },
  {
    id: "pyright",
    language: "Python",
    name: "pyright",
    command: "pyright-langserver",
    args: ["--stdio"],
    extensions: [".py"],
    description: "微软推出的 Python 静态类型检查与语言服务器。",
    install: [
      { manager: "npm", command: "npm install -g pyright" },
      { manager: "pnpm", command: "pnpm add -g pyright" },
      { manager: "brew", command: "brew install pyright" },
      { manager: "pip", command: "pip install pyright" },
    ],
  },
  {
    id: "gopls",
    language: "Go",
    name: "gopls",
    command: "gopls",
    args: [],
    extensions: [".go"],
    description: "Go 语言的官方 LSP 服务器。",
    install: [
      { manager: "go", command: "go install golang.org/x/tools/gopls@latest" },
      { manager: "brew", command: "brew install gopls" },
    ],
  },
  {
    id: "clangd",
    language: "C / C++",
    name: "clangd",
    command: "clangd",
    args: [],
    extensions: [".c", ".cc", ".cpp", ".cxx", ".h", ".hpp"],
    description: "基于 Clang 的 C/C++/Objective-C 语言服务器。",
    install: [
      { manager: "brew", command: "brew install clangd" },
      { manager: "apt", command: "sudo apt install clangd" },
      { manager: "scoop", command: "scoop install clangd" },
      { manager: "winget", command: "winget install LLVM.clangd" },
    ],
  },
  {
    id: "jdtls",
    language: "Java",
    name: "Eclipse JDT Language Server",
    command: "jdtls",
    args: [],
    extensions: [".java"],
    description: "Eclipse JDT 的语言服务器实现,支持 Java 项目的完整分析。",
    install: [
      { manager: "brew", command: "brew install jdtls" },
      { manager: "scoop", command: "scoop install jdtls" },
      { manager: "manual", command: "从 https://download.eclipse.org/jdtls/snapshots 下载最新版" },
    ],
  },
  {
    id: "csharp-ls",
    language: "C#",
    name: "csharp-language-server",
    command: "csharp-language-server",
    args: ["--stdio"],
    extensions: [".cs"],
    description: "C# 语言的 LSP 服务器,需要 .NET SDK 支持。",
    install: [
      { manager: "dotnet", command: "dotnet tool install --global csharp-ls" },
      { manager: "brew", command: "brew install csharp-language-server" },
    ],
  },
  {
    id: "lua-ls",
    language: "Lua",
    name: "lua-language-server",
    command: "lua-language-server",
    args: [],
    extensions: [".lua"],
    description: "功能完备的 Lua 语言服务器。",
    install: [
      { manager: "brew", command: "brew install lua-language-server" },
      { manager: "scoop", command: "scoop install lua-language-server" },
      { manager: "npm", command: "npm install -g lua-language-server" },
    ],
  },
];

interface StatusBadgeProps {
  status: LspStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<LspStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
    running: {
      label: "运行中",
      className: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
      Icon: CheckCircle2,
    },
    stopped: {
      label: "已停止",
      className: "bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border-default)]",
      Icon: Circle,
    },
    error: {
      label: "错误",
      className: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30",
      Icon: XCircle,
    },
    "not-installed": {
      label: "未安装",
      className: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
      Icon: AlertCircle,
    },
  };
  const { label, className, Icon } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${className}`}
    >
      <Icon size={12} />
      {label}
    </span>
  );
}

interface ThemeOptionProps {
  value: Theme;
  label: string;
  description: string;
  Icon: typeof Sun;
  selected: boolean;
  onSelect: () => void;
}

function ThemeOption({
  label,
  description,
  Icon,
  selected,
  onSelect,
}: ThemeOptionProps) {
  return (
    <button
      onClick={onSelect}
      className={`
        flex flex-col items-start gap-2 p-4 rounded-xl border text-left
        transition-all duration-200
        ${selected
          ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/15 ring-1 ring-indigo-500 dark:ring-indigo-400"
          : "border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
        }
      `}
    >
      <div className="flex items-center gap-2 w-full">
        <Icon
          size={18}
          className={selected ? "text-indigo-600 dark:text-indigo-300" : "text-[var(--text-faint)]"}
        />
        <span
          className={`text-sm font-medium ${selected ? "text-indigo-700 dark:text-indigo-300" : "text-[var(--text-secondary)]"}`}
        >
          {label}
        </span>
        {selected && (
          <CheckCircle2
            size={16}
            className="text-indigo-600 dark:text-indigo-300 ml-auto"
          />
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">{description}</p>
    </button>
  );
}

function GeneralTab() {
  const { theme, setTheme, fontFamily, setFontFamily, fontSize, setFontSize, lineHeight, setLineHeight } = useSettings();
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const [fontsLoading, setFontsLoading] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [fontSearch, setFontSearch] = useState("");

  const loadFonts = async () => {
    setFontsLoading(true);
    try {
      const result = await invoke<FontInfo[]>("scan_system_fonts");
      setFonts(result);
      setFontsLoaded(true);
    } catch {
      // Fallback: provide basic generic fonts
      setFonts([
        { name: "system-ui", type: "Generic" },
        { name: "Arial", type: "System" },
        { name: "Courier New", type: "System" },
        { name: "Georgia", type: "System" },
        { name: "Times New Roman", type: "System" },
        { name: "Verdana", type: "System" },
        { name: "Consolas", type: "System" },
        { name: "monospace", type: "Generic" },
        { name: "sans-serif", type: "Generic" },
        { name: "serif", type: "Generic" },
      ]);
      setFontsLoaded(true);
    } finally {
      setFontsLoading(false);
    }
  };

  useEffect(() => {
    loadFonts();
  }, []);

  const filteredFonts = fontSearch.trim()
    ? fonts.filter((f) => f.name.toLowerCase().includes(fontSearch.toLowerCase()))
    : fonts;

  const currentFontLabel = fontFamily === "system-ui" ? "系统默认" : fontFamily;

  return (
    <div className="space-y-8">
      {/* Theme Section */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-1">外观</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          选择应用的主题外观，设置会立即生效。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ThemeOption
            value="light"
            label="浅色"
            description="明亮的配色，适合日间使用。"
            Icon={Sun}
            selected={theme === "light"}
            onSelect={() => setTheme("light")}
          />
          <ThemeOption
            value="dark"
            label="深色"
            description="深色背景，减轻视觉疲劳。"
            Icon={Moon}
            selected={theme === "dark"}
            onSelect={() => setTheme("dark")}
          />
          <ThemeOption
            value="system"
            label="跟随系统"
            description="跟随操作系统的外观设置自动切换。"
            Icon={Monitor}
            selected={theme === "system"}
            onSelect={() => setTheme("system")}
          />
        </div>
      </section>

      {/* Font Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Type size={16} className="text-[var(--text-secondary)]" />
          <h2 className="text-sm font-semibold text-[var(--text-secondary)]">字体</h2>
        </div>

        <div className="grid grid-cols-[1fr_280px] gap-6">
          {/* Font Family — left column */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
              字体系列
            </label>
            <div className="relative">
              <input
                type="text"
                value={fontSearch}
                onChange={(e) => setFontSearch(e.target.value)}
                placeholder="搜索字体..."
                className="w-full px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)]
                  rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)]
                  focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
                  transition-colors mb-2"
              />
              <div className="max-h-48 overflow-y-auto border border-[var(--border-default)] rounded-lg divide-y divide-[var(--border-subtle)]">
                {/* System default option */}
                <button
                  onClick={() => { setFontFamily("system-ui"); setFontSearch(""); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors
                    ${fontFamily === "system-ui"
                      ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                    }`}
                >
                  <span style={{ fontFamily: "system-ui" }}>系统默认</span>
                  {fontFamily === "system-ui" && <CheckCircle2 size={14} className="text-indigo-500" />}
                </button>

                {fontsLoading && (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-[var(--text-muted)]">
                    <Loader2 size={14} className="animate-spin" />
                    正在扫描系统字体...
                  </div>
                )}

                {filteredFonts.map((font) => (
                  <button
                    key={font.name}
                    onClick={() => { setFontFamily(font.name); setFontSearch(""); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors
                      ${fontFamily === font.name
                        ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                      }`}
                  >
                    <span style={{ fontFamily: font.name }}>{font.name}</span>
                    <span className="text-[10px] text-[var(--text-faint)] ml-2 flex-shrink-0">{font.type}</span>
                  </button>
                ))}

                {!fontsLoading && filteredFonts.length === 0 && fontsLoaded && (
                  <div className="px-3 py-3 text-xs text-[var(--text-muted)] text-center">
                    没有匹配的字体
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">
                当前: <span style={{ fontFamily }} className="font-medium">{currentFontLabel}</span>
                {!fontsLoaded && (
                  <button
                    onClick={loadFonts}
                    className="ml-2 text-indigo-500 hover:text-indigo-600 transition-colors"
                  >
                    扫描系统字体
                  </button>
                )}
              </p>
            </div>
          </div>

          {/* Right column: description + font size + line height */}
          <div className="flex flex-col gap-4">
            <p className="text-xs text-[var(--text-muted)]">
              自定义应用的字体、大小和行高。设置会立即生效。
            </p>

            {/* Font Size */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  字体大小
                </label>
                <span className="text-xs text-[var(--text-faint)] font-mono">{fontSize}px</span>
              </div>
              <input
                type="range"
                min={10}
                max={24}
                step={1}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full h-1.5 bg-[var(--bg-muted)] rounded-full appearance-none cursor-pointer
                  accent-indigo-600"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-[var(--text-faint)]">10px</span>
                <span className="text-[10px] text-[var(--text-faint)]">24px</span>
              </div>
            </div>

            {/* Line Height */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  行高
                </label>
                <span className="text-xs text-[var(--text-faint)] font-mono">{lineHeight.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={2.5}
                step={0.1}
                value={lineHeight}
                onChange={(e) => setLineHeight(Number(e.target.value))}
                className="w-full h-1.5 bg-[var(--bg-muted)] rounded-full appearance-none cursor-pointer
                  accent-indigo-600"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-[var(--text-faint)]">1.0</span>
                <span className="text-[10px] text-[var(--text-faint)]">2.5</span>
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-5">
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
            预览
          </label>
          <div
            className="p-5 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-xl"
            style={{ fontFamily, fontSize: `${fontSize}px`, lineHeight }}
          >
            <p className="text-[var(--text-primary)] font-semibold mb-2" style={{ fontSize: `${fontSize + 4}px` }}>
              StatCode 代码分析工具
            </p>
            <p className="text-[var(--text-secondary)] mb-3">
              快速扫描项目目录，统计文件类型、代码行数和字节大小，帮助你了解代码库的结构和规模。
            </p>
            <div className="bg-[var(--bg-surface)] rounded-lg p-3 border border-[var(--border-subtle)]">
              <p className="text-[var(--text-muted)]" style={{ fontFamily: "monospace, " + fontFamily, fontSize: `${fontSize - 1}px` }}>
                {`function analyze(path: string): Result {`}
                <br />
                {`  const files = walkDirectory(path);`}
                <br />
                {`  return files.reduce(summarize, {});`}
                <br />
                {`}`}
              </p>
            </div>
          </div>
        </div>

        {/* Reset */}
        <div className="flex justify-end mt-4">
          <button
            onClick={() => {
              setFontFamily("system-ui");
              setFontSize(14);
              setLineHeight(1.6);
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
              text-[var(--text-muted)] hover:text-[var(--text-secondary)]
              hover:bg-[var(--bg-muted)] transition-colors"
          >
            <RotateCcw size={12} />
            恢复默认字体
          </button>
        </div>
      </section>
    </div>
  );
}

interface LspCardProps {
  server: LspServer;
  onToggle: (id: string) => void;
}

function LspCard({ server, onToggle }: LspCardProps) {
  const canStop = server.status === "running";
  const disabled = server.status === "not-installed";
  const [activeManager, setActiveManager] = useState<string>(
    server.install[0]?.manager ?? "manual",
  );
  const [copied, setCopied] = useState(false);

  const activeInstall =
    server.install.find((c) => c.manager === activeManager) ?? server.install[0];

  const handleCopy = async () => {
    if (!activeInstall) return;
    try {
      await navigator.clipboard.writeText(activeInstall.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-5 transition-all hover:border-[var(--border-strong)]">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {server.name}
            </h3>
            <StatusBadge status={server.status} />
          </div>
          <p className="text-xs text-[var(--text-muted)]">{server.language}</p>
        </div>
        <button
          onClick={() => onToggle(server.id)}
          disabled={disabled}
          className={`
            flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
            transition-colors font-medium
            ${disabled
              ? "bg-[var(--bg-muted)] text-[var(--text-disabled)] cursor-not-allowed"
              : canStop
                ? "bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--border-strong)]"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }
          `}
        >
          <Power size={12} />
          {canStop ? "停止" : "启动"}
        </button>
      </div>

      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
        {server.description}
      </p>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-[var(--bg-subtle)] rounded-lg px-3 py-2">
          <p className="text-[var(--text-faint)] mb-0.5">命令</p>
          <p className="font-mono text-[var(--text-secondary)] truncate">{server.command}</p>
        </div>
        <div className="bg-[var(--bg-subtle)] rounded-lg px-3 py-2">
          <p className="text-[var(--text-faint)] mb-0.5">文件类型</p>
          <p className="font-mono text-[var(--text-secondary)] truncate">
            {server.extensions.join(" ")}
          </p>
        </div>
      </div>

      {(server.version || server.detectionError) && (
        <div className="mt-3 px-3 py-2 bg-[var(--bg-subtle)] rounded-lg text-xs space-y-1">
          {server.version && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-faint)]">版本</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 truncate">
                {server.version}
              </span>
            </div>
          )}
          {server.detectionError && (
            <div className="flex items-start gap-2">
              <span className="text-[var(--text-faint)] flex-shrink-0">错误</span>
              <span className="font-mono text-rose-600 dark:text-rose-400 break-all">
                {server.detectionError}
              </span>
            </div>
          )}
        </div>
      )}

      {activeInstall && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] text-[var(--text-faint)]">安装命令</span>
            {server.install.length > 1 && (
              <select
                value={activeManager}
                onChange={(e) => {
                  setActiveManager(e.target.value);
                  setCopied(false);
                }}
                className="text-[11px] px-2 py-0.5 rounded-md border border-[var(--border-default)]
                  bg-[var(--bg-subtle)] text-[var(--text-secondary)]
                  focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {server.install.map((c) => (
                  <option key={c.manager} value={c.manager}>
                    {c.manager}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="group relative flex items-center bg-slate-900 dark:bg-black rounded-lg px-3 py-2 font-mono text-xs text-slate-100">
            <span className="flex-1 overflow-x-auto whitespace-nowrap scrollbar-hidden">
              {activeInstall.command}
            </span>
            <button
              onClick={handleCopy}
              aria-label="复制安装命令"
              className="ml-2 flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded
                bg-white/10 hover:bg-white/20 text-slate-100 transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  <span>已复制</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <span>复制</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function buildServer(def: typeof LSP_SERVER_DEFS[number], status: LspStatus, det?: LspServerInfo): LspServer {
  return {
    ...def,
    status,
    version: det?.version ?? null,
    detectedPath: det?.path ?? null,
    detectionError: det?.error ?? null,
  };
}

function LspTab() {
  const [servers, setServers] = useState<LspServer[]>(
    LSP_SERVER_DEFS.map((d) => buildServer(d, "stopped")),
  );
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  const runDetection = async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const results = await invoke<LspServerInfo[]>("detect_lsp_servers");
      const byId = new Map(results.map((r) => [r.id, r]));
      setServers((prev) =>
        prev.map((s) => {
          const r = byId.get(s.id) || byId.get(s.command);
          if (!r) return s;
          if (!r.available) {
            return { ...s, status: "not-installed", version: null, detectedPath: null, detectionError: r.error };
          }
          return { ...s, status: "stopped", version: r.version, detectedPath: r.path, detectionError: null };
        }),
      );
    } catch (err) {
      setDetectError(String(err));
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    runDetection();
  }, []);

  const handleToggle = (id: string) => {
    setServers((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (s.status === "not-installed") return s;
        if (s.status === "running") return { ...s, status: "stopped" };
        return { ...s, status: "running" };
      }),
    );
  };

  const summary = {
    total: servers.length,
    running: servers.filter((s) => s.status === "running").length,
    available: servers.filter((s) => s.status !== "not-installed").length,
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">已配置</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{summary.total}</p>
        </div>
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">运行中</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.running}
          </p>
        </div>
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">可用</p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {summary.available}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-1">
              语言服务器列表
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              管理为不同语言提供智能补全、跳转与诊断的 LSP Server。已对 rust-analyzer 与 typescript-language-server 进行环境检测。
            </p>
          </div>
          <button
            onClick={runDetection}
            disabled={detecting}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
              bg-[var(--bg-muted)] text-[var(--text-secondary)]
              hover:bg-[var(--border-strong)] transition-colors font-medium
              disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={detecting ? "animate-spin" : ""} />
            {detecting ? "检测中..." : "重新检测"}
          </button>
        </div>
        {detectError && (
          <div className="mb-3 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg text-xs text-rose-600 dark:text-rose-300">
            检测失败: {detectError}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {servers.map((server) => (
            <LspCard
              key={server.id}
              server={server}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function IgnoreRulesTab() {
  const { ignoreRules, setIgnoreRules } = useSettings();
  const [localRules, setLocalRules] = useState(ignoreRules);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setIgnoreRules(localRules);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    // Clear stored value to fall back to defaults
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("statcode.ignoreRules");
    }
    // Reload to pick up the default from SettingsContext
    window.location.reload();
  };

  const lineCount = localRules.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-1">共享忽略规则</h2>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          每行一条规则，语法与 <code className="px-1 py-0.5 bg-[var(--bg-muted)] rounded text-[11px]">.gitignore</code> 相同。
          当项目目录中存在 <code className="px-1 py-0.5 bg-[var(--bg-muted)] rounded text-[11px]">.stcignore</code> 文件时，以该项目级文件为准；否则使用此处配置的共享规则。
        </p>
      </div>

      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[var(--text-faint)]">
            {lineCount} 条有效规则
          </span>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg
              text-[var(--text-muted)] hover:text-[var(--text-secondary)]
              hover:bg-[var(--bg-muted)] transition-colors"
          >
            <RotateCcw size={12} />
            恢复默认
          </button>
        </div>
        <textarea
          value={localRules}
          onChange={(e) => setLocalRules(e.target.value)}
          spellCheck={false}
          rows={20}
          className="w-full bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-xl
            px-4 py-3 font-mono text-xs leading-relaxed text-[var(--text-primary)]
            placeholder:text-[var(--text-faint)]
            focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
            transition-colors resize-y"
          placeholder="# 每行一条忽略规则&#10;node_modules/&#10;dist/&#10;*.log"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-faint)]">
          修改后需点击保存生效，规则将在下次分析时应用。
        </p>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={14} />
              已保存
            </span>
          )}
          <button
            onClick={handleSave}
            className="py-2 px-5 bg-indigo-600 text-white text-sm rounded-lg font-medium
              hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">设置</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          管理应用的外观与语言服务器配置。
        </p>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl overflow-hidden">
        <div className="flex border-b border-[var(--border-default)] px-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  relative flex items-center gap-2 px-4 py-3 text-sm font-medium
                  transition-colors
                  ${isActive
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }
                `}
              >
                <Icon size={16} />
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-600 rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "lsp" && <LspTab />}
          {activeTab === "ignore" && <IgnoreRulesTab />}
        </div>
      </div>
    </div>
  );
}
