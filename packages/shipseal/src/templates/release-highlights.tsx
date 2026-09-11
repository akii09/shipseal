// Template: what's new list
// Spec: docs/PROJECT_PLAN.md §14.3

import { z } from "zod";
import type { Brand } from "../brand/schema.js";
import type { Copy } from "../copy/slots.js";
import type { Facts } from "../facts/schema.js";
import type { Format } from "../formats.js";
import type { TemplateDefinition } from "./contract.js";
import { themeColors } from "./theme.js";

const propsSchema = z.object({
  name: z.string(),
  version: z.string(),
  highlights: z.array(z.string()),
  headingFamily: z.string(),
  bodyFamily: z.string(),
  headingWeight: z.number(),
  bodyWeight: z.number(),
  radius: z.number(),
});

export type ReleaseHighlightsProps = z.infer<typeof propsSchema>;

export const releaseHighlights: TemplateDefinition = {
  id: "release-highlights",
  events: ["release"],
  formats: ["x", "linkedin"],
  propsSchema,
  slots(format: Format) {
    const width = format.width - 2 * format.safeZone - 48;
    const slots: Record<string, { maxLines: number; maxFontSize: number; minFontSize: number; step: number; box: { width: number } }> = {};
    for (let index = 0; index < 4; index += 1) {
      slots[`highlight-${String(index)}`] = {
        maxLines: 2,
        maxFontSize: 32,
        minFontSize: 24,
        step: 2,
        box: { width },
      };
    }
    return slots;
  },
  slotText(raw) {
    const props = propsSchema.parse(raw);
    const text: Record<string, string> = {};
    props.highlights.forEach((line, index) => {
      text[`highlight-${String(index)}`] = line;
    });
    return text;
  },
  slotFont(raw) {
    const props = propsSchema.parse(raw);
    return { family: props.bodyFamily, weight: props.bodyWeight, lineHeight: 1.25 };
  },
  buildProps(facts: Facts, copy: Copy, brand: Brand) {
    const missing = [];
    if (copy.highlights.length === 0) {
      missing.push({ fact: "release.features", effect: "highlights list empty" });
    }
    return {
      props: {
        name: brand.name,
        version: facts.release?.version.value ?? "",
        highlights: copy.highlights,
        headingFamily: brand.fonts.heading.family,
        bodyFamily: brand.fonts.body.family,
        headingWeight: brand.fonts.heading.weight,
        bodyWeight: brand.fonts.body.weight,
        radius: brand.radius,
      },
      missing,
    };
  },
  render(raw, ctx) {
    const props = propsSchema.parse(raw);
    const colors = themeColors(ctx.brand, ctx.theme);
    const pad = ctx.format.safeZone;
    const title = props.version.length > 0 ? `What's new in v${props.version}` : "What's new";
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: colors.background,
          padding: pad,
          gap: 28,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontFamily: props.bodyFamily,
              fontWeight: props.bodyWeight,
              fontSize: 22,
              color: colors.primary,
            }}
          >
            {props.name}
          </div>
          <div
            style={{
              fontFamily: props.headingFamily,
              fontWeight: props.headingWeight,
              fontSize: 48,
              color: colors.foreground,
            }}
          >
            {title}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {props.highlights.map((line, index) => {
            const fitted = ctx.fitted[`highlight-${String(index)}`];
            const breaking = line.startsWith("Breaking:");
            return (
              <div
                key={String(index)}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 16,
                  backgroundColor: colors.card,
                  borderRadius: props.radius,
                  padding: 18,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: breaking ? colors.accent : colors.primary,
                    marginTop: 10,
                  }}
                />
                <div
                  style={{
                    fontFamily: props.bodyFamily,
                    fontWeight: props.bodyWeight,
                    fontSize: fitted?.fontSize ?? 28,
                    color: colors.foreground,
                    lineHeight: 1.25,
                  }}
                >
                  {fitted?.text ?? line}
                </div>
              </div>
            );
          })}
        </div>
        {ctx.attribution ? (
          <div
            style={{
              fontFamily: props.bodyFamily,
              fontWeight: props.bodyWeight,
              fontSize: 18,
              color: colors.muted,
              marginTop: "auto",
            }}
          >
            made with shipseal.dev
          </div>
        ) : undefined}
      </div>
    );
  },
};
