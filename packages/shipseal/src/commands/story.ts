// `shipseal story`: an ordered release story as images, a PDF carousel and a ZIP.
// Spec: docs/PROJECT_PLAN.md 25 (2026-09-13 decisions).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadBrand } from "../brand/load.js";
import { loadConfig } from "../config/load.js";
import type { Config } from "../config/schema.js";
import { ShipsealError } from "../core/errors.js";
import type { GenerateInput } from "../core/generate.js";
import { createTakumiRenderer } from "../render/takumi.js";
import { buildStudioPack, selectionSchema } from "../studio/pack.js";
import { collectFacts } from "../sources/collect.js";
import { gitCurrentTag } from "../sources/git.js";
import { loadLogos, readShipsealVersion } from "./shared.js";

const STORY_IMAGE_LABELS = ["before", "after"] as const;
const MAX_STORY_IMAGE_BYTES = 5_000_000;

type StoryImage = NonNullable<GenerateInput["images"]>[number];

/**
 * Screenshots are supplied by the maintainer, never generated or captured here: no headless
 * browser is a hard rule (AGENTS.md rule 2).
 */
async function readStoryImage(cwd: string, label: string, path: string): Promise<StoryImage> {
  let data: Uint8Array;
  try {
    data = await readFile(resolve(cwd, path));
  } catch (error) {
    throw new ShipsealError(
      "story.image-missing",
      `Could not read the ${label} screenshot: ${path}.`,
      "Set release.story.before and release.story.after to existing PNG or JPEG files.",
      { cause: error },
    );
  }
  const png = data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71;
  const jpeg = data[0] === 255 && data[1] === 216;
  if ((!png && !jpeg) || data.length > MAX_STORY_IMAGE_BYTES) {
    throw new ShipsealError(
      "story.image-invalid",
      `The ${label} screenshot is not a supported image or exceeds the size limit.`,
      "Use a PNG or JPEG smaller than 5 MB.",
    );
  }
  return { src: `story-${label}`, data };
}

export async function loadStoryImages(cwd: string, config: Config): Promise<StoryImage[]> {
  const configured = STORY_IMAGE_LABELS.flatMap((label) => {
    const path = config.release?.story?.[label];
    return path === undefined ? [] : [{ label, path }];
  });
  return Promise.all(configured.map((image) => readStoryImage(cwd, image.label, image.path)));
}

export interface StoryFlags {
  cwd: string;
  tag?: string;
  format?: string;
  style?: string;
  theme?: string;
  headline?: string;
  out?: string;
  strict?: boolean;
  package?: string;
}

export async function runStory(flags: StoryFlags) {
  const brand = await loadBrand(flags.cwd);
  const config = await loadConfig(flags.cwd);
  const tag = flags.tag ?? (await gitCurrentTag(flags.cwd));
  if (tag === undefined) {
    throw new ShipsealError(
      "story.no-tag",
      "No release tag was found.",
      "Pass --tag with an existing release tag.",
    );
  }
  // safeParse, not parse: a bad --style or --format is user input at the CLI boundary and
  // has to come back as a typed error, not a raw zod issue dump.
  const parsed = selectionSchema.safeParse({
    pack: "story",
    style: flags.style ?? brand.style,
    theme: flags.theme ?? brand.theme,
    accent: brand.colors.primary ?? "#ff4d4d",
    headline: flags.headline ?? config.release?.headline ?? "",
    upgrade: config.release?.story?.upgrade ?? "",
    format: flags.format ?? "portrait",
  });
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new ShipsealError(
      "story.bad-options",
      `These story options are not valid: ${fields.join(", ")}.`,
      "Use --format portrait, square, og, github-social, x, linkedin, producthunt or all; --style minimal, editorial or terminal; --theme dark or light.",
      { cause: parsed.error },
    );
  }
  const selection = parsed.data;

  const collectOptions: Parameters<typeof collectFacts>[0] = {
    cwd: flags.cwd,
    event: { kind: "release", tag },
    skipNetwork: true,
  };
  if (flags.package !== undefined) {
    collectOptions.packagePath = flags.package;
  }
  if (config.release?.changelogPath !== undefined) {
    collectOptions.changelogPath = config.release.changelogPath;
  }
  if (config.release?.snippet !== undefined) {
    collectOptions.snippet = config.release.snippet;
  }
  const facts = await collectFacts(collectOptions);

  const input: Parameters<typeof buildStudioPack>[0] = {
    facts,
    brand,
    config,
    selection,
    renderer: await createTakumiRenderer(),
    version: readShipsealVersion(),
    generatedAt: new Date().toISOString(),
    images: await loadStoryImages(flags.cwd, config),
    brandSource: ".shipseal/brand.json + story flags",
  };
  const logos = await loadLogos(flags.cwd, brand);
  if (logos !== undefined) {
    input.logos = logos;
  }
  const pack = await buildStudioPack(input);

  const dir = resolve(
    flags.cwd,
    flags.out ?? config.outputDir ?? ".shipseal/output",
    `story-${tag.replaceAll(/[^a-zA-Z0-9_.-]/g, "-")}`,
  );
  await mkdir(dir, { recursive: true });
  await Promise.all(pack.downloads.map((file) => writeFile(join(dir, file.name), file.bytes)));
  await writeFile(join(dir, "story.zip"), pack.archive);
  return {
    dir,
    manifest: pack.manifest,
    exitCode: flags.strict === true && pack.manifest.warnings.length > 0 ? 2 : 0,
  };
}
