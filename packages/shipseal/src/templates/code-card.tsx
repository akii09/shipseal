// Template: syntax-highlighted snippet
// Spec: docs/PROJECT_PLAN.md §14.3

import { z } from "zod";
import type { Brand } from "../brand/schema.js";
import type { CodeLine, Copy } from "../copy/slots.js";
import type { Facts } from "../facts/schema.js";
import type { Format } from "../formats.js";
import type { TemplateDefinition } from "./contract.js";
import { themeColors } from "./theme.js";

/** Advance width of a monospace glyph as a fraction of the font size. */
const MONO_ADVANCE = 0.6;

const propsSchema = z.object({
  headline: z.string(),
  headingFamily: z.string(),
  monoFamily: z.string(),
  headingWeight: z.number(),
  monoWeight: z.number(),
  radius: z.number(),
  lines: z.array(z.array(z.object({ text: z.string(), color: z.string() }))),
});

export type CodeCardProps = z.infer<typeof propsSchema>;

export const codeCard: TemplateDefinition = {
  id: "code-card",
  events: ["release"],
  formats: ["x", "linkedin"],
  propsSchema,
  slots(format: Format) {
    const width = format.width - 2 * format.safeZone;
    return {
      headline: { maxLines: 1, maxFontSize: 40, minFontSize: 28, step: 2, box: { width } },
    };
  },
  slotText(raw) {
    const props = propsSchema.parse(raw);
    return { headline: props.headline };
  },
  slotFont(raw, slot) {
    const props = propsSchema.parse(raw);
    if (slot === "headline") {
      return { family: props.headingFamily, weight: props.headingWeight, lineHeight: 1.1 };
    }
    return { family: props.monoFamily, weight: props.monoWeight, lineHeight: 1.35, whiteSpace: "pre" };
  },
  buildProps(facts: Facts, copy: Copy, brand: Brand) {
    const missing = [];
    const lines = copy.codeLines ?? [];
    if (lines.length === 0) {
      missing.push({ fact: "release.codeSnippet", effect: "code card uses empty snippet" });
    }
    return {
      props: {
        headline: copy.codeTitle ?? copy.headline,
        headingFamily: brand.fonts.heading.family,
        monoFamily: brand.fonts.mono.family,
        headingWeight: brand.fonts.heading.weight,
        monoWeight: brand.fonts.mono.weight,
        radius: brand.radius,
        lines,
      },
      missing,
    };
  },
  render(raw, ctx) {
    const props = propsSchema.parse(raw);
    const colors = themeColors(ctx.brand, ctx.theme);
    const pad = ctx.format.safeZone;
    const headline = ctx.fitted.headline;

    // Size the type to the snippet rather than the card. A fixed 22px in a box with flexGrow
    // drew a 14-line frame around a 2-line snippet, leaving most of the card empty with small
    // text on it. Mono glyphs are a constant fraction of the em, so the widest line and the
    // line count give a size directly, with no measurement pass.
    const boxPad = 28;
    const lineHeight = 1.35;
    const lines = props.lines.length === 0 ? 1 : props.lines.length;
    const longest = Math.max(
      1,
      ...props.lines.map((line) => line.reduce((total, token) => total + token.text.length, 0)),
    );
    const headlineHeight = (headline?.fontSize ?? 36) * 1.25;
    const attributionHeight = ctx.attribution ? 18 * 1.4 + 24 : 0;
    const innerWidth = ctx.format.width - 2 * pad - 2 * boxPad;
    const innerHeight =
      ctx.format.height - 2 * pad - headlineHeight - 24 - attributionHeight - 2 * boxPad;
    const codeSize = Math.max(
      18,
      Math.min(44, Math.floor(Math.min(innerWidth / (longest * MONO_ADVANCE), innerHeight / (lines * lineHeight)))),
    );

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: colors.background,
          padding: pad,
          gap: 24,
        }}
      >
        <div
          style={{
            fontFamily: props.headingFamily,
            fontWeight: props.headingWeight,
            fontSize: headline?.fontSize ?? 36,
            color: colors.foreground,
          }}
        >
          {headline?.text ?? props.headline}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
          }}
        >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            backgroundColor: colors.card,
            borderRadius: props.radius,
            padding: boxPad,
            gap: 0,
          }}
        >
          {props.lines.map((line, lineIndex) => (
            <div
              key={String(lineIndex)}
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
              }}
            >
              {line.map((token, tokenIndex) => (
                <div
                  key={`${String(lineIndex)}-${String(tokenIndex)}`}
                  style={{
                    fontFamily: props.monoFamily,
                    fontWeight: props.monoWeight,
                    fontSize: codeSize,
                    color: token.color,
                    whiteSpace: "pre",
                    lineHeight,
                  }}
                >
                  {token.text}
                </div>
              ))}
            </div>
          ))}
        </div>
        </div>
        {ctx.attribution ? (
          <div
            style={{
              fontFamily: props.headingFamily,
              fontWeight: 400,
              fontSize: 18,
              color: colors.muted,
            }}
          >
            made with shipseal.dev
          </div>
        ) : undefined}
      </div>
    );
  },
};

export function emptyCodeLines(): CodeLine[] {
  return [[{ text: " ", color: "#e6edf3" }]];
}
