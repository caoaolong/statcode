import { useState, useCallback } from "react";
import { ProjectProvider } from "./context/ProjectContext";
import { SettingsProvider } from "./context/SettingsContext";
import Titlebar from "./components/Titlebar";
import Sidebar from "./components/Sidebar";
import ProjectSelector from "./components/ProjectSelector";
import CodeAnalysis from "./components/CodeAnalysis";
import ArchitectureAnalysis from "./components/ArchitectureAnalysis";
import FunctionGraph from "./components/FunctionGraph";
import Settings from "./components/Settings";
import Welcome from "./components/Welcome";
import type { Page, LspServerInfo } from "./types";

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 400;

function AppLayout() {
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
      case "functionGraph":
        return <FunctionGraph />;
      case "architecture":
        return <ArchitectureAnalysis />;
      case "settings":
        return <Settings />;
      default:
        return <ProjectSelector onNavigate={setCurrentPage} />;
    }
  };

  return (
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
          className={`flex-1 flex flex-col min-h-0 bg-[var(--bg-app)] ${
            currentPage === "functionGraph" ? "overflow-hidden" : "overflow-y-auto"
          }`}
          style={{ marginLeft: sidebarWidth }}
        >
          <div className={currentPage === "functionGraph" ? "flex-1 min-h-0" : "p-8"}>
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [initialServers, setInitialServers] = useState<LspServerInfo[]>([]);

  const handleReady = useCallback((servers: LspServerInfo[]) => {
    setInitialServers(servers);
    setReady(true);
  }, []);

  return (
    <SettingsProvider>
      {!ready ? (
        <Welcome onReady={handleReady} />
      ) : (
        <ProjectProvider initialServers={initialServers}>
          <AppLayout />
        </ProjectProvider>
      )}
    </SettingsProvider>
  );
}
