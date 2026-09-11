// CSS :root variable extraction
// Spec: docs/PROJECT_PLAN.md §10.3

import { parseCssColor } from "./color.js";
import type { ExtractedColors } from "./tailwind.js";

// The trailing semicolon is optional: the last declaration before `}` usually has none,
// which silently dropped one color from almost every real stylesheet.
const PROP =
  /--(primary|brand|accent|background|foreground|muted-foreground|muted)\s*:\s*([^;}]+)[;}]?/g;

/** Any declaration, used to resolve `var(--brand-500)` style indirection. */
const ANY_PROP = /(--[\w-]+)\s*:\s*([^;}]+)[;}]?/g;

/**
 * Selectors that carry theme tokens in real projects. `:root` alone missed shadcn's
 * `[data-theme]` blocks, plain `html {}`, and `.light`.
 */
const SELECTORS = [
  /:root\s*\{/g,
  /(?:^|[\s,}])html\s*\{/g,
  /\.light\b[^{]*\{/g,
  /\[data-theme=["']?light["']?\][^{]*\{/g,
  /\.dark\b[^{]*\{/g,
  /\[data-theme=["']?dark["']?\][^{]*\{/g,
];

export function extractCssRootColors(css: string): ExtractedColors {
  const vars = allVariables(css);
  const found: Record<string, string> = {};
  // Later selectors win, so a dark block overrides a light one, as it does in a browser.
  for (const selector of SELECTORS) {
    Object.assign(found, extractBlockColors(css, selector, vars));
  }
  return mapFoundColors(found);
}

function allVariables(css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  ANY_PROP.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANY_PROP.exec(css)) !== null) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      vars[name] = value.trim();
    }
  }
  return vars;
}

/**
 * Resolve a declaration to a hex color.
 *
 * Handles two things a plain color parser does not. First, `var(--brand-500)` indirection,
 * up to three hops within the same file. Second, bare channel lists: shadcn writes
 * `--background: 0 0% 100%` and applies it as `hsl(var(--background))`, so the value is only
 * a color once wrapped. Percent signs on the last two channels mean HSL, three plain
 * numbers mean RGB.
 */
function resolveColor(raw: string, vars: Record<string, string>, depth = 0): string | undefined {
  const value = raw.trim();
  if (depth < 3) {
    const ref = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(value);
    const target = ref?.[1] === undefined ? undefined : vars[ref[1]];
    if (target !== undefined) {
      return resolveColor(target, vars, depth + 1);
    }
  }
  const direct = parseCssColor(value);
  if (direct !== undefined) {
    return direct;
  }
  const parts = value.split(/[\s/]+/).filter((p) => p.length > 0);
  if (parts.length === 3) {
    if (parts[1]?.endsWith("%") === true && parts[2]?.endsWith("%") === true) {
      return parseCssColor(`hsl(${parts[0]} ${parts[1]} ${parts[2]})`);
    }
    if (parts.every((p) => /^\d+(\.\d+)?$/.test(p))) {
      return parseCssColor(`rgb(${parts[0]} ${parts[1]} ${parts[2]})`);
    }
  }
  return undefined;
}

function extractBlockColors(
  css: string,
  blockRe: RegExp,
  vars: Record<string, string>,
): Record<string, string> {
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
      const hex = resolveColor(raw, vars);
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
