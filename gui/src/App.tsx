import { useState } from "react";
import { ProjectProvider } from "./context/ProjectContext";
import { SettingsProvider } from "./context/SettingsContext";
import Sidebar from "./components/Sidebar";
import ProjectSelector from "./components/ProjectSelector";
import CodeAnalysis from "./components/CodeAnalysis";
import ArchitectureAnalysis from "./components/ArchitectureAnalysis";
import Settings from "./components/Settings";
import type { Page } from "./types";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("project");

  const renderPage = () => {
    switch (currentPage) {
      case "project":
        return <ProjectSelector onNavigate={setCurrentPage} />;
      case "analysis":
        return <CodeAnalysis />;
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
        <div className="flex h-screen overflow-hidden">
          <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
          <main
            className="flex-1 overflow-y-auto bg-[var(--bg-app)]"
            style={{ marginLeft: "var(--sidebar-width)" }}
          >
            <div className="p-8">{renderPage()}</div>
          </main>
        </div>
      </ProjectProvider>
    </SettingsProvider>
  );
}
