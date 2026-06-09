import {
  FolderOpen,
  BarChart3,
  Brain,
  ChevronRight,
} from "lucide-react";
import type { Page } from "../types";
import { useProject } from "../context/ProjectContext";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
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
    id: "architecture" as Page,
    label: "架构分析",
    icon: Brain,
    requireProject: true,
    badge: "即将推出",
  },
];

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { projectName, projectPath } = useProject();

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 flex flex-col bg-white border-r border-slate-200"
      style={{ width: "var(--sidebar-width)" }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">
              StatCode
            </h1>
            <p className="text-[10px] text-slate-400 leading-tight">
              代码分析工具
            </p>
          </div>
        </div>
      </div>

      {/* Project Info */}
      {projectPath && (
        <div className="mx-3 mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
          <p className="text-[11px] text-slate-400 mb-1">当前项目</p>
          <p className="text-sm font-medium text-slate-700 truncate">
            {projectName}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 mt-6 px-3">
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider px-2 mb-2">
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
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : disabled
                      ? "text-slate-300 cursor-not-allowed"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                  }
                `}
              >
                <Icon
                  size={18}
                  className={
                    isActive
                      ? "text-indigo-600"
                      : disabled
                        ? "text-slate-300"
                        : "text-slate-400 group-hover:text-slate-600"
                  }
                />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">
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
      <div className="p-4 border-t border-slate-100">
        <p className="text-[11px] text-slate-400 text-center">v0.1.0</p>
      </div>
    </aside>
  );
}
