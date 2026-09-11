// Brand detection pipeline
// Spec: docs/PROJECT_PLAN.md §10.3

import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { ensureForegroundContrast, isNeutralHex, parseCssColor, readableOnBackground } from "./color.js";
import { extractCssRootColors } from "./css-vars.js";
import { extractDtcgColors } from "./dtcg.js";
import { findLogoPair } from "./logo.js";
import {
  DEFAULT_BRAND_COLORS,
  DEFAULT_BRAND_FONTS,
  type Brand,
} from "./schema.js";
import { extractTailwindV3Colors, extractTailwindV4Colors, type ExtractedColors } from "./tailwind.js";

const execFileAsync = promisify(execFile);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".shipseal",
  ".next",
  "build",
]);

export interface FieldSource {
  field: string;
  source: string;
}

export interface BrandDetection {
  brand: Brand;
  sources: FieldSource[];
  notes: string[];
}

const packageSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  homepage: z.string().optional(),
  repository: z.union([z.string(), z.object({ url: z.string().optional() })]).optional(),
});

export async function detectBrand(cwd: string): Promise<BrandDetection> {
  const sources: FieldSource[] = [];
  const notes: string[] = [];
  const pkg = await readPackage(cwd);
  const readme = await readMaybe(join(cwd, "README.md"));

  const name = detectName(pkg, readme, cwd, sources);
  const tagline = detectTagline(pkg, readme, sources);
  const url = await detectUrl(pkg, cwd, sources);
  const logo = findLogoPair(cwd);
  if (logo !== undefined) {
    sources.push({ field: "logo", source: logo.light });
  }

  const colors = await detectColors(cwd, logo?.light, sources, notes);
  const contrast = ensureForegroundContrast(colors.background, colors.foreground);
  if (contrast.adjusted) {
    colors.foreground = contrast.foreground;
    notes.push(
      `Foreground failed WCAG AA large-text contrast (3:1) against background, so it was set to ${contrast.foreground}.`,
    );
    upsertSource(sources, "colors.foreground", "contrast adjustment");
  }
  applyReadableMuted(colors, sources, notes);
  applyReadableAccent(colors, sources, notes);

  const brand: Brand = {
    version: 1,
    name,
    colors,
    fonts: {
      heading: { ...DEFAULT_BRAND_FONTS.heading },
      body: { ...DEFAULT_BRAND_FONTS.body },
      mono: { ...DEFAULT_BRAND_FONTS.mono },
    },
    radius: 16,
    theme: "dark",
    style: "minimal",
    tokens: null,
  };
  if (tagline !== undefined) {
    brand.tagline = tagline;
  }
  if (url !== undefined) {
    brand.url = url;
  }
  if (logo !== undefined) {
    brand.logo = logo.dark === undefined ? { light: logo.light } : { light: logo.light, dark: logo.dark };
  }
  sources.push({ field: "fonts", source: "built-in Geist / vendored Geist Mono" });
  return { brand, sources, notes };
}

function detectName(
  pkg: z.infer<typeof packageSchema> | undefined,
  readme: string | undefined,
  cwd: string,
  sources: FieldSource[],
): string {
  if (pkg?.name !== undefined) {
    const fromPkg = stripScope(pkg.name);
    const h1 = readme === undefined ? undefined : extractH1(readme);
    if (h1 !== undefined && h1.toLowerCase() === fromPkg.toLowerCase() && h1 !== fromPkg) {
      sources.push({ field: "name", source: "README.md H1" });
      return h1;
    }
    sources.push({ field: "name", source: "package.json#name" });
    return fromPkg;
  }
  const h1 = readme === undefined ? undefined : extractH1(readme);
  if (h1 !== undefined) {
    sources.push({ field: "name", source: "README.md H1" });
    return h1;
  }
  sources.push({ field: "name", source: "directory name" });
  const fromDir = basename(cwd);
  return fromDir.length > 0 ? fromDir : "project";
}

function detectTagline(
  pkg: z.infer<typeof packageSchema> | undefined,
  readme: string | undefined,
  sources: FieldSource[],
): string | undefined {
  if (pkg?.description !== undefined && pkg.description.trim().length > 0) {
    sources.push({ field: "tagline", source: "package.json#description" });
    return pkg.description.trim();
  }
  if (readme !== undefined) {
    const tagline = extractTagline(readme);
    if (tagline !== undefined) {
      sources.push({ field: "tagline", source: "README.md first paragraph" });
      return tagline;
    }
  }
  return undefined;
}

