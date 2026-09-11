// Static Tailwind v3 config + v4 @theme color extraction
// Spec: docs/PROJECT_PLAN.md §10.3, spike S7

import { parseCssColor } from "./color.js";

export interface ExtractedColors {
  background?: string;
  foreground?: string;
  muted?: string;
  primary?: string;
  accent?: string;
}

const COLOR_PROP = /--color-([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
const CUSTOM_PROP = /--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
const SKIP_PREFIXES = new Set(["chart", "sidebar", "ring", "border", "input", "destructive"]);

export function extractTailwindV4Colors(css: string): ExtractedColors {
  const blocks = themeBlocks(css);
  const custom = collectCustomProperties(css);
  const fromTheme: Record<string, string> = {};
  for (const block of blocks) {
    COLOR_PROP.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = COLOR_PROP.exec(block)) !== null) {
      const name = match[1];
      const raw = match[2];
      if (name === undefined || raw === undefined || shouldSkip(name)) {
        continue;
      }
      fromTheme[name] = raw.trim();
    }
  }
  const resolved: Record<string, string> = {};
  for (const [name, raw] of Object.entries(fromTheme)) {
    const hex = resolveToHex(raw, custom, 0);
    if (hex !== undefined) {
      resolved[name] = hex;
    }
  }
  return mapBrandColors(resolved);
}

export function extractTailwindV3Colors(source: string): ExtractedColors {
  const found: Record<string, string> = {};
  const re =
    /\b(primary|brand|accent|background|foreground|muted|secondary)\b\s*:\s*["'`]([^"'`]+)["'`]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const name = match[1];
    const raw = match[2];
    if (name === undefined || raw === undefined) {
      continue;
    }
    const hex = parseCssColor(raw);
    if (hex !== undefined) {
      found[name] = hex;
    }
  }
  return mapBrandColors(found);
}

function themeBlocks(css: string): string[] {
  const blocks: string[] = [];
  const re = /@theme(?:\s+inline)?\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    const open = css.indexOf("{", match.index);
    if (open === -1) {
      break;
    }
    const close = matchingBrace(css, open);
    if (close === -1) {
      break;
    }
    blocks.push(css.slice(open + 1, close));
  }
  return blocks;
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

function collectCustomProperties(css: string): Map<string, string> {
  const props = new Map<string, string>();
  CUSTOM_PROP.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CUSTOM_PROP.exec(css)) !== null) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      props.set(`--${name}`, value.trim());
    }
  }
  return props;
}

function resolveToHex(
  raw: string,
  custom: Map<string, string>,
  depth: number,
): string | undefined {
  if (depth > 3) {
    return undefined;
  }
  const direct = parseCssColor(raw);
  if (direct !== undefined) {
    return direct;
  }
  const varMatch = /^var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^)]+)?\)$/.exec(raw);
  if (varMatch === null) {
    return undefined;
  }
  const ref = varMatch[1];
  if (ref === undefined) {
    return undefined;
  }
  const next = custom.get(ref);
  if (next === undefined) {
    return undefined;
  }
  return resolveToHex(next, custom, depth + 1);
}

function shouldSkip(name: string): boolean {
  const root = name.split("-")[0];
  return root !== undefined && SKIP_PREFIXES.has(root);
}

function mapBrandColors(found: Record<string, string>): ExtractedColors {
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
