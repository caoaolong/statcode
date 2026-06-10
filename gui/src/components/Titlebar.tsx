import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X, BarChart3 } from "lucide-react";

export default function Titlebar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  const checkMaximized = useCallback(async () => {
    try {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    } catch {
      // ignore
    }
  }, [appWindow]);

  useEffect(() => {
    checkMaximized();
    const unlisten = appWindow.onResized(() => {
      checkMaximized();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appWindow, checkMaximized]);

  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch {
      // ignore
    }
  };

  const handleToggleMaximize = async () => {
    try {
      await appWindow.toggleMaximize();
    } catch {
      // ignore
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch {
      // ignore
    }
  };

  const handleDoubleClick = async (e: React.MouseEvent) => {
    // Only trigger on the drag region, not on buttons
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    await handleToggleMaximize();
  };

  return (
    <div
      className="titlebar select-none"
      onDoubleClick={handleDoubleClick}
    >
      {/* Drag region — left side: app info */}
      <div className="titlebar-drag-region flex items-center gap-2.5 pl-3 flex-1 min-w-0" data-tauri-drag-region>
        <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <BarChart3 size={12} className="text-white" />
        </div>
        <span className="text-xs font-medium text-[var(--text-secondary)] truncate">
          StatCode — 代码分析工具
        </span>
      </div>

      {/* Window controls — right side */}
      <div className="flex items-center h-full" data-no-drag>
        <button
          onClick={handleMinimize}
          className="titlebar-btn"
          aria-label="最小化"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="titlebar-btn"
          aria-label={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          onClick={handleClose}
          className="titlebar-btn titlebar-btn-close"
          aria-label="关闭"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
