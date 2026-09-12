// One pack builder shared by `shipseal preview`, `shipseal story` and the browser demo, so
// every surface renders the same bytes. Spec: docs/PROJECT_PLAN.md 25 (2026-09-13 decisions).

import { z } from "zod";
import { brandSchema, type Brand } from "../brand/schema.js";
import type { Config } from "../config/schema.js";
import { deterministicCopy } from "../copy/deterministic.js";
import { ShipsealError } from "../core/errors.js";
import { generate, type GenerateInput } from "../core/generate.js";
import { generateStory } from "../core/story.js";
import { fact } from "../facts/fact.js";
import type { Facts } from "../facts/schema.js";
import { V1_FORMAT_IDS, type FormatId } from "../formats.js";
import { carouselPdf, zipFiles } from "../outputs/downloads.js";
import { buildManifest } from "../outputs/manifest.js";
import type { RendererAdapter } from "../render/adapter.js";

/** Every format the `story-page` template declares, in the order the selector lists them. */
const STORY_FORMATS: FormatId[] = [
  "portrait",
  "square",
  "og",
  "github-social",
  "x",
  "linkedin",
  "producthunt",
];

const encodeJson = (value: unknown): Uint8Array =>
  new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

export const selectionSchema = z
  .object({
    pack: z.enum(["story", "release"]).default("story"),
    style: brandSchema.shape.style,
    theme: z.enum(["dark", "light"]),
    accent: brandSchema.shape.colors.shape.primary,
    headline: z.string().max(500).default(""),
    upgrade: z.string().max(4000).default(""),
    format: z
      .enum([...STORY_FORMATS, "all"])
      .default("portrait"),
  })
  .strict();
export type StudioSelection = z.infer<typeof selectionSchema>;

export function selectedConfig(config: Config, selection: StudioSelection): Config {
  const formats: FormatId[] =
    selection.format === "all"
      ? selection.pack === "story"
        ? [...STORY_FORMATS]
        : [...V1_FORMAT_IDS]
      : [selection.format];
  const landscape = new Set<string>(V1_FORMAT_IDS);
  if (selection.pack === "release" && formats.some((format) => !landscape.has(format))) {
    throw new ShipsealError(
      "preview.format",
      "The standard release templates do not support this format.",
      "Choose a landscape format or switch to a story pack.",
    );
  }
  return {
    ...config,
    formats,
    release: {
      ...config.release,
      headline: selection.headline || null,
      story: { ...config.release?.story, upgrade: selection.upgrade },
    },
    output: { imageFormat: "png" },
  };
}

export function selectedBrand(brand: Brand, selection: StudioSelection): Brand {
  // `theme` stays as stored: it is the native polarity of the palette, not the requested
  // render theme, which travels separately in GenerateInput.themes.
  return {
    ...brand,
    style: selection.style,
    colors: { ...brand.colors, primary: selection.accent },
  };
}

export async function buildStudioPack(input: {
  facts: Facts;
  brand: Brand;
  config: Config;
  selection: StudioSelection;
  renderer: RendererAdapter;
  version: string;
  generatedAt: string;
  logos?: GenerateInput["logos"];
  images?: GenerateInput["images"];
  brandSource?: string;
}) {
  const release = input.facts.release;
  if (release === undefined) {
    throw new ShipsealError(
      "preview.no-release",
      "No release is selected.",
      "Load a repository release first.",
    );
  }
  const config = selectedConfig(input.config, input.selection);
  const brand = selectedBrand(input.brand, input.selection);
  const facts: Facts = { ...input.facts, release: { ...release } };
  if (input.selection.headline) {
    facts.release = {
      ...release,
      headline: fact(input.selection.headline, {
        source: "user-config",
        ref: "release.headline",
        fetchedAt: input.generatedAt,
      }),
    };
  }

  const event = { kind: "release" as const, tag: release.tag.value };
  const request: GenerateInput = {
    event,
    facts,
    brand,
    config,
    copy: deterministicCopy(facts, config.release?.maxHighlights, brand.name),
    copyMode: "deterministic",
    renderer: input.renderer,
    themes: [input.selection.theme],
    generatedAt: input.generatedAt,
  };
  if (input.logos !== undefined) {
    request.logos = input.logos;
  }
  if (input.images !== undefined) {
    request.images = input.images;
  }

  const result = await (input.selection.pack === "story" ? generateStory : generate)(request);
  const manifest = buildManifest({ result, event, brand, shipsealVersion: input.version });
  manifest.brand.source = input.brandSource ?? ".shipseal/brand.json + preview selections";
  const downloads = result.files.map((file) => ({ name: file.fileName, bytes: file.bytes }));

  if (input.selection.pack === "story") {
    // The PDF pages are re-rendered as JPEG: a carousel embeds DCTDecode streams directly,
    // so the same layout is reused rather than reflowed.
    const pdfFormat = config.formats?.[0] ?? "portrait";
    const jpeg = await generateStory({
      ...request,
      config: { ...config, formats: [pdfFormat], output: { imageFormat: "jpeg" } },
    });
    const pdf = carouselPdf(jpeg.files);
    downloads.push({ name: "story.pdf", bytes: pdf });
    manifest.computed["story.pdf"] = {
      value: { format: pdfFormat, pages: jpeg.files.length, bytes: pdf.length },
      computedFrom: ["story"],
    };
  }

  downloads.push(
    { name: "brand.json", bytes: encodeJson(brand) },
    { name: "config.json", bytes: encodeJson(config) },
    { name: "manifest.json", bytes: encodeJson(manifest) },
  );
  return { result, manifest, downloads, archive: zipFiles(downloads), brand, config };
}
