import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { AnalysisResult } from "../types";

interface ProjectContextType {
  projectPath: string | null;
  projectName: string | null;
  analysisResult: AnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;
  setProject: (path: string) => void;
  setAnalysis: (result: AnalysisResult) => void;
  setAnalyzing: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearProject: () => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setProject = useCallback((path: string) => {
    setProjectPath(path);
    const name = path.split(/[/\\]/).filter(Boolean).pop() || path;
    setProjectName(name);
    setAnalysisResult(null);
    setError(null);
  }, []);

  const setAnalysis = useCallback((result: AnalysisResult) => {
    setAnalysisResult(result);
  }, []);

  const setAnalyzing = useCallback((loading: boolean) => {
    setIsAnalyzing(loading);
  }, []);

  const clearProject = useCallback(() => {
    setProjectPath(null);
    setProjectName(null);
    setAnalysisResult(null);
    setError(null);
  }, []);

  return (
    <ProjectContext.Provider
      value={{
        projectPath,
        projectName,
        analysisResult,
        isAnalyzing,
        error,
        setProject,
        setAnalysis,
        setAnalyzing,
        setError,
        clearProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}
