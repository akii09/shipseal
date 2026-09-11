// Template: milestone big number
// Spec: docs/PROJECT_PLAN.md §14.3

import { z } from "zod";
import type { Brand } from "../brand/schema.js";
import { formatCount } from "../copy/deterministic.js";
import type { Copy } from "../copy/slots.js";
import type { Facts } from "../facts/schema.js";
import type { Format } from "../formats.js";
import type { TemplateDefinition } from "./contract.js";
import { themeColors } from "./theme.js";

const propsSchema = z.object({
  name: z.string(),
  numberText: z.string(),
  metricLabel: z.string(),
  thankYou: z.string(),
  headingFamily: z.string(),
  bodyFamily: z.string(),
  headingWeight: z.number(),
  bodyWeight: z.number(),
  radius: z.number(),
  showLogo: z.boolean(),
});

export type MilestoneProps = z.infer<typeof propsSchema>;

export const milestone: TemplateDefinition = {
  id: "milestone",
  events: ["milestone"],
  formats: ["og", "x", "linkedin"],
  propsSchema,
  slots(format: Format) {
    const width = format.width - 2 * format.safeZone;
    return {
      number: { maxLines: 1, maxFontSize: 160, minFontSize: 72, step: 8, box: { width } },
      thankYou: { maxLines: 2, maxFontSize: 36, minFontSize: 24, step: 2, box: { width } },
    };
  },
  slotText(raw) {
    const props = propsSchema.parse(raw);
    return { number: props.numberText, thankYou: props.thankYou };
  },
  slotFont(raw, slot) {
    const props = propsSchema.parse(raw);
    if (slot === "number") {
      return { family: props.headingFamily, weight: props.headingWeight, lineHeight: 1 };
    }
    return { family: props.bodyFamily, weight: props.bodyWeight, lineHeight: 1.25 };
  },
  buildProps(facts: Facts, copy: Copy, brand: Brand) {
    const missing = [];
    const threshold = facts.milestone?.threshold.value;
    if (threshold === undefined) {
      missing.push({ fact: "milestone.threshold", effect: "number hidden" });
    }
    const metric = facts.milestone?.metric.value;
    const metricLabel =
      metric === "downloads" ? "weekly downloads" : metric === "contributors" ? "contributors" : "stars";
    const showLogo = brand.logo !== undefined;
    if (!showLogo) {
      missing.push({ fact: "brand.logo", effect: "logo hidden" });
    }
    const thankYou = copy.milestoneLine ?? (threshold === undefined ? "" : `Thank you for ${formatCount(threshold)} ${metricLabel}`);
    return {
      props: {
        name: brand.name,
        numberText: threshold === undefined ? "" : formatCount(threshold),
        metricLabel,
        thankYou,
        headingFamily: brand.fonts.heading.family,
        bodyFamily: brand.fonts.body.family,
        headingWeight: brand.fonts.heading.weight,
        bodyWeight: brand.fonts.body.weight,
        radius: brand.radius,
        showLogo,
      },
      missing,
    };
  },
  render(raw, ctx) {
    const props = propsSchema.parse(raw);
    const colors = themeColors(ctx.brand, ctx.theme);
    const pad = ctx.format.safeZone;
    const number = ctx.fitted.number;
    const thanks = ctx.fitted.thankYou;
    const compact = ctx.format.height <= 640;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          backgroundColor: colors.background,
          padding: pad,
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 20 }}>
          {props.showLogo && ctx.logoSrc !== undefined ? (
            <img src={ctx.logoSrc} width={compact ? 56 : 72} height={compact ? 56 : 72} />
          ) : undefined}
          <div
            style={{
              fontFamily: props.headingFamily,
              fontWeight: props.headingWeight,
              fontSize: 28,
              color: colors.foreground,
            }}
          >
            {props.name}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              fontFamily: props.headingFamily,
              fontWeight: props.headingWeight,
              fontSize: number?.fontSize ?? 140,
              color: colors.foreground,
              lineHeight: 1,
            }}
          >
            {number?.text ?? props.numberText}
          </div>
          <div
            style={{
              fontFamily: props.bodyFamily,
              fontWeight: props.headingWeight,
              fontSize: 32,
              color: colors.primary,
            }}
          >
            {props.metricLabel}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div
            style={{
              fontFamily: props.bodyFamily,
              fontWeight: props.bodyWeight,
              fontSize: thanks?.fontSize ?? 28,
              color: colors.muted,
              lineHeight: 1.25,
            }}
          >
            {thanks?.text ?? props.thankYou}
          </div>
          {ctx.attribution ? (
            <div
              style={{
                fontFamily: props.bodyFamily,
                fontWeight: props.bodyWeight,
                fontSize: 18,
                color: colors.muted,
              }}
            >
              made with shipseal.dev
            </div>
          ) : undefined}
        </div>
      </div>
    );
  },
};
