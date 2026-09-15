// Colour detection, free of every `node:` import so the browser demo runs the same code the CLI
// does. Spec: docs/REVIEW_2026-09-15.md R0.
//
// Splitting this out is what makes /try show a visitor's own colors. `detect.ts` keeps the parts
// that need disk or zlib (logo files, PNG sampling, README parsing); the colour work is pure
// text and reaches both surfaces.

import type { Brand } from "./schema.js";
import { isNeutralHex, parseCssColor, readableOnBackground } from "./color.js";
import { extractCssRootColors } from "./css-vars.js";
import { extractDtcgColors } from "./dtcg.js";
import type { ProjectFiles } from "./files.js";
import { extractTailwindV3Colors, extractTailwindV4Colors, type ExtractedColors } from "./tailwind.js";
import { DEFAULT_BRAND_COLORS } from "./schema.js";

export interface FieldSource {
  field: string;
  source: string;
}

/** Sampling a PNG logo needs zlib, so the caller supplies it when it can. */
export type LogoColor = (files: ProjectFiles, path: string) => Promise<string | undefined>;

/** Path helpers, kept local so this module never imports `node:path`. */
function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function relative(from: string, path: string): string {
  const prefix = from.endsWith("/") ? from : `${from}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export async function detectColorsFrom(
  files: ProjectFiles,
  cwd: string,
  logoPath: string | undefined,
  sources: FieldSource[],
  notes: string[],
  logoColor: LogoColor = () => Promise.resolve(undefined),
): Promise<Brand["colors"]> {
  const merged: ExtractedColors = {};
  const paths = await files.list();

  const cssFiles = paths.filter((file) => file.endsWith(".css"));
  const cssContents = await Promise.all(
    cssFiles.map(async (file) => ({ file, css: await files.read(file) })),
  );
  for (const { file, css } of cssContents) {
    if (css === undefined) {
      continue;
    }
    const fromTheme = extractTailwindV4Colors(css);
    const fromRoot = extractCssRootColors(css);
    const rel = relative(cwd, file);
    applyColors(merged, fromTheme, sources, `Tailwind v4 @theme in ${rel}`);
    applyColors(merged, fromRoot, sources, `:root variables in ${rel}`);
  }

  const configFiles = paths.filter((file) => basename(file).startsWith("tailwind.config."));
  const configContents = await Promise.all(
    configFiles.map(async (file) => ({ file, source: await files.read(file) })),
  );
  for (const { file, source } of configContents) {
    if (source === undefined) {
      continue;
    }
    applyColors(
      merged,
      extractTailwindV3Colors(source),
      sources,
      `Tailwind config ${relative(cwd, file)}`,
    );
  }

  const tokenFile = paths.find((file) => file.endsWith(".tokens.json"));
  if (tokenFile !== undefined) {
    const raw = await files.read(tokenFile);
    if (raw !== undefined) {
      try {
        const parsed: unknown = JSON.parse(raw);
        applyColors(merged, extractDtcgColors(parsed), sources, relative(cwd, tokenFile));
      } catch (error) {
        if (error instanceof SyntaxError) {
          notes.push(`Could not parse design tokens file ${relative(cwd, tokenFile)}.`);
        } else {
          throw error;
        }
      }
    }
  }

  if (merged.primary === undefined && logoPath !== undefined) {
    const fromPng = logoPath.endsWith(".png") ? await logoColor(files, logoPath) : undefined;
    if (fromPng !== undefined) {
      merged.primary = fromPng;
      sources.push({ field: "colors.primary", source: `dominant color in ${logoPath}` });
    }
    const svg = logoPath.endsWith(".svg") ? await files.read(logoPath) : undefined;
    if (svg !== undefined) {
      const fromLogo = firstNonNeutralSvgColor(svg);
      if (fromLogo !== undefined) {
        merged.primary = fromLogo;
        sources.push({ field: "colors.primary", source: `SVG fill in ${logoPath}` });
      }
    }
  }

  // Say which colors are built-in defaults rather than anything found in this project.
  // Every other detected field prints its source, so staying silent here would let a user
  // read Shipseal's own red as their brand color.
  const fellBack = (["background", "foreground", "muted", "primary", "accent"] as const).filter(
    (field) => merged[field] === undefined,
  );
  if (fellBack.length > 0) {
    notes.push(
      `Using built-in defaults for ${fellBack.map((f) => `colors.${f}`).join(", ")}. ` +
        "Nothing in this project set them. Edit .shipseal/brand.json to use your own.",
    );
  }

  return {
    background: merged.background ?? DEFAULT_BRAND_COLORS.background,
    foreground: merged.foreground ?? DEFAULT_BRAND_COLORS.foreground,
    muted: merged.muted ?? DEFAULT_BRAND_COLORS.muted,
    primary: merged.primary ?? DEFAULT_BRAND_COLORS.primary,
    accent: merged.accent ?? DEFAULT_BRAND_COLORS.accent,
  };
}

function applyColors(
  target: ExtractedColors,
  incoming: ExtractedColors,
  sources: FieldSource[],
  source: string,
): void {
  const keys = ["background", "foreground", "muted", "primary", "accent"] as const;
  for (const key of keys) {
    const value = incoming[key];
    if (value !== undefined && target[key] === undefined) {
      target[key] = value;
      sources.push({ field: `colors.${key}`, source });
    }
  }
}

export function applyReadableMuted(
  colors: Brand["colors"],
  sources: FieldSource[],
  notes: string[],
): void {
  if (colors.muted === undefined || readableOnBackground(colors.background, colors.muted)) {
    return;
  }
  colors.muted = DEFAULT_BRAND_COLORS.muted;
  notes.push(
    `Muted text color failed WCAG AA large-text contrast (3:1) against background, so it was set to ${DEFAULT_BRAND_COLORS.muted}.`,
  );
  upsertSource(sources, "colors.muted", "contrast adjustment");
}

export function applyReadableAccent(
  colors: Brand["colors"],
  sources: FieldSource[],
  notes: string[],
): void {
  if (colors.accent === undefined || readableOnBackground(colors.background, colors.accent)) {
    return;
  }
  colors.accent = colors.primary ?? DEFAULT_BRAND_COLORS.primary;
  notes.push("Accent failed contrast against background, so it uses the primary color.");
  upsertSource(sources, "colors.accent", "contrast adjustment");
}

export function upsertSource(sources: FieldSource[], field: string, source: string): void {
  const existing = sources.find((entry) => entry.field === field);
  if (existing !== undefined) {
    existing.source = source;
    return;
  }
  sources.push({ field, source });
}

function firstNonNeutralSvgColor(svg: string): string | undefined {
  const re = /(?:fill|stroke)="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(svg)) !== null) {
    const raw = match[1];
    if (raw === undefined || raw === "none" || raw === "currentColor") {
      continue;
    }
    const hex = parseCssColor(raw);
    if (hex !== undefined && !isNeutralHex(hex)) {
      return hex;
    }
  }
  return undefined;
}
