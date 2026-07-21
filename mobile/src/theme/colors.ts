export const palette = {
  bgTop: "#DCEBFB",
  bgBottom: "#C3DEF5",
  ink: "#1B3A5C",
  accentPrimary: "#1B4F8C",
  accentSecondary: "#6FA83E",
  warn: "#E0A33B",
  danger: "#B54545",
  glass: "rgba(255,255,255,0.62)",
  darkGlass: "rgba(16,37,59,0.78)",
};

export type AppTheme = typeof palette & {
  background: string;
  surface: string;
  muted: string;
  border: string;
  cardText: string;
  successSoft: string;
  warnSoft: string;
  dangerSoft: string;
};

export const lightTheme: AppTheme = {
  ...palette,
  background: palette.bgTop,
  surface: palette.glass,
  muted: "#55708C",
  border: "rgba(27,79,140,0.16)",
  cardText: "#3D5570",
  successSoft: "#CFE5BA",
  warnSoft: "#F3E2B8",
  dangerSoft: "#F0D0D0",
};

export const darkTheme: AppTheme = {
  ...palette,
  background: "#10243A",
  surface: palette.darkGlass,
  ink: "#E8F2FC",
  muted: "#B9CAE0",
  border: "rgba(220,235,251,0.18)",
  cardText: "#C5D6EA",
  successSoft: "rgba(111,168,62,0.28)",
  warnSoft: "rgba(224,163,59,0.28)",
  dangerSoft: "rgba(181,69,69,0.28)",
};
