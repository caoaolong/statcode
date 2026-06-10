import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Theme } from "../types";

interface SettingsContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  ignoreRules: string;
  setIgnoreRules: (rules: string) => void;
  fontFamily: string;
  setFontFamily: (family: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  lineHeight: number;
  setLineHeight: (height: number) => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

const THEME_STORAGE_KEY = "statcode.theme";
const IGNORE_RULES_STORAGE_KEY = "statcode.ignoreRules";
const FONT_FAMILY_KEY = "statcode.fontFamily";
const FONT_SIZE_KEY = "statcode.fontSize";
const LINE_HEIGHT_KEY = "statcode.lineHeight";

const DEFAULT_FONT_FAMILY = "system-ui";
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_LINE_HEIGHT = 1.6;

const DEFAULT_IGNORE_RULES = `# 依赖目录
node_modules/
vendor/
venv/
.venv/
__pycache__/
.pip-cache/

# 构建输出
dist/
build/
out/
target/
bin/
obj/

# 版本控制
.git/
.svn/
.hg/

# IDE 和编辑器
.idea/
.vscode/
*.swp
*.swo
*~
.project
.settings/
.classpath

# 系统文件
.DS_Store
Thumbs.db
desktop.ini

# 日志和临时文件
*.log
*.tmp
*.temp
.cache/
.turbo/
.next/
.nuxt/

# 环境和密钥
.env
.env.*
*.pem
*.key`;

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light";
  }
  return theme;
}

function applyResolvedTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.dataset.theme = resolved;
}

function applyFontSettings(family: string, size: number, lineHeight: number) {
  const root = document.documentElement;
  root.style.setProperty("--app-font-family", family);
  root.style.setProperty("--app-font-size", `${size}px`);
  root.style.setProperty("--app-line-height", `${lineHeight}`);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    return "system";
  });

  const [ignoreRules, setIgnoreRulesState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_IGNORE_RULES;
    const stored = window.localStorage.getItem(IGNORE_RULES_STORAGE_KEY);
    return stored ?? DEFAULT_IGNORE_RULES;
  });

  const [fontFamily, setFontFamilyState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_FONT_FAMILY;
    return window.localStorage.getItem(FONT_FAMILY_KEY) ?? DEFAULT_FONT_FAMILY;
  });

  const [fontSize, setFontSizeState] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
    const stored = window.localStorage.getItem(FONT_SIZE_KEY);
    return stored ? Number(stored) || DEFAULT_FONT_SIZE : DEFAULT_FONT_SIZE;
  });

  const [lineHeight, setLineHeightState] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_LINE_HEIGHT;
    const stored = window.localStorage.getItem(LINE_HEIGHT_KEY);
    return stored ? Number(stored) || DEFAULT_LINE_HEIGHT : DEFAULT_LINE_HEIGHT;
  });

  useEffect(() => {
    applyResolvedTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyResolvedTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    applyFontSettings(fontFamily, fontSize, lineHeight);
  }, [fontFamily, fontSize, lineHeight]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    }
  }, []);

  const setIgnoreRules = useCallback((rules: string) => {
    setIgnoreRulesState(rules);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(IGNORE_RULES_STORAGE_KEY, rules);
    }
  }, []);

  const setFontFamily = useCallback((family: string) => {
    setFontFamilyState(family);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FONT_FAMILY_KEY, family);
    }
  }, []);

  const setFontSize = useCallback((size: number) => {
    setFontSizeState(size);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FONT_SIZE_KEY, String(size));
    }
  }, []);

  const setLineHeight = useCallback((height: number) => {
    setLineHeightState(height);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LINE_HEIGHT_KEY, String(height));
    }
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        theme, setTheme,
        ignoreRules, setIgnoreRules,
        fontFamily, setFontFamily,
        fontSize, setFontSize,
        lineHeight, setLineHeight,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
