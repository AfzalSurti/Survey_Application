export const palette = {
  bgTop: "#DCEBFB",
  bgBottom: "#C3DEF5",
  ink: "#1B3A5C",
  accentPrimary: "#1B4F8C",
  accentSecondary: "#6FA83E",
  warn: "#E0A33B",
  glass: "rgba(255,255,255,0.55)",
  darkGlass: "rgba(16,37,59,0.72)",
};

export type AppTheme = typeof palette & { background: string; surface: string; muted: string; border: string };
export const lightTheme: AppTheme = { ...palette, background: palette.bgTop, surface: palette.glass, muted: "#55708C", border: "rgba(27,79,140,0.16)" };
export const darkTheme: AppTheme = { ...palette, background: "#10243A", surface: palette.darkGlass, muted: "#B9CAE0", border: "rgba(220,235,251,0.18)" };
