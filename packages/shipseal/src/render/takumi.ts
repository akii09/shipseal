// ONLY file allowed to import Takumi (Rule R4). Verify API first (spike S1)
// Spec: docs/PROJECT_PLAN.md §16
// Docs checked 2026-09-11: https://takumi.kane.tw/docs , /docs/measure-api, /docs/typography-and-fonts, /docs/helpers
//
// This file must stay free of `node:` imports. The browser demo (/try) imports the renderer
// through here, and one top-level Node builtin is enough for Vite to externalize the module,
// throw on load, and leave the page blank. Disk access lives in `takumi-node.ts`.

import { Renderer, type Node } from "takumi-js/node";
import { container, text as textNode } from "takumi-js/helpers";
import { fromJsx as takumiFromJsx } from "takumi-js/helpers/jsx";
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

/** Path of the vendored font, relative to the package root. Resolved in `takumi-node.ts`. */
export const FONT_REL = "assets/fonts/GeistMono[wght].ttf";

/** Both runtimes end here: one adapter, one registered font, whoever supplied the bytes. */
export async function createRendererWithFont(font: Uint8Array): Promise<RendererAdapter> {
  const renderer = new Renderer();
  await renderer.registerFont({
    name: GEIST_MONO_FAMILY,
    data: font,
    generic: "monospace",
  });
  return new TakumiRenderer(renderer);
}

/** The docs build aliases takumi-js/node to the WASM binding, keeping one adapter. */
export async function createBrowserTakumiRenderer(font: Uint8Array): Promise<RendererAdapter> {
  const { init } = await import("takumi-js/wasm/no-init");
  const { default: wasmUrl } = await import("takumi-js/wasm-url");
  await init({ module_or_path: wasmUrl });
  return createRendererWithFont(font);
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

  async fromJsx(element: unknown): Promise<LayoutNode> {
    const result = await takumiFromJsx(asReactElementLike(element));
    return pack(result.node, result.css);
  }

  async render(node: LayoutNode, opts: RenderOptions): Promise<Uint8Array> {
    const packed = unpack(node);
    const extras: { css: string[]; images?: RenderOptions["images"] } = {
      css: opts.css ?? packed.css,
    };
    if (opts.images !== undefined) {
      extras.images = opts.images;
    }
    const buffer = await renderWithFormat(this.renderer, packed.node, opts, extras);
    return Uint8Array.from(buffer);
  }

  async measure(node: LayoutNode, opts?: MeasureOptions): Promise<MeasureResult> {
    const packed = unpack(node);
    const measured = await this.renderer.measure(packed.node, measureOpts(opts));
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

function renderWithFormat(
  renderer: Renderer,
  node: Node,
  opts: RenderOptions,
  extras: { css: string[]; images?: RenderOptions["images"] },
): Promise<Buffer> {
  const width = opts.width;
  const height = opts.height;
  const css = extras.css;
  const images = extras.images;
  if (opts.format === "webp") {
    if (images !== undefined) {
      return renderer.render(node, { width, height, format: "webp", css, images });
    }
    return renderer.render(node, { width, height, format: "webp", css });
  }
  if (opts.format === "jpeg") {
    if (images !== undefined) {
      return renderer.render(node, { width, height, format: "jpeg", css, images });
    }
    return renderer.render(node, { width, height, format: "jpeg", css });
  }
  if (images !== undefined) {
    return renderer.render(node, { width, height, format: "png", css, images });
  }
  return renderer.render(node, { width, height, format: "png", css });
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
  return unpack(node).node;
}

type PackedLayout = { readonly __shipseal: true; node: Node; css: string[] };

function pack(node: Node, css: string[] = []): LayoutNode {
  const packed: PackedLayout = { __shipseal: true, node, css };
  return packed;
}

function unpack(node: LayoutNode): PackedLayout {
  if (isPacked(node)) {
    return node;
  }
  if (isTakumiNode(node)) {
    return { __shipseal: true, node, css: [] };
  }
  throw new ShipsealError(
    "render.invalid-node",
    "render/measure received a value that is not a Takumi node tree.",
    "Pass a node built by the renderer adapter (fromJsx, measureText, or testCardNode).",
  );
}

function isPacked(node: LayoutNode): node is PackedLayout {
  return typeof node === "object" && node !== null && "__shipseal" in node;
}

function isTakumiNode(node: LayoutNode): node is Node {
  return typeof node === "object" && node !== null && "type" in node;
}

function asReactElementLike(element: unknown): { type: unknown; props: unknown; key: string | null } {
  if (typeof element !== "object" || element === null || !("type" in element)) {
    throw new ShipsealError(
      "render.invalid-jsx",
      "fromJsx received a value that is not a JSX element.",
      "Return JSX from a template render function.",
    );
  }
  const record = element;
  const type = "type" in record ? record.type : undefined;
  const props = "props" in record ? record.props : null;
  const key = "key" in record && typeof record.key === "string" ? record.key : null;
  return { type, props, key };
}
