// bench: before/after cards from bench JSON
// Spec: docs/PROJECT_PLAN.md §18.4

import { loadBrand } from "../brand/load.js";
import { loadConfig } from "../config/load.js";
import { benchCopy } from "../copy/deterministic.js";
import { generate } from "../core/generate.js";
import type { ShipsealEvent } from "../core/events.js";
import { collectFacts } from "../sources/collect.js";
import { createTakumiRenderer } from "../render/takumi-node.js";
import {
  collectEnv,
  finishPack,
  loadLogos,
  overlayFormats,
  resolveCopy,
  resolveThemes,
  type SharedFlags,
} from "./shared.js";

export interface BenchFlags extends SharedFlags {
  file?: string;
}

export interface BenchResult {
  dryRun: boolean;
  facts: Awaited<ReturnType<typeof collectFacts>>;
  copy: import("../copy/slots.js").Copy;
  copyMode: "deterministic" | "llm";
  copyWarning?: string;
  dir?: string;
  manifest?: import("../outputs/manifest.js").Manifest;
  warnings: import("../core/generate.js").GenerateResult["warnings"];
  exitCode: 0 | 1 | 2;
}

export async function runBench(flags: BenchFlags): Promise<BenchResult> {
  const cwd = flags.cwd;
  const config = overlayFormats(await loadConfig(cwd), flags);
  const brand = await loadBrand(cwd);
  const file = flags.file ?? config.bench?.file ?? ".shipseal/bench.json";
  const event: ShipsealEvent = { kind: "bench", file };
  const env = collectEnv(flags);
  const collectOpts: Parameters<typeof collectFacts>[0] = {
    cwd,
    event,
    skipNetwork: true,
    benchFile: file,
  };
  if (env.packagePath !== undefined) {
    collectOpts.packagePath = env.packagePath;
  }
  const facts = await collectFacts(collectOpts);
  const resolved = await resolveCopy(facts, config, flags.copy === false, benchCopy(facts));

  if (flags.dryRun === true) {
    const dry: BenchResult = {
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
  const packInput: Parameters<typeof finishPack>[0] = {
    flags,
    config,
    event,
    result,
    brand,
    copy: resolved.copy,
    copyMode: resolved.copyMode,
    facts,
  };
  if (resolved.warning !== undefined) {
    packInput.copyWarning = resolved.warning;
  }
  return finishPack(packInput);
}
