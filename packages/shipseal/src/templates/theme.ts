// Dark/light palette derived from brand.json
// Spec: docs/PROJECT_PLAN.md §14.3

import { DEFAULT_BRAND_COLORS, type Brand } from "../brand/schema.js";

export interface ThemeColors {
  background: string;
  foreground: string;
  muted: string;
  primary: string;
  accent: string;
  card: string;
}

export function themeColors(brand: Brand, theme: "dark" | "light"): ThemeColors {
  const primary = brand.colors.primary ?? DEFAULT_BRAND_COLORS.primary;
  const accent = brand.colors.accent ?? DEFAULT_BRAND_COLORS.accent;
  const muted = brand.colors.muted ?? DEFAULT_BRAND_COLORS.muted;
  if (theme === "dark") {
    const background = brand.theme === "dark" ? brand.colors.background : brand.colors.foreground;
    const foreground = brand.theme === "dark" ? brand.colors.foreground : brand.colors.background;
    return {
      background,
      foreground,
      muted: brand.theme === "dark" ? muted : DEFAULT_BRAND_COLORS.muted,
      primary,
      accent,
      card: mix(background, foreground, 0.08),
    };
  }
  const background = brand.theme === "light" ? brand.colors.background : brand.colors.foreground;
  const foreground = brand.theme === "light" ? brand.colors.foreground : brand.colors.background;
  return {
    background,
    foreground,
    muted: brand.theme === "light" ? muted : "#52525b",
    primary,
    accent,
    card: mix(background, foreground, 0.06),
  };
}

function mix(a: string, b: string, amount: number): string {
  const ar = Number.parseInt(a.slice(1, 3), 16);
  const ag = Number.parseInt(a.slice(3, 5), 16);
  const ab = Number.parseInt(a.slice(5, 7), 16);
  const br = Number.parseInt(b.slice(1, 3), 16);
  const bg = Number.parseInt(b.slice(3, 5), 16);
  const bb = Number.parseInt(b.slice(5, 7), 16);
  return `#${toHex(ar + (br - ar) * amount)}${toHex(ag + (bg - ag) * amount)}${toHex(ab + (bb - ab) * amount)}`;
}

function toHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}
