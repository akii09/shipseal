// Shared helpers for release, milestone, and bench commands

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { Brand } from "../brand/schema.js";
import { mergeConfig } from "../config/load.js";
import { DEFAULT_CONFIG, type Config } from "../config/schema.js";
import { llmCopy } from "../copy/llm.js";
import type { Copy } from "../copy/slots.js";
import { ShipsealError } from "../core/errors.js";
import type { ShipsealEvent } from "../core/events.js";
import type { GenerateResult } from "../core/generate.js";
import type { Facts } from "../facts/schema.js";
import { FORMAT_IDS, type FormatId } from "../formats.js";
import { eventId, writePack } from "../outputs/files.js";
import { appendJobSummary, uploadReleaseAssets } from "../outputs/github-release.js";
import type { Manifest } from "../outputs/manifest.js";
import { resolvePackageRoot } from "../render/takumi.js";

export interface SharedFlags {
  cwd: string;
  formats?: string;
  themes?: string;
  copy?: boolean;
  out?: string;
  strict?: boolean;
  dryRun?: boolean;
  package?: string;
  upload?: boolean;
  fetchImpl?: typeof fetch;
}

export function overlayFormats(config: Config, flags: SharedFlags): Config {
  const overlay: Config = { ...config };
  if (flags.formats !== undefined) {
    overlay.formats = parseFormats(flags.formats);
  }
  if (flags.out !== undefined) {
    overlay.outputDir = flags.out;
  }
  return mergeConfig(DEFAULT_CONFIG, overlay);
}

export function parseFormats(list: string): FormatId[] {
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

export function resolveThemes(flag: string | undefined, brandTheme: Brand["theme"]): Array<"dark" | "light"> {
  if (flag === "both") {
    return ["dark", "light"];
  }
  if (flag === "dark" || flag === "light") {
    return [flag];
  }
  return [brandTheme];
}

export async function resolveCopy(
  facts: Facts,
  config: Config,
  noCopy: boolean,
  fallback: Copy,
): Promise<{ copy: Copy; copyMode: "deterministic" | "llm"; warning?: string }> {
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

export async function loadLogos(cwd: string, brand: Brand): Promise<{ light?: Uint8Array; dark?: Uint8Array } | undefined> {
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

export function readShipsealVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(join(resolvePackageRoot(), "package.json"), "utf8"));
  if (typeof raw === "object" && raw !== null && "version" in raw && typeof raw.version === "string") {
    return raw.version;
  }
  return "0.0.0";
}

export function collectEnv(flags: SharedFlags): {
  skipNetwork: boolean;
  githubToken?: string;
  packagePath?: string;
  fetchImpl?: typeof fetch;
} {
  const skipNetwork = flags.dryRun === true && process.env.GITHUB_TOKEN === undefined;
  const out: ReturnType<typeof collectEnv> = { skipNetwork };
  if (process.env.GITHUB_TOKEN !== undefined) {
    out.githubToken = process.env.GITHUB_TOKEN;
  }
  if (flags.package !== undefined) {
    out.packagePath = flags.package;
  }
  if (flags.fetchImpl !== undefined) {
    out.fetchImpl = flags.fetchImpl;
  }
  return out;
}

export async function finishPack(input: {
  flags: SharedFlags;
  config: Config;
  event: ShipsealEvent;
  result: GenerateResult;
  brand: Brand;
  copy: Copy;
  copyMode: "deterministic" | "llm";
  copyWarning?: string;
  facts: Facts;
}): Promise<{
  dryRun: false;
  facts: Facts;
  copy: Copy;
  copyMode: "deterministic" | "llm";
  copyWarning?: string;
  dir: string;
  manifest: Manifest;
  warnings: GenerateResult["warnings"];
  exitCode: 0 | 1 | 2;
}> {
  const generatedAt = input.result.generatedAt;
  const written = await writePack({
    outDir: input.flags.out ?? input.config.outputDir ?? ".shipseal/output",
    eventId: eventId(input.event, generatedAt),
    result: input.result,
    event: input.event,
    brand: input.brand,
    shipsealVersion: readShipsealVersion(),
  });
  if (input.flags.upload === true && input.event.kind === "release") {
    const files = input.result.files.map((file) => join(written.dir, file.fileName));
    const uploadOpts: Parameters<typeof uploadReleaseAssets>[0] = { tag: input.event.tag, files };
    if (process.env.GITHUB_REPOSITORY !== undefined) {
      uploadOpts.repo = process.env.GITHUB_REPOSITORY;
    }
    if (process.env.GITHUB_TOKEN !== undefined) {
      uploadOpts.token = process.env.GITHUB_TOKEN;
    }
    await uploadReleaseAssets(uploadOpts);
  }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath.length > 0) {
    await appendJobSummary(summaryPath, written.manifest, written.dir);
  }
  const exitCode: 0 | 1 | 2 = input.flags.strict === true && input.result.warnings.length > 0 ? 2 : 0;
  const done: {
    dryRun: false;
    facts: Facts;
    copy: Copy;
    copyMode: "deterministic" | "llm";
    copyWarning?: string;
    dir: string;
    manifest: Manifest;
    warnings: GenerateResult["warnings"];
    exitCode: 0 | 1 | 2;
  } = {
    dryRun: false,
    facts: input.facts,
    copy: input.copy,
    copyMode: input.copyMode,
    dir: written.dir,
    manifest: written.manifest,
    warnings: input.result.warnings,
    exitCode,
  };
  if (input.copyWarning !== undefined) {
    done.copyWarning = input.copyWarning;
  }
  return done;
}
