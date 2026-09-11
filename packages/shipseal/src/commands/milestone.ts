// milestone: card for highest crossed threshold
// Spec: docs/PROJECT_PLAN.md §18.3

import { loadBrand } from "../brand/load.js";
import { loadConfig } from "../config/load.js";
import type { Config } from "../config/schema.js";
import { milestoneCopy } from "../copy/deterministic.js";
import { generate } from "../core/generate.js";
import type { ShipsealEvent } from "../core/events.js";
import { ShipsealError } from "../core/errors.js";
import { fact } from "../facts/fact.js";
import type { Facts } from "../facts/schema.js";
import { createTakumiRenderer } from "../render/takumi.js";
import { collectFacts } from "../sources/collect.js";
import {
  collectEnv,
  finishPack,
  loadLogos,
  overlayFormats,
  resolveCopy,
  resolveThemes,
  type SharedFlags,
} from "./shared.js";

export type MilestoneMetric = "stars" | "downloads" | "contributors";

export interface MilestoneFlags extends SharedFlags {
  metric?: string;
  threshold?: string;
}

export interface MilestoneResult {
  dryRun: boolean;
  skipped: boolean;
  message?: string;
  facts: Facts;
  copy?: import("../copy/slots.js").Copy;
  copyMode?: "deterministic" | "llm";
  copyWarning?: string;
  dir?: string;
  manifest?: import("../outputs/manifest.js").Manifest;
  warnings: import("../core/generate.js").GenerateResult["warnings"];
  exitCode: 0 | 1 | 2;
}

export async function runMilestone(flags: MilestoneFlags): Promise<MilestoneResult> {
  const cwd = flags.cwd;
  const config = overlayFormats(await loadConfig(cwd), flags);
  const brand = await loadBrand(cwd);
  const placeholder: ShipsealEvent = { kind: "milestone", metric: "stars", threshold: 0 };
  const env = collectEnv(flags);
  const collectOpts: Parameters<typeof collectFacts>[0] = {
    cwd,
    event: placeholder,
    skipNetwork: env.skipNetwork,
  };
  if (env.packagePath !== undefined) {
    collectOpts.packagePath = env.packagePath;
  }
  if (env.githubToken !== undefined) {
    collectOpts.githubToken = env.githubToken;
  }
  if (env.fetchImpl !== undefined) {
    collectOpts.fetchImpl = env.fetchImpl;
  }
  const collected = await collectFacts(collectOpts);
  const selected = selectMilestone(collected, config, parseMetric(flags.metric), parseThreshold(flags.threshold));
  if (selected === undefined) {
    return {
      dryRun: flags.dryRun === true,
      skipped: true,
      message: "No milestone threshold crossed. Nothing to generate.",
      facts: collected,
      warnings: [],
      exitCode: 0,
    };
  }

  const fetchedAt = new Date().toISOString();
  const metricKey = selected.metric === "downloads" ? "downloads" : selected.metric;
  const facts: Facts = {
    ...collected,
    milestone: {
      metric: fact(selected.metric, { source: "user-config", ref: "shipseal milestone --metric", fetchedAt }),
      threshold: fact(selected.threshold, {
        source: "user-config",
        ref: `config.json milestones.${metricKey}`,
        fetchedAt,
      }),
    },
  };
  const event: ShipsealEvent = { kind: "milestone", metric: selected.metric, threshold: selected.threshold };
  const fallback = milestoneCopy(facts, selected.metric, selected.threshold);
  const resolved = await resolveCopy(facts, config, flags.copy === false, fallback);

  if (flags.dryRun === true) {
    const dry: MilestoneResult = {
      dryRun: true,
      skipped: false,
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
  const packed = await finishPack(packInput);
  return { ...packed, skipped: false };
}

export function highestCrossed(thresholds: number[], current: number): number | undefined {
  const crossed = thresholds.filter((item) => current >= item).toSorted((a, b) => b - a);
  return crossed[0];
}

export function selectMilestone(
  facts: Facts,
  config: Config,
  metric: MilestoneMetric | undefined,
  threshold: number | undefined,
): { metric: MilestoneMetric; threshold: number } | undefined {
  const metrics: MilestoneMetric[] = metric === undefined ? ["stars", "downloads", "contributors"] : [metric];
  const candidates: Array<{ metric: MilestoneMetric; threshold: number }> = [];
  for (const item of metrics) {
    const current = currentValue(facts, item);
    if (current === undefined) {
      if (metric !== undefined) {
        throw missingMetric(item);
      }
      continue;
    }
    const list = thresholdsFor(config, item);
    if (threshold !== undefined) {
      if (metric !== undefined || list.includes(threshold)) {
        return { metric: item, threshold };
      }
      continue;
    }
    const crossed = highestCrossed(list, current);
    if (crossed !== undefined) {
      candidates.push({ metric: item, threshold: crossed });
    }
  }
  return candidates.toSorted(
    (a, b) => b.threshold - a.threshold || metrics.indexOf(a.metric) - metrics.indexOf(b.metric),
  )[0];
}

function currentValue(facts: Facts, metric: MilestoneMetric): number | undefined {
  if (metric === "stars") {
    return facts.metrics?.stars?.value;
  }
  if (metric === "downloads") {
    return facts.metrics?.weeklyDownloads?.value;
  }
  return facts.metrics?.contributorCount?.value;
}

function thresholdsFor(config: Config, metric: MilestoneMetric): number[] {
  if (metric === "stars") {
    return config.milestones?.stars ?? [];
  }
  if (metric === "downloads") {
    return config.milestones?.downloads ?? [];
  }
  return config.milestones?.contributors ?? [];
}

function parseMetric(value: string | undefined): MilestoneMetric | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "stars" || value === "downloads" || value === "contributors") {
    return value;
  }
  throw new ShipsealError(
    "milestone.bad-metric",
    `Unknown metric "${value}".`,
    "Use --metric stars, --metric downloads, or --metric contributors.",
  );
}

function parseThreshold(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ShipsealError(
      "milestone.bad-threshold",
      `Invalid threshold "${value}".`,
      "Pass a positive integer, for example --threshold 1000.",
    );
  }
  return parsed;
}

function missingMetric(metric: MilestoneMetric): ShipsealError {
  if (metric === "stars") {
    return new ShipsealError(
      "milestone.missing-stars",
      "Could not read GitHub stars for this repo.",
      "Set GITHUB_TOKEN, or confirm package.json repository points at a public GitHub repo.",
    );
  }
  if (metric === "downloads") {
    return new ShipsealError(
      "milestone.missing-downloads",
      "Could not read npm weekly downloads for this package.",
      "Confirm package.json name is published on npm, then retry without --dry-run.",
    );
  }
  return new ShipsealError(
    "milestone.missing-contributors",
    "Could not read the GitHub contributor count for this repo.",
    "Set GITHUB_TOKEN, or confirm package.json repository points at a public GitHub repo.",
  );
}