async function detectUrl(
  pkg: z.infer<typeof packageSchema> | undefined,
  cwd: string,
  sources: FieldSource[],
): Promise<string | undefined> {
  if (pkg?.homepage !== undefined && pkg.homepage.length > 0) {
    sources.push({ field: "url", source: "package.json#homepage" });
    return pkg.homepage;
  }
  const repo = repositoryUrl(pkg?.repository);
  if (repo !== undefined) {
    sources.push({ field: "url", source: "package.json#repository" });
    return repo;
  }
  const remote = await gitRemote(cwd);
  if (remote !== undefined) {
    sources.push({ field: "url", source: "git remote origin" });
    return remote;
  }
  return undefined;
}

async function detectColors(
  cwd: string,
  logoPath: string | undefined,
  sources: FieldSource[],
  notes: string[],
): Promise<Brand["colors"]> {
  const merged: ExtractedColors = {};
  const files = await listFiles(cwd, 4);

  const cssFiles = files.filter((file) => file.endsWith(".css"));
  const cssContents = await Promise.all(
    cssFiles.map(async (file) => ({ file, css: await readMaybe(file) })),
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

  const configFiles = files.filter((file) => basename(file).startsWith("tailwind.config."));
  const configContents = await Promise.all(
    configFiles.map(async (file) => ({ file, source: await readMaybe(file) })),
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

  const tokenFile = files.find((file) => file.endsWith(".tokens.json"));
  if (tokenFile !== undefined) {
    const raw = await readMaybe(tokenFile);
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
    const svg = logoPath.endsWith(".svg") ? await readMaybe(join(cwd, logoPath)) : undefined;
    if (svg !== undefined) {
      const fromLogo = firstNonNeutralSvgColor(svg);
      if (fromLogo !== undefined) {
        merged.primary = fromLogo;
        sources.push({ field: "colors.primary", source: `SVG fill in ${logoPath}` });
      }
    }
  }

  return {
    background: merged.background ?? DEFAULT_BRAND_COLORS.background,
    foreground: merged.foreground ?? DEFAULT_BRAND_COLORS.foreground,
    muted: merged.muted ?? DEFAULT_BRAND_COLORS.muted,
    primary: merged.primary ?? DEFAULT_BRAND_COLORS.primary,
    accent: merged.accent ?? DEFAULT_BRAND_COLORS.accent,
  };
}

function applyReadableMuted(
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

function applyReadableAccent(
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

function upsertSource(sources: FieldSource[], field: string, source: string): void {
  const existing = sources.find((entry) => entry.field === field);
  if (existing !== undefined) {
    existing.source = source;
    return;
  }
  sources.push({ field, source });
}

async function readPackage(cwd: string): Promise<z.infer<typeof packageSchema> | undefined> {
  const raw = await readMaybe(join(cwd, "package.json"));
  if (raw === undefined) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = packageSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

async function gitRemote(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd });
    return normalizeGitUrl(stdout.trim());
  } catch (error) {
    if (error instanceof Error) {
      return undefined;
    }
    throw error;
  }
}

async function listFiles(root: string, maxDepth: number): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth < 0) {
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const nested: Promise<void>[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github") {
        continue;
      }
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        nested.push(walk(path, depth - 1));
      } else {
        out.push(path);
      }
    }
    await Promise.all(nested);
  };
  await walk(root, maxDepth);
  return out;
}

async function readMaybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function stripScope(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

function extractH1(markdown: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(markdown);
  const heading = match?.[1];
  if (heading === undefined) {
    return undefined;
  }
  return heading.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
}

function extractTagline(markdown: string): string | undefined {
  const h1 = /^#\s+.+$/m.exec(markdown);
  const start = h1 === null ? 0 : (h1.index ?? 0) + h1[0].length;
  const rest = markdown.slice(start);
  for (const block of rest.split(/\n\s*\n/)) {
    const cleaned = stripBadges(block).trim();
    if (cleaned.length >= 20 && !cleaned.startsWith("#")) {
      return cleaned;
    }
  }
  return undefined;
}

function stripBadges(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/\[!\[[^\]]*]\([^)]+\)]\([^)]+\)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function repositoryUrl(repository: z.infer<typeof packageSchema>["repository"]): string | undefined {
  if (typeof repository === "string") {
    return normalizeGitUrl(repository);
  }
  if (repository?.url !== undefined) {
    return normalizeGitUrl(repository.url);
  }
  return undefined;
}

function normalizeGitUrl(url: string): string {
  const ssh = /^git@([^:]+):(.+)$/.exec(url);
  if (ssh !== null && ssh[1] !== undefined && ssh[2] !== undefined) {
    return `https://${ssh[1]}/${ssh[2].replace(/\.git$/, "")}`;
  }
  return url.replace(/^git\+/, "").replace(/\.git$/, "");
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
