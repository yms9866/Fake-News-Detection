import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { ThemeColors, ThemeMode, colorsForMode, lightColors } from "./tokens";

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  colors: lightColors,
  setMode: () => undefined,
  toggleMode: () => undefined
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(system === "dark" ? "dark" : "light");
  const value = useMemo(
    () => ({
      mode,
      colors: colorsForMode(mode),
      setMode,
      toggleMode: () => setMode((current) => (current === "dark" ? "light" : "dark"))
    }),
    [mode]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { radius, space, type, lightColors, darkColors } from "./tokens";
export type { ThemeColors, ThemeMode } from "./tokens";
