import { useCallback, useRef } from "react";
import {
  FolderOpen,
  BarChart3,
  Brain,
  Scan,
  ChevronRight,
  Settings as SettingsIcon,
} from "lucide-react";
import type { Page } from "../types";
import { useProject } from "../context/ProjectContext";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  width: number;
  onResize: (width: number) => void;
}

const NAV_ITEMS = [
  {
    id: "project" as Page,
    label: "项目选择",
    icon: FolderOpen,
    requireProject: false,
  },
  {
    id: "analysis" as Page,
    label: "代码分析",
    icon: BarChart3,
    requireProject: true,
  },
  {
    id: "symbols" as Page,
    label: "符号分析",
    icon: Scan,
    requireProject: true,
  },
  {
    id: "architecture" as Page,
    label: "架构分析",
    icon: Brain,
    requireProject: true,
    badge: "即将推出",
  },
];

export default function Sidebar({ currentPage, onNavigate, width, onResize }: SidebarProps) {
  const { projectName, projectPath } = useProject();
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: width };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        onResize(dragRef.current.startW + delta);
      };

      const onMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, onResize],
  );

  return (
    <aside
      className="fixed left-0 bottom-0 flex flex-col bg-[var(--bg-surface)] border-r border-[var(--border-default)]"
      style={{ width, top: "var(--titlebar-height)" }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[var(--text-primary)] leading-tight">
              StatCode
            </h1>
            <p className="text-[10px] text-[var(--text-faint)] leading-tight">
              代码分析工具
            </p>
          </div>
        </div>
      </div>

      {/* Project Info */}
      {projectPath && (
        <div className="mx-3 mt-4 p-3 bg-[var(--bg-subtle)] rounded-lg border border-[var(--border-subtle)]">
          <p className="text-[11px] text-[var(--text-faint)] mb-1">当前项目</p>
          <p className="text-sm font-medium text-[var(--text-secondary)] truncate">
            {projectName}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 mt-6 px-3">
        <p className="text-[11px] font-medium text-[var(--text-faint)] uppercase tracking-wider px-2 mb-2">
          导航
        </p>
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPage === item.id;
            const disabled = item.requireProject && !projectPath;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => !disabled && onNavigate(item.id)}
                disabled={disabled}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                  transition-all duration-200 group
                  ${isActive
                    ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-medium"
                    : disabled
                      ? "text-[var(--text-disabled)] cursor-not-allowed"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                  }
                `}
              >
                <Icon
                  size={18}
                  className={
                    isActive
                      ? "text-indigo-600 dark:text-indigo-400"
                      : disabled
                        ? "text-[var(--text-disabled)]"
                        : "text-[var(--text-faint)] group-hover:text-[var(--text-secondary)]"
                  }
                />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 font-medium">
                    {item.badge}
                  </span>
                )}
                {isActive && (
                  <ChevronRight size={14} className="text-indigo-400" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border-subtle)] space-y-2">
        <button
          onClick={() => onNavigate("settings")}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
            transition-all duration-200 group
            ${currentPage === "settings"
              ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-medium"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            }
          `}
        >
          <SettingsIcon
            size={18}
            className={
              currentPage === "settings"
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-[var(--text-faint)] group-hover:text-[var(--text-secondary)]"
            }
          />
          <span className="flex-1 text-left">设置</span>
          {currentPage === "settings" && (
            <ChevronRight size={14} className="text-indigo-400" />
          )}
        </button>
        <p className="text-[11px] text-[var(--text-faint)] text-center pt-1">v0.1.0</p>
      </div>

      {/* Drag resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize
          hover:bg-indigo-400/30 active:bg-indigo-400/50 transition-colors"
        style={{ zIndex: 50 }}
      />
    </aside>
  );
}
