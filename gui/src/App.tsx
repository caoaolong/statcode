import { useState } from "react";
import { ProjectProvider } from "./context/ProjectContext";
import Sidebar from "./components/Sidebar";
import ProjectSelector from "./components/ProjectSelector";
import CodeAnalysis from "./components/CodeAnalysis";
import ArchitectureAnalysis from "./components/ArchitectureAnalysis";
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
      default:
        return <ProjectSelector onNavigate={setCurrentPage} />;
    }
  };

  return (
    <ProjectProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <main
          className="flex-1 overflow-y-auto bg-slate-50/80"
          style={{ marginLeft: "var(--sidebar-width)" }}
        >
          <div className="p-8">{renderPage()}</div>
        </main>
      </div>
    </ProjectProvider>
  );
}
