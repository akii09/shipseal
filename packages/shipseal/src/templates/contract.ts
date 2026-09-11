// TemplateDefinition + TextSlotSpec types
// Spec: docs/PROJECT_PLAN.md §14.1

import type { z } from "zod";
import type { Brand } from "../brand/schema.js";
import type { Copy } from "../copy/slots.js";
import type { ShipsealEvent } from "../core/events.js";
import type { Facts } from "../facts/schema.js";
import type { FittedText, TextSlotSpec } from "../fit/fit-text.js";
import type { Format, FormatId } from "../formats.js";
import type { JsxElement } from "../takumi-jsx/jsx-runtime.js";

export interface RenderContext {
  format: Format;
  theme: "dark" | "light";
  brand: Brand;
  fitted: Record<string, FittedText>;
  attribution: boolean;
  logoSrc?: string;
}

export interface ManifestMissing {
  fact: string;
  effect: string;
}

export interface TemplateDefinition {
  id: string;
  events: ShipsealEvent["kind"][];
  formats: FormatId[];
  propsSchema: z.ZodType<unknown>;
  slots: (format: Format) => Record<string, TextSlotSpec>;
  slotText: (props: unknown) => Record<string, string>;
  slotFont: (
    props: unknown,
    slot: string,
  ) => { family: string; weight: number; lineHeight: number; whiteSpace?: "normal" | "pre" };
  buildProps(facts: Facts, copy: Copy, brand: Brand): { props: unknown; missing: ManifestMissing[] };
  render(props: unknown, ctx: RenderContext): JsxElement;
}
