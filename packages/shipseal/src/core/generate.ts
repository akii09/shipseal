// The pure pipeline: facts + copy + brand + templates -> rendered files (no network I/O)
// Spec: docs/PROJECT_PLAN.md §6.1

import { percentChange } from "../bench/percent.js";
import type { Brand } from "../brand/schema.js";
import type { Config } from "../config/schema.js";
import type { Copy } from "../copy/slots.js";
import type { ShipsealEvent } from "./events.js";
import type { Facts } from "../facts/schema.js";
import { fitText, type FittedText } from "../fit/fit-text.js";
import { FORMATS, type Format, type FormatId } from "../formats.js";
import type { ImageFormat, RenderOptions, RendererAdapter } from "../render/adapter.js";
import { emptyCodeLines } from "../templates/code-card.js";
import type { ManifestMissing, RenderContext, TemplateDefinition } from "../templates/contract.js";
import { highlightCode } from "../templates/highlight.js";
import { getTemplate } from "../templates/registry.js";

/**
 * Digest via WebCrypto, not `node:crypto`. The browser demo imports `generate()`, so nothing
 * in the pure core may reach for a Node builtin. Do not "simplify" this back to createHash.
 */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export interface GenerateInput {
  event: ShipsealEvent;
  facts: Facts;
  brand: Brand;
  config: Config;
  copy: Copy;
  copyMode: "deterministic" | "llm";
  renderer: RendererAdapter;
  themes: Array<"dark" | "light">;
  generatedAt: string;
  logos?: { light?: Uint8Array; dark?: Uint8Array };
  images?: Array<{ src: string; data: Uint8Array }>;
}

export interface GeneratedFile {
  fileName: string;
  template: string;
  format: FormatId;
  theme: "dark" | "light";
  width: number;
  height: number;
  bytes: Uint8Array;
  sha256: string;
}

export interface FitWarning {
  type: "fit-warning";
  template: string;
  format: FormatId;
  slot: string;
  action: "truncated";
}

export interface GenerateResult {
  files: GeneratedFile[];
  warnings: FitWarning[];
  missing: Array<ManifestMissing & { template: string }>;
  facts: Facts;
  copy: Copy;
  copyMode: "deterministic" | "llm";
  generatedAt: string;
  computed: Record<string, { value: unknown; computedFrom: string[] }>;
}

export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const templateIds = templateIdsFor(input.event, input.config);
  const formatIds = input.config.formats ?? ["og", "github-social", "x", "linkedin"];
  const imageFormat: ImageFormat = input.config.output?.imageFormat ?? "png";
  const attribution = input.config.attribution !== false;
  const files: GeneratedFile[] = [];
  const warnings: FitWarning[] = [];
  const missing: Array<ManifestMissing & { template: string }> = [];
  const recordedMissing = new Set<string>();
  const omitThemeSuffix = input.themes.length === 1;

  for (const templateId of templateIds) {
    const template = getTemplate(templateId);
    if (!template.events.includes(input.event.kind)) {
      continue;
    }
    for (const formatId of formatIds) {
      if (!template.formats.includes(formatId)) {
        continue;
      }
      const format = FORMATS[formatId];
      for (const theme of input.themes) {
        // Formats and themes render sequentially so fit warnings stay attached to the right file.
        // eslint-disable-next-line no-await-in-loop
        const copy = await copyForTemplate(template.id, input.copy, input.facts, theme);
        const built = template.buildProps(input.facts, copy, input.brand);
        const props = template.propsSchema.parse(built.props);
        if (!recordedMissing.has(template.id)) {
          recordedMissing.add(template.id);
          for (const item of built.missing) {
            missing.push({ template: template.id, fact: item.fact, effect: item.effect });
          }
        }
        // eslint-disable-next-line no-await-in-loop
        const { fitted, truncated } = await fitSlots(input.renderer, template, props, format);
        for (const slot of truncated) {
          warnings.push({
            type: "fit-warning",
            template: template.id,
            format: formatId,
            slot,
            action: "truncated",
          });
        }
        const logo = logoForTheme(input.logos, theme);
        const ctx: RenderContext = {
          format,
          theme,
          brand: input.brand,
          fitted,
          attribution,
        };
        if (logo !== undefined) {
          ctx.logoSrc = "shipseal-logo";
        }
        const jsx = template.render(props, ctx);
        // eslint-disable-next-line no-await-in-loop
        const node = await input.renderer.fromJsx(jsx);
        const renderOpts: RenderOptions = {
          width: format.width,
          height: format.height,
          format: imageFormat,
        };
        if (logo !== undefined) {
          renderOpts.images = [{ src: "shipseal-logo", data: logo }];
        }
        if (input.images !== undefined) {
          renderOpts.images = [...(renderOpts.images ?? []), ...input.images];
        }
        // eslint-disable-next-line no-await-in-loop
        const bytes = await input.renderer.render(node, renderOpts);
        const fileName = outputName(template.id, formatId, theme, omitThemeSuffix, imageFormat);
        // eslint-disable-next-line no-await-in-loop -- one digest per rendered file
        const sha256 = await sha256Hex(bytes);
        files.push({
          fileName,
          template: template.id,
          format: formatId,
          theme,
          width: format.width,
          height: format.height,
          bytes,
          sha256,
        });
      }
    }
  }

  return {
    files,
    warnings,
    missing,
    facts: input.facts,
    copy: input.copy,
    copyMode: input.copyMode,
    generatedAt: input.generatedAt,
    computed: computedFromFacts(input.facts),
  };
}

