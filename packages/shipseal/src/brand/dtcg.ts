// W3C Design Tokens reader
// Spec: docs/PROJECT_PLAN.md §10.1

import { parseCssColor } from "./color.js";
import type { ExtractedColors } from "./tailwind.js";

export function extractDtcgColors(tokens: unknown): ExtractedColors {
  const found: Record<string, string> = {};
  walk(tokens, [], found);
  const out: ExtractedColors = {};
  const background = found.background ?? found.bg;
  if (background !== undefined) {
    out.background = background;
  }
  const foreground = found.foreground ?? found.fg;
  if (foreground !== undefined) {
    out.foreground = foreground;
  }
  if (found.muted !== undefined) {
    out.muted = found.muted;
  }
  const primary = found.primary ?? found.brand;
  if (primary !== undefined) {
    out.primary = primary;
  }
  const accent = found.accent ?? found.secondary;
  if (accent !== undefined) {
    out.accent = accent;
  }
  return out;
}

function walk(node: unknown, path: string[], found: Record<string, string>): void {
  if (!isRecord(node)) {
    return;
  }
  if (node.$type === "color") {
    const hex = colorValue(node.$value);
    const leaf = path[path.length - 1];
    if (hex !== undefined && leaf !== undefined && found[leaf] === undefined) {
      found[leaf] = hex;
    }
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$")) {
      continue;
    }
    walk(value, [...path, key], found);
  }
}

function colorValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return parseCssColor(value);
  }
  if (isRecord(value) && typeof value.hex === "string") {
    return parseCssColor(value.hex);
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
