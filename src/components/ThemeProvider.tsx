import { createContext, useContext, useEffect, useState } from "react";

type Theme = 
  | "dark" 
  | "light" 
  | "cyberpunk" 
  | "neon" 
  | "deep-space"
  | "sunset"
  | "forest"
  | "ocean"
  | "midnight"
  | "terminal"
  | "dracula";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "dark",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "dyad-ui-theme",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;

    // Remove old theme classes
    root.classList.remove(
      "light", "dark", "cyberpunk", "neon", "deep-space",
      "sunset", "forest", "ocean", "midnight", "terminal", "dracula"
    );

    // Add new theme class
    root.classList.add(theme);
    
    // Also handle the data-theme attribute for CSS variable switching
    root.setAttribute("data-theme", theme);

    localStorage.setItem(storageKey, theme);
  }, [theme, storageKey]);

  return (
    <ThemeProviderContext.Provider
      value={{
        theme,
        setTheme,
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};