function templateIdsFor(event: ShipsealEvent, config: Config): string[] {
  if (event.kind === "milestone") {
    return ["milestone"];
  }
  if (event.kind === "bench") {
    return ["bench"];
  }
  return config.release?.templates ?? ["release-hero", "release-highlights", "code-card"];
}

function computedFromFacts(facts: Facts): Record<string, { value: unknown; computedFrom: string[] }> {
  const out: Record<string, { value: unknown; computedFrom: string[] }> = {};
  if (facts.bench === undefined) {
    return out;
  }
  facts.bench.metrics.forEach((metric, index) => {
    const change = percentChange(metric.before.value, metric.after.value, metric.better.value);
    const prefix = `bench.metrics[${String(index)}]`;
    out[`${prefix}.percent`] = {
      value: change.signed,
      computedFrom: [`${prefix}.before`, `${prefix}.after`, `${prefix}.better`],
    };
  });
  return out;
}

async function fitSlots(
  renderer: RendererAdapter,
  template: TemplateDefinition,
  props: unknown,
  format: Format,
): Promise<{ fitted: Record<string, FittedText>; truncated: string[] }> {
  const specs = template.slots(format);
  const texts = template.slotText(props);
  const fitted: Record<string, FittedText> = {};
  const truncated: string[] = [];
  for (const [slot, spec] of Object.entries(specs)) {
    const text = texts[slot];
    if (text === undefined) {
      continue;
    }
    const font = template.slotFont(props, slot);
    const fitFont: { family: string; lineHeight: number; weight: number; whiteSpace?: "normal" | "pre" } = {
      family: font.family,
      lineHeight: font.lineHeight,
      weight: font.weight,
    };
    if (font.whiteSpace !== undefined) {
      fitFont.whiteSpace = font.whiteSpace;
    }
    // eslint-disable-next-line no-await-in-loop -- sizes are sequential per slot spec
    const result = await fitText(renderer, text, spec, fitFont);
    fitted[slot] = result;
    if (result.truncated) {
      truncated.push(slot);
    }
  }
  return { fitted, truncated };
}

function outputName(
  template: string,
  format: FormatId,
  theme: "dark" | "light",
  omitTheme: boolean,
  imageFormat: string,
): string {
  const themePart = omitTheme ? "" : `-${theme}`;
  return `${template}-${format}${themePart}.${imageFormat}`;
}

function logoForTheme(
  logos: GenerateInput["logos"],
  theme: "dark" | "light",
): Uint8Array | undefined {
  if (logos === undefined) {
    return undefined;
  }
  if (theme === "dark") {
    return logos.dark ?? logos.light;
  }
  return logos.light ?? logos.dark;
}

async function copyForTemplate(
  templateId: string,
  copy: Copy,
  facts: Facts,
  theme: "dark" | "light",
): Promise<Copy> {
  if (templateId !== "code-card") {
    return copy;
  }
  const snippet = facts.release?.codeSnippet?.value;
  if (snippet === undefined) {
    return { ...copy, codeLines: emptyCodeLines() };
  }
  return { ...copy, codeLines: await highlightCode(snippet.code, snippet.lang, theme) };
}
