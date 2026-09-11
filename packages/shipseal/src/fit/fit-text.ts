// Text fitting: shrink, then retry/truncate + manifest warning
// Spec: docs/PROJECT_PLAN.md §15

import type { MeasureTextOptions, RendererAdapter } from "../render/adapter.js";

export interface TextSlotSpec {
  maxLines: number;
  maxFontSize: number;
  minFontSize: number;
  step: number;
  box: { width: number };
}

export interface FittedText {
  fontSize: number;
  text: string;
  lines: number;
  truncated: boolean;
}

export interface FitFont {
  family: string;
  lineHeight: number;
  weight?: number;
  whiteSpace?: "normal" | "pre";
}

export async function fitText(
  renderer: Pick<RendererAdapter, "measureText">,
  text: string,
  spec: TextSlotSpec,
  font: FitFont,
): Promise<FittedText> {
  const sizes = fontSizes(spec);
  for (const fontSize of sizes) {
    // Sizes must be tried largest-first; the first fit wins.
    // eslint-disable-next-line no-await-in-loop -- sequential by spec §15.2
    const measured = await renderer.measureText(text, measureOpts(spec, font, fontSize));
    if (measured.lines <= spec.maxLines) {
      return { fontSize, text, lines: measured.lines, truncated: false };
    }
  }

  const fontSize = spec.minFontSize;
  const truncated = await truncateToFit(renderer, text, spec, font, fontSize);
  const measured = await renderer.measureText(truncated, measureOpts(spec, font, fontSize));
  return { fontSize, text: truncated, lines: measured.lines, truncated: truncated !== text };
}

function fontSizes(spec: TextSlotSpec): number[] {
  const sizes: number[] = [];
  for (let size = spec.maxFontSize; size >= spec.minFontSize; size -= spec.step) {
    sizes.push(size);
  }
  const last = sizes[sizes.length - 1];
  if (last !== spec.minFontSize) {
    sizes.push(spec.minFontSize);
  }
  return sizes;
}

function measureOpts(spec: TextSlotSpec, font: FitFont, fontSize: number): MeasureTextOptions {
  const opts: MeasureTextOptions = {
    fontFamily: font.family,
    fontSize,
    maxWidth: spec.box.width,
    lineHeight: font.lineHeight,
  };
  if (font.weight !== undefined) {
    opts.fontWeight = font.weight;
  }
  if (font.whiteSpace !== undefined) {
    opts.whiteSpace = font.whiteSpace;
  }
  return opts;
}

async function truncateToFit(
  renderer: Pick<RendererAdapter, "measureText">,
  text: string,
  spec: TextSlotSpec,
  font: FitFont,
  fontSize: number,
): Promise<string> {
  const words = text.trim().length === 0 ? [] : text.trim().split(/\s+/);
  if (words.length === 0) {
    return text;
  }

  const fits = async (candidate: string): Promise<boolean> => {
    const measured = await renderer.measureText(
      candidate,
      measureOpts(spec, font, fontSize),
    );
    return measured.lines <= spec.maxLines;
  };

  for (let count = words.length - 1; count >= 1; count -= 1) {
    const candidate = `${words.slice(0, count).join(" ")}...`;
    // eslint-disable-next-line no-await-in-loop -- drop words until the truncated text fits
    if (await fits(candidate)) {
      return candidate;
    }
  }

  const first = words[0];
  if (first === undefined) {
    return "...";
  }
  for (let length = first.length; length >= 1; length -= 1) {
    const candidate = `${first.slice(0, length)}...`;
    // eslint-disable-next-line no-await-in-loop -- hard-cut the first word as a last resort
    if (await fits(candidate)) {
      return candidate;
    }
  }
  return "...";
}
