// ONLY file allowed to import Takumi (Rule R4). Verify API first (spike S1)
// Spec: docs/PROJECT_PLAN.md §16
// Docs checked 2026-09-11: https://takumi.kane.tw/docs , /docs/measure-api, /docs/typography-and-fonts, /docs/helpers

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Renderer, type Node } from "takumi-js/node";
import { container, text as textNode } from "takumi-js/helpers";
import { ShipsealError } from "../core/errors.js";
import type {
  LayoutNode,
  MeasureOptions,
  MeasureResult,
  MeasureTextOptions,
  RenderOptions,
  RendererAdapter,
} from "./adapter.js";

export const GEIST_MONO_FAMILY = "Geist Mono";
const FONT_REL = join("assets", "fonts", "GeistMono[wght].ttf");

let shared: Promise<RendererAdapter> | undefined;

export function getTakumiRenderer(): Promise<RendererAdapter> {
  shared ??= createTakumiRenderer();
  return shared;
}

export async function createTakumiRenderer(): Promise<RendererAdapter> {
  const renderer = new Renderer();
  const fontPath = join(resolvePackageRoot(), FONT_REL);
  const data = await readFile(fontPath);
  await renderer.registerFont({
    name: GEIST_MONO_FAMILY,
    data,
    generic: "monospace",
  });
  return new TakumiRenderer(renderer);
}

export function resolvePackageRoot(from = import.meta.url): string {
  let dir = dirname(fileURLToPath(from));
  for (;;) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, FONT_REL))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new ShipsealError(
        "render.font-missing",
        `Could not find vendored font ${FONT_REL}.`,
        "Reinstall shipseal so assets/fonts/GeistMono[wght].ttf is present next to package.json.",
      );
    }
    dir = parent;
  }
}

export interface LineCountNode {
  runs: ReadonlyArray<{ y: number }>;
  children: readonly LineCountNode[];
}

export function countLines(node: LineCountNode): number {
  const ys = new Set<number>();
  const walk = (current: LineCountNode): void => {
    for (const run of current.runs) {
      ys.add(Math.round(run.y));
    }
    for (const child of current.children) {
      walk(child);
    }
  };
  walk(node);
  return ys.size;
}

export function testCardNode(): LayoutNode {
  return container({
    style: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      padding: 64,
      backgroundColor: "#0b0b0c",
    },
    children: [
      textNode("Shipseal", {
        fontFamily: "Geist",
        fontSize: 72,
        fontWeight: 700,
        color: "#fafafa",
      }),
      textNode("Every release, sealed and ready to share", {
        fontFamily: GEIST_MONO_FAMILY,
        fontSize: 28,
        fontWeight: 400,
        color: "#a1a1aa",
      }),
    ],
  });
}

class TakumiRenderer implements RendererAdapter {
  constructor(private readonly renderer: Renderer) {}

  async render(node: LayoutNode, opts: RenderOptions): Promise<Uint8Array> {
    const buffer = await this.renderer.render(asNode(node), {
      width: opts.width,
      height: opts.height,
      format: opts.format,
    });
    return Uint8Array.from(buffer);
  }

  async measure(node: LayoutNode, opts?: MeasureOptions): Promise<MeasureResult> {
    const measured = await this.renderer.measure(asNode(node), measureOpts(opts));
    return {
      lines: countLines(measured),
      width: measured.width,
      height: measured.height,
    };
  }

  async measureText(value: string, opts: MeasureTextOptions): Promise<MeasureResult> {
    const measured = await this.renderer.measure(asNode(textMeasureNode(value, opts)));
    return {
      lines: countLines(measured),
      width: measured.width,
      height: measured.height,
    };
  }
}

function measureOpts(opts?: MeasureOptions): { width?: number; height?: number } {
  const out: { width?: number; height?: number } = {};
  if (opts?.width !== undefined) {
    out.width = opts.width;
  }
  if (opts?.height !== undefined) {
    out.height = opts.height;
  }
  return out;
}

function textMeasureNode(value: string, opts: MeasureTextOptions): LayoutNode {
  const style: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    whiteSpace: "normal" | "pre";
    maxWidth: number;
    fontWeight?: number;
  } = {
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    lineHeight: opts.lineHeight,
    whiteSpace: opts.whiteSpace ?? "normal",
    maxWidth: opts.maxWidth,
  };
  if (opts.fontWeight !== undefined) {
    style.fontWeight = opts.fontWeight;
  }
  return textNode(value, style);
}

function asNode(node: LayoutNode): Node {
  if (!isTakumiNode(node)) {
    throw new ShipsealError(
      "render.invalid-node",
      "render/measure received a value that is not a Takumi node tree.",
      "Pass a node built by the renderer adapter (measureText or testCardNode).",
    );
  }
  return node;
}

function isTakumiNode(node: LayoutNode): node is Node {
  return typeof node === "object" && node !== null && "type" in node;
}
