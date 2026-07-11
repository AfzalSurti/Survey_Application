import React, { createContext, useContext, useMemo, useState } from "react";
import { AppTheme, darkTheme, lightTheme } from "@/theme/colors";

type ThemeValue = { theme: AppTheme; isDark: boolean; toggleTheme: () => void };
const ThemeContext = createContext<ThemeValue | null>(null);
export function ThemeProvider({ children }: React.PropsWithChildren) {
  const [isDark, setDark] = useState(false);
  const value = useMemo(() => ({ theme: isDark ? darkTheme : lightTheme, isDark, toggleTheme: () => setDark(v => !v) }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
};
