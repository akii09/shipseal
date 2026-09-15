// release: generate the release pack
// Spec: docs/PROJECT_PLAN.md §18.2

import { loadBrand } from "../brand/load.js";
import { loadConfig, mergeConfig } from "../config/load.js";
import { DEFAULT_CONFIG, type Config } from "../config/schema.js";
import { deterministicCopy } from "../copy/deterministic.js";
import { generate } from "../core/generate.js";
import type { ShipsealEvent } from "../core/events.js";
import { ShipsealError } from "../core/errors.js";
import { createTakumiRenderer } from "../render/takumi-node.js";
import { collectFacts } from "../sources/collect.js";
import { gitCurrentTag } from "../sources/git.js";
import {
  collectEnv,
  finishPack,
  loadLogos,
  overlayFormats,
  resolveCopy,
  resolveThemes,
  type SharedFlags,
} from "./shared.js";

export interface ReleaseFlags extends SharedFlags {
  tag?: string;
  from?: string;
  templates?: string;
  headline?: string;
  subheadline?: string;
}

/** Lowest kind worth announcing, most significant first. */
const ANNOUNCE_ORDER = ["major", "minor", "patch"] as const;

export interface ReleaseResult {
  dryRun: boolean;
  skipped?: boolean;
  message?: string;
  facts: Awaited<ReturnType<typeof collectFacts>>;
  copy: import("../copy/slots.js").Copy;
  copyMode: "deterministic" | "llm";
  copyWarning?: string;
  dir?: string;
  manifest?: import("../outputs/manifest.js").Manifest;
  warnings: import("../core/generate.js").GenerateResult["warnings"];
  exitCode: 0 | 1 | 2;
}

export async function runRelease(flags: ReleaseFlags): Promise<ReleaseResult> {
  const cwd = flags.cwd;
  const config = overlayReleaseConfig(await loadConfig(cwd), flags);
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

  const env = collectEnv(flags);
  const collectOpts: Parameters<typeof collectFacts>[0] = {
    cwd,
    event,
    skipNetwork: env.skipNetwork,
  };
  if (env.packagePath !== undefined) {
    collectOpts.packagePath = env.packagePath;
  }
  if (config.release?.changelogPath !== undefined) {
    collectOpts.changelogPath = config.release.changelogPath;
  }
  if (config.release?.snippet !== undefined) {
    collectOpts.snippet = config.release.snippet;
  }
  if (env.githubToken !== undefined) {
    collectOpts.githubToken = env.githubToken;
  }
  if (env.fetchImpl !== undefined) {
    collectOpts.fetchImpl = env.fetchImpl;
  }
  const headline = flags.headline ?? config.release?.headline ?? undefined;
  if (headline !== undefined) {
    collectOpts.headline = headline;
  }
  const subheadline = flags.subheadline ?? config.release?.subheadline ?? undefined;
  if (subheadline !== undefined) {
    collectOpts.subheadline = subheadline;
  }
  const facts = await collectFacts(collectOpts);

  // Below the configured threshold there is nothing worth posting. Reported the same way
  // `milestone` reports an uncrossed threshold: exit 0, `skipped` true, and say why.
  const announce = config.release?.announce ?? "patch";
  const kind = facts.release?.kind?.value;
  if (kind !== undefined && ANNOUNCE_ORDER.indexOf(kind) > ANNOUNCE_ORDER.indexOf(announce)) {
    return {
      dryRun: flags.dryRun === true,
      skipped: true,
      message: `This is a ${kind} release and release.announce is "${announce}". Nothing to generate.`,
      facts,
      copy: deterministicCopy(facts, config.release?.maxHighlights, brand.name),
      copyMode: "deterministic",
      warnings: [],
      exitCode: 0,
    };
  }

  const noCopy = flags.copy === false;
  const resolved = await resolveCopy(facts, config, noCopy, deterministicCopy(facts, config.release?.maxHighlights, brand.name));

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

function overlayReleaseConfig(config: Config, flags: ReleaseFlags): Config {
  const overlay = overlayFormats(config, flags);
  if (flags.templates === undefined) {
    return overlay;
  }
  return mergeConfig(DEFAULT_CONFIG, {
    ...overlay,
    release: {
      ...overlay.release,
      templates: flags.templates
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    },
  });
}
