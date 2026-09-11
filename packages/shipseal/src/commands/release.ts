// release: generate the release pack
// Spec: docs/PROJECT_PLAN.md §18.2

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { loadBrand } from "../brand/load.js";
import type { Brand } from "../brand/schema.js";
import { loadConfig, mergeConfig } from "../config/load.js";
import { DEFAULT_CONFIG, type Config } from "../config/schema.js";
import { deterministicCopy } from "../copy/deterministic.js";
import { llmCopy } from "../copy/llm.js";
import type { Copy } from "../copy/slots.js";
import { generate, type GenerateResult } from "../core/generate.js";
import type { ShipsealEvent } from "../core/events.js";
import { ShipsealError } from "../core/errors.js";
import { FORMAT_IDS, type FormatId } from "../formats.js";
import { eventId, writePack } from "../outputs/files.js";
import type { Manifest } from "../outputs/manifest.js";
import { createTakumiRenderer, resolvePackageRoot } from "../render/takumi.js";
import { collectFacts } from "../sources/collect.js";
import { gitCurrentTag } from "../sources/git.js";

export interface ReleaseFlags {
  cwd: string;
  tag?: string;
  from?: string;
  formats?: string;
  templates?: string;
  themes?: string;
  copy?: boolean;
  out?: string;
  strict?: boolean;
  dryRun?: boolean;
  package?: string;
}

export interface ReleaseResult {
  dryRun: boolean;
  facts: Awaited<ReturnType<typeof collectFacts>>;
  copy: Copy;
  copyMode: "deterministic" | "llm";
  copyWarning?: string;
  dir?: string;
  manifest?: Manifest;
  warnings: GenerateResult["warnings"];
  exitCode: 0 | 1 | 2;
}

export async function runRelease(flags: ReleaseFlags): Promise<ReleaseResult> {
  const cwd = flags.cwd;
  const config = overlayConfig(await loadConfig(cwd), flags);
  const brand = await loadBrand(cwd);
  const tag = flags.tag ?? (await gitCurrentTag(cwd));
  if (tag === undefined) {
    throw new ShipsealError(
      "release.no-tag",
      "No git tag found for this release.",
      "Create a git tag, or pass --tag vX.Y.Z.",
    );
  }
  const event: ShipsealEvent =
    flags.from === undefined
      ? { kind: "release", tag }
      : { kind: "release", tag, previousTag: flags.from };

  const collectOpts: Parameters<typeof collectFacts>[0] = {
    cwd,
    event,
    skipNetwork: flags.dryRun === true && process.env.GITHUB_TOKEN === undefined,
  };
  if (flags.package !== undefined) {
    collectOpts.packagePath = flags.package;
  }
  if (config.release?.changelogPath !== undefined) {
    collectOpts.changelogPath = config.release.changelogPath;
  }
  if (config.release?.snippet !== undefined) {
    collectOpts.snippet = config.release.snippet;
  }
  if (process.env.GITHUB_TOKEN !== undefined) {
    collectOpts.githubToken = process.env.GITHUB_TOKEN;
  }
  const facts = await collectFacts(collectOpts);

  const noCopy = flags.copy === false;
  const resolved = await resolveCopy(facts, config, noCopy);

  if (flags.dryRun === true) {
    const dry: ReleaseResult = {
      dryRun: true,
      facts,
      copy: resolved.copy,
      copyMode: resolved.copyMode,
      warnings: [],
      exitCode: 0,
    };
    if (resolved.warning !== undefined) {
      dry.copyWarning = resolved.warning;
    }
    return dry;
  }

  const renderer = await createTakumiRenderer();
  const generateInput: Parameters<typeof generate>[0] = {
    event,
    facts,
    brand,
    config,
    copy: resolved.copy,
    copyMode: resolved.copyMode,
    renderer,
    themes: resolveThemes(flags.themes, brand.theme),
    generatedAt: new Date().toISOString(),
  };
  const logos = await loadLogos(cwd, brand);
  if (logos !== undefined) {
    generateInput.logos = logos;
  }
  const result = await generate(generateInput);

  const written = await writePack({
    outDir: flags.out ?? config.outputDir ?? ".shipseal/output",
    eventId: eventId(event),
    result,
    event,
    brand,
    shipsealVersion: readShipsealVersion(),
  });

  const exitCode: 0 | 1 | 2 = flags.strict === true && result.warnings.length > 0 ? 2 : 0;
  const done: ReleaseResult = {
    dryRun: false,
    facts,
    copy: resolved.copy,
    copyMode: resolved.copyMode,
    dir: written.dir,
    manifest: written.manifest,
    warnings: result.warnings,
    exitCode,
  };
  if (resolved.warning !== undefined) {
    done.copyWarning = resolved.warning;
  }
  return done;
}

