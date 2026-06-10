import { useState, useCallback } from "react";
import { ProjectProvider } from "./context/ProjectContext";
import { SettingsProvider } from "./context/SettingsContext";
import Titlebar from "./components/Titlebar";
import Sidebar from "./components/Sidebar";
import ProjectSelector from "./components/ProjectSelector";
import CodeAnalysis from "./components/CodeAnalysis";
import SymbolAnalysis from "./components/SymbolAnalysis";
import ArchitectureAnalysis from "./components/ArchitectureAnalysis";
import Settings from "./components/Settings";
import type { Page } from "./types";

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 400;

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("project");
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("statcode.sidebarWidth");
    return saved ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Number(saved))) : DEFAULT_SIDEBAR_WIDTH;
  });

  const handleSidebarResize = useCallback((w: number) => {
    const clamped = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, w));
    setSidebarWidth(clamped);
    localStorage.setItem("statcode.sidebarWidth", String(clamped));
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case "project":
        return <ProjectSelector onNavigate={setCurrentPage} />;
      case "analysis":
        return <CodeAnalysis />;
      case "symbols":
        return <SymbolAnalysis />;
      case "architecture":
        return <ArchitectureAnalysis />;
      case "settings":
        return <Settings />;
      default:
        return <ProjectSelector onNavigate={setCurrentPage} />;
    }
  };

  return (
    <SettingsProvider>
      <ProjectProvider>
        <div className="flex flex-col h-screen overflow-hidden">
          <Titlebar />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar
              currentPage={currentPage}
              onNavigate={setCurrentPage}
              width={sidebarWidth}
              onResize={handleSidebarResize}
            />
            <main
              className="flex-1 overflow-y-auto bg-[var(--bg-app)]"
              style={{ marginLeft: sidebarWidth }}
            >
              <div className="p-8">{renderPage()}</div>
            </main>
          </div>
        </div>
      </ProjectProvider>
    </SettingsProvider>
  );
}
