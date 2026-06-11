// @refresh reset
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AnalysisResult, AnalysisRecord, LspServerInfo, SymbolAnalysisResult, ModuleAnalysisResult, FunctionGraphResult } from "../types";

interface ProjectContextType {
  projectPath: string | null;
  projectName: string | null;
  analysisResult: AnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;
  // Language selection
  availableLanguages: LspServerInfo[];
  selectedLanguages: string[];
  // Symbol analysis
  symbolResults: Record<string, SymbolAnalysisResult>;
  isAnalyzingSymbols: boolean;
  symbolError: string | null;
  // Module analysis
  moduleResults: Record<string, ModuleAnalysisResult>;
  setModuleResult: (langId: string, result: ModuleAnalysisResult) => void;
  // Function graph
  functionGraphResults: Record<string, FunctionGraphResult>;
  setFunctionGraphResult: (langId: string, result: FunctionGraphResult) => void;
  // Actions
  setProject: (path: string) => void;
  setAnalysis: (result: AnalysisResult) => void;
  setAnalyzing: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAvailableLanguages: (langs: LspServerInfo[]) => void;
  setSelectedLanguages: (langs: string[]) => void;
  setSymbolResult: (langId: string, result: SymbolAnalysisResult) => void;
  setAnalyzingSymbols: (loading: boolean) => void;
  setSymbolError: (error: string | null) => void;
  clearProject: () => void;
  saveAnalysisRecord: (
    analysis: AnalysisResult,
    langs: string[],
    langNames: Record<string, string>,
    symbols: Record<string, SymbolAnalysisResult>,
    modules: Record<string, ModuleAnalysisResult>,
    fgs?: Record<string, FunctionGraphResult>,
  ) => Promise<void>;
  restoreAnalysis: (record: AnalysisRecord) => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({
  children,
  initialServers,
}: {
  children: ReactNode;
  initialServers?: LspServerInfo[];
}) {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<LspServerInfo[]>(
    initialServers ?? [],
  );

  useEffect(() => {
    if (initialServers && initialServers.length > 0) {
      setAvailableLanguages(initialServers);
    }
  }, [initialServers]);

  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [symbolResults, setSymbolResults] = useState<Record<string, SymbolAnalysisResult>>({});
  const [isAnalyzingSymbols, setIsAnalyzingSymbols] = useState(false);
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const [moduleResults, setModuleResults] = useState<Record<string, ModuleAnalysisResult>>({});
  const [functionGraphResults, setFunctionGraphResults] = useState<Record<string, FunctionGraphResult>>({});

  const setProject = useCallback((path: string) => {
    setProjectPath(path);
    const name = path.split(/[/\\]/).filter(Boolean).pop() || path;
    setProjectName(name);
    setAnalysisResult(null);
    setError(null);
    setSelectedLanguages([]);
    setSymbolResults({});
    setSymbolError(null);
    setModuleResults({});
    setFunctionGraphResults({});
  }, []);

  const setAnalysis = useCallback((result: AnalysisResult) => {
    setAnalysisResult(result);
  }, []);

  const setAnalyzing = useCallback((loading: boolean) => {
    setIsAnalyzing(loading);
  }, []);

  const setSymbolResult = useCallback((langId: string, result: SymbolAnalysisResult) => {
    setSymbolResults((prev) => ({ ...prev, [langId]: result }));
  }, []);

  const setModuleResult = useCallback((langId: string, result: ModuleAnalysisResult) => {
    setModuleResults((prev) => ({ ...prev, [langId]: result }));
  }, []);

  const setFunctionGraphResult = useCallback((langId: string, result: FunctionGraphResult) => {
    setFunctionGraphResults((prev) => ({ ...prev, [langId]: result }));
  }, []);

  const setAnalyzingSymbols = useCallback((loading: boolean) => {
    setIsAnalyzingSymbols(loading);
  }, []);

  const clearProject = useCallback(() => {
    setProjectPath(null);
    setProjectName(null);
    setAnalysisResult(null);
    setError(null);
    setSelectedLanguages([]);
    setSymbolResults({});
    setSymbolError(null);
  }, []);

  const saveAnalysisRecord = useCallback(async (
    analysis: AnalysisResult,
    langs: string[],
    langNames: Record<string, string>,
    symbols: Record<string, SymbolAnalysisResult>,
    modules: Record<string, ModuleAnalysisResult>,
    fgs?: Record<string, FunctionGraphResult>,
  ) => {
    const record: AnalysisRecord = {
      id: crypto.randomUUID(),
      project_path: analysis.project_path,
      project_name: analysis.project_name,
      analyzed_at: new Date().toISOString(),
      languages: langs.map((id) => langNames[id] || id),
      language_ids: langs,
      analysis,
      symbols,
      modules,
      functionGraphs: fgs,
    };
    try {
      await invoke("save_analysis", { record });
    } catch (err) {
      console.error("保存分析记录失败:", err);
    }
  }, []);

  const restoreAnalysis = useCallback((record: AnalysisRecord) => {
    setProjectPath(record.project_path);
    setProjectName(record.project_name);
    setAnalysisResult(record.analysis);
    setSymbolResults(record.symbols);
    setModuleResults(record.modules || {});
    const functionGraphs = record.functionGraphs || {};
    setFunctionGraphResults(functionGraphs);
    // Restore language IDs so tabs render correctly
    const ids =
      record.language_ids?.length
        ? record.language_ids
        : [
            ...new Set([
              ...Object.keys(record.modules || {}),
              ...Object.keys(functionGraphs),
            ]),
          ];
    setSelectedLanguages(ids);
    // Rebuild minimal availableLanguages from the record
    const langNameMap: Record<string, string> = {};
    if (record.language_ids) {
      record.language_ids.forEach((id, i) => {
        langNameMap[id] = record.languages[i] || id;
      });
    }
    const restored: LspServerInfo[] = ids.map((id) => ({
      id,
      language: langNameMap[id] || id,
      command: "",
      args: [],
      extensions: [],
      available: true,
      version: null,
      path: null,
      error: null,
    }));
    setAvailableLanguages(restored);
    setError(null);
    setSymbolError(null);
    setIsAnalyzing(false);
    setIsAnalyzingSymbols(false);
  }, []);

  return (
    <ProjectContext.Provider
      value={{
        projectPath,
        projectName,
        analysisResult,
        isAnalyzing,
        error,
        availableLanguages,
        selectedLanguages,
        symbolResults,
        isAnalyzingSymbols,
        symbolError,
        moduleResults,
        setModuleResult,
        functionGraphResults,
        setFunctionGraphResult,
        setProject,
        setAnalysis,
        setAnalyzing,
        setError,
        setAvailableLanguages,
        setSelectedLanguages,
        setSymbolResult,
        setAnalyzingSymbols,
        setSymbolError,
        clearProject,
        saveAnalysisRecord,
        restoreAnalysis,
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