function overlayConfig(config: Config, flags: ReleaseFlags): Config {
  const overlay: Config = { ...config };
  if (flags.formats !== undefined) {
    overlay.formats = parseFormats(flags.formats);
  }
  if (flags.templates !== undefined) {
    overlay.release = {
      ...overlay.release,
      templates: flags.templates
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    };
  }
  if (flags.out !== undefined) {
    overlay.outputDir = flags.out;
  }
  return mergeConfig(DEFAULT_CONFIG, overlay);
}

function parseFormats(list: string): FormatId[] {
  const formats: FormatId[] = [];
  for (const part of list.split(",")) {
    const id = part.trim();
    if (id.length === 0) {
      continue;
    }
    const match = FORMAT_IDS.find((format) => format === id);
    if (match === undefined) {
      throw new ShipsealError(
        "release.bad-format",
        `Unknown format "${id}".`,
        `Use a comma-separated list from: ${FORMAT_IDS.join(", ")}.`,
      );
    }
    formats.push(match);
  }
  return formats;
}

function resolveThemes(flag: string | undefined, brandTheme: Brand["theme"]): Array<"dark" | "light"> {
  if (flag === "both") {
    return ["dark", "light"];
  }
  if (flag === "dark" || flag === "light") {
    return [flag];
  }
  return [brandTheme];
}

async function resolveCopy(
  facts: Awaited<ReturnType<typeof collectFacts>>,
  config: Config,
  noCopy: boolean,
): Promise<{ copy: Copy; copyMode: "deterministic" | "llm"; warning?: string }> {
  const fallback = deterministicCopy(facts, config.release?.maxHighlights);
  if (noCopy || config.copy?.llm !== true) {
    return { copy: fallback, copyMode: "deterministic" };
  }
  const apiKey = process.env.SHIPSEAL_LLM_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new ShipsealError(
      "copy.missing-key",
      "copy.llm is enabled but SHIPSEAL_LLM_API_KEY is not set.",
      "Set SHIPSEAL_LLM_API_KEY, or pass --no-copy for deterministic copy.",
    );
  }
  const llmOpts: Parameters<typeof llmCopy>[1] = {
    apiKey,
    model: config.copy.model ?? "gpt-4o-mini",
    maxRetries: config.copy.maxRetries ?? 2,
  };
  if (process.env.SHIPSEAL_LLM_BASE_URL !== undefined) {
    llmOpts.baseUrl = process.env.SHIPSEAL_LLM_BASE_URL;
  }
  const result = await llmCopy(facts, llmOpts, fallback);
  const out: { copy: Copy; copyMode: "deterministic" | "llm"; warning?: string } = {
    copy: result.copy,
    copyMode: result.mode,
  };
  if (result.warning !== undefined) {
    out.warning = result.warning;
  }
  return out;
}

async function loadLogos(cwd: string, brand: Brand): Promise<{ light?: Uint8Array; dark?: Uint8Array } | undefined> {
  if (brand.logo === undefined) {
    return undefined;
  }
  const logos: { light?: Uint8Array; dark?: Uint8Array } = {
    light: await readLogo(cwd, brand.logo.light),
  };
  if (brand.logo.dark !== undefined) {
    logos.dark = await readLogo(cwd, brand.logo.dark);
  }
  return logos;
}

async function readLogo(cwd: string, path: string): Promise<Uint8Array> {
  const resolved = isAbsolute(path) ? path : join(cwd, path);
  return new Uint8Array(await readFile(resolved));
}

function readShipsealVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(join(resolvePackageRoot(), "package.json"), "utf8"));
  if (typeof raw === "object" && raw !== null && "version" in raw && typeof raw.version === "string") {
    return raw.version;
  }
  return "0.0.0";
}
