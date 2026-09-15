// Brand detection pipeline
// Spec: docs/PROJECT_PLAN.md §10.3

import { z } from "zod";
import { ensureForegroundContrast } from "./color.js";
import {
  applyReadableAccent,
  applyReadableMuted,
  detectColorsFrom,
  upsertSource,
  type FieldSource,
} from "./detect-colors.js";
import type { ProjectFiles } from "./files.js";
import { findLogoPair } from "./logo.js";
import { decodePng, dominantNonNeutralColor } from "./png.js";
// One implementation only. detect.ts previously carried its own copies of these, which
// drifted from the ones in sources/readme.ts and read a YAML comment as the project name.
import { extractH1, extractTagline } from "../sources/readme.js";
import {
  DEFAULT_BRAND_FONTS,
  type Brand,
} from "./schema.js";





/** Path helpers, kept local so this module stays free of `node:path` and reaches the browser. */
function basename(path: string): string {
  return path.split("/").pop() ?? path;
}


export interface BrandDetection {
  brand: Brand;
  sources: FieldSource[];
  notes: string[];
}

const packageSchema = z.object({
  private: z.boolean().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  homepage: z.string().optional(),
  repository: z.union([z.string(), z.object({ url: z.string().optional() })]).optional(),
});


/**
 * Detection over any source. `root` is only used to make reported paths readable, so the
 * GitHub implementation can pass the repository slug.
 */
export async function detectBrandFrom(files: ProjectFiles, cwd = "."): Promise<BrandDetection> {
  const sources: FieldSource[] = [];
  const notes: string[] = [];
  const pkg = await readPackage(files);
  const readme = await files.read("README.md");

  const name = detectName(pkg, readme, cwd, sources);
  const tagline = detectTagline(pkg, readme, sources);
  const url = await detectUrl(files, pkg, cwd, sources);
  const logo = findLogoPair(cwd);
  if (logo !== undefined) {
    sources.push({ field: "logo", source: logo.light });
  }

  const colors = await detectColorsFrom(files, cwd, logo?.light, sources, notes, dominantLogoColor);
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
  // A private package.json is a workspace root, and its name is plumbing, not a brand.
  // The shipseal repo's own root is "shipseal-monorepo", which is not what to put on a card.
  if (pkg?.name !== undefined && pkg.private !== true) {
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
  files: ProjectFiles,
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
  const remote = await files.gitRemote?.();
  if (remote !== undefined) {
    sources.push({ field: "url", source: "git remote origin" });
    return remote;
  }
  return undefined;
}






async function readPackage(files: ProjectFiles): Promise<z.infer<typeof packageSchema> | undefined> {
  const raw = await files.read("package.json");
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





function stripScope(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
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

export function normalizeGitUrl(url: string): string {
  const ssh = /^git@([^:]+):(.+)$/.exec(url);
  if (ssh !== null && ssh[1] !== undefined && ssh[2] !== undefined) {
    return `https://${ssh[1]}/${ssh[2].replace(/\.git$/, "")}`;
  }
  return url.replace(/^git\+/, "").replace(/\.git$/, "");
}

/**
 * Dominant non-neutral color of a PNG logo, or undefined when the file cannot be read or
 * carries no color. Detection reports the color as not found rather than falling back to a
 * built-in default that would be presented to the user as "your brand".
 */
async function dominantLogoColor(files: ProjectFiles, path: string): Promise<string | undefined> {
  const buffer = await files.readBinary(path);
  if (buffer === undefined) {
    return undefined;
  }
  const png = decodePng(Buffer.from(buffer));
  if (png === undefined) {
    return undefined;
  }
  return dominantNonNeutralColor(png);
}

