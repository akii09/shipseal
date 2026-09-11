// CSS :root variable extraction
// Spec: docs/PROJECT_PLAN.md §10.3

import { parseCssColor } from "./color.js";
import type { ExtractedColors } from "./tailwind.js";

const PROP =
  /--(primary|brand|accent|background|foreground|muted-foreground|muted)\s*:\s*([^;]+);/g;

export function extractCssRootColors(css: string): ExtractedColors {
  const fromRoot = extractBlockColors(css, /:root\s*\{/g);
  const fromDark = extractBlockColors(css, /\.dark\s*\{/g);
  return mapFoundColors({ ...fromRoot, ...fromDark });
}

function extractBlockColors(css: string, blockRe: RegExp): Record<string, string> {
  const found: Record<string, string> = {};
  blockRe.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(css)) !== null) {
    const open = css.indexOf("{", match.index);
    if (open === -1) {
      break;
    }
    const close = matchingBrace(css, open);
    if (close === -1) {
      break;
    }
    const body = css.slice(open + 1, close);
    PROP.lastIndex = 0;
    let prop: RegExpExecArray | null;
    while ((prop = PROP.exec(body)) !== null) {
      const name = prop[1];
      const raw = prop[2];
      if (name === undefined || raw === undefined) {
        continue;
      }
      const hex = parseCssColor(raw.trim());
      if (hex !== undefined) {
        found[name] = hex;
      }
    }
  }
  return found;
}

function mapFoundColors(found: Record<string, string>): ExtractedColors {
  const out: ExtractedColors = {};
  const background = found.background;
  if (background !== undefined) {
    out.background = background;
  }
  const foreground = found.foreground;
  if (foreground !== undefined) {
    out.foreground = foreground;
  }
  const muted = found["muted-foreground"] ?? found.muted;
  if (muted !== undefined) {
    out.muted = muted;
  }
  const primary = found.primary ?? found.brand;
  if (primary !== undefined) {
    out.primary = primary;
  }
  if (found.accent !== undefined) {
    out.accent = found.accent;
  }
  return out;
}

function matchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}
