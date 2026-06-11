import { useState, useEffect } from "react";
import { BarChart3, CheckCircle2, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { LspServerInfo } from "../types";

interface WelcomeProps {
  onReady: (servers: LspServerInfo[]) => void;
}

export default function Welcome({ onReady }: WelcomeProps) {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [detectedCount, setDetectedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const servers = await invoke<LspServerInfo[]>("detect_lsp_servers");
        if (cancelled) return;
        const count = servers.filter((s) => s.available).length;
        setDetectedCount(count);
        setStatus("ready");
        // Brief pause to show success state, then transition
        setTimeout(() => {
          if (!cancelled) onReady(servers);
        }, 800);
      } catch {
        if (!cancelled) {
          setStatus("ready");
          setTimeout(() => {
            if (!cancelled) onReady([]);
          }, 800);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [onReady]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg-app)] z-50">
      <div className="flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
            <BarChart3 size={40} className="text-white" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-1">StatCode</h1>
          <p className="text-sm text-[var(--text-muted)]">代码分析工具</p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3 mt-4">
          {status === "loading" ? (
            <>
              <Loader2 size={18} className="text-indigo-500 animate-spin" />
              <span className="text-sm text-[var(--text-muted)]">正在检测语言服务器...</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={18} className="text-emerald-500" />
              <span className="text-sm text-[var(--text-muted)]">
                已检测到 {detectedCount} 个语言服务器
              </span>
            </>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5 mt-2">
          <div className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
