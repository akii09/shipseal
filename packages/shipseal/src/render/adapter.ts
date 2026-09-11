// RendererAdapter interface
// Spec: docs/PROJECT_PLAN.md §16.1

/** Opaque Takumi node tree. Built only inside src/render/takumi.ts. */
export type LayoutNode = object;

export type ImageFormat = "png" | "webp" | "jpeg";

export interface RenderOptions {
  width: number;
  height: number;
  format: ImageFormat;
  css?: string[];
  images?: Array<{ src: string; data: Uint8Array }>;
}

export interface MeasureOptions {
  width?: number;
  height?: number;
}

export interface MeasureResult {
  lines: number;
  width: number;
  height: number;
}

export interface MeasureTextOptions {
  fontFamily: string;
  fontSize: number;
  maxWidth: number;
  lineHeight: number;
  fontWeight?: number;
  whiteSpace?: "normal" | "pre";
}

export interface RendererAdapter {
  render(node: LayoutNode, opts: RenderOptions): Promise<Uint8Array>;
  measure(node: LayoutNode, opts?: MeasureOptions): Promise<MeasureResult>;
  measureText(text: string, opts: MeasureTextOptions): Promise<MeasureResult>;
  fromJsx(element: unknown): Promise<LayoutNode>;
}
