// Template: before/after metrics
// Spec: docs/PROJECT_PLAN.md §14.3

import { z } from "zod";
import { changePhrase, percentChange } from "../bench/percent.js";
import type { Brand } from "../brand/schema.js";
import type { Copy } from "../copy/slots.js";
import type { Facts } from "../facts/schema.js";
import type { Format } from "../formats.js";
import type { TemplateDefinition } from "./contract.js";
import { themeColors } from "./theme.js";

const rowSchema = z.object({
  label: z.string(),
  beforeText: z.string(),
  afterText: z.string(),
  changeText: z.string(),
  regression: z.boolean(),
});

const propsSchema = z.object({
  title: z.string(),
  note: z.string(),
  rows: z.array(rowSchema),
  headingFamily: z.string(),
  bodyFamily: z.string(),
  headingWeight: z.number(),
  bodyWeight: z.number(),
  radius: z.number(),
});

export type BenchProps = z.infer<typeof propsSchema>;

export const bench: TemplateDefinition = {
  id: "bench",
  events: ["bench"],
  formats: ["x", "linkedin"],
  propsSchema,
  slots(format: Format) {
    const width = format.width - 2 * format.safeZone;
    const slots: Record<string, { maxLines: number; maxFontSize: number; minFontSize: number; step: number; box: { width: number } }> =
      {
        title: { maxLines: 2, maxFontSize: 48, minFontSize: 28, step: 2, box: { width } },
      };
    for (let index = 0; index < 3; index += 1) {
      slots[`change-${String(index)}`] = {
        maxLines: 1,
        maxFontSize: 36,
        minFontSize: 22,
        step: 2,
        box: { width: Math.min(360, width) },
      };
    }
    return slots;
  },
  slotText(raw) {
    const props = propsSchema.parse(raw);
    const text: Record<string, string> = { title: props.title };
    props.rows.forEach((row, index) => {
      text[`change-${String(index)}`] = row.changeText;
    });
    return text;
  },
  slotFont(raw, slot) {
    const props = propsSchema.parse(raw);
    if (slot === "title") {
      return { family: props.headingFamily, weight: props.headingWeight, lineHeight: 1.15 };
    }
    return { family: props.headingFamily, weight: props.headingWeight, lineHeight: 1.1 };
  },
  buildProps(facts: Facts, copy: Copy, brand: Brand) {
    const missing = [];
    if (facts.bench === undefined) {
      missing.push({ fact: "bench", effect: "metrics hidden" });
    }
    const rows =
      facts.bench?.metrics.map((metric) => {
        const change = percentChange(metric.before.value, metric.after.value, metric.better.value);
        return {
          label: metric.label.value,
          beforeText: `${formatMetric(metric.before.value)} ${metric.unit.value}`,
          afterText: `${formatMetric(metric.after.value)} ${metric.unit.value}`,
          changeText: changePhrase(metric.unit.value, metric.better.value, change),
          regression: change.regression,
        };
      }) ?? [];
    return {
      props: {
        title: copy.headline,
        note: copy.subheadline,
        rows,
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
    const title = ctx.fitted.title;
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
        <div
          style={{
            fontFamily: props.headingFamily,
            fontWeight: props.headingWeight,
            fontSize: title?.fontSize ?? 40,
            color: colors.foreground,
            lineHeight: 1.15,
          }}
        >
          {title?.text ?? props.title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {props.rows.map((row, index) => {
            const change = ctx.fitted[`change-${String(index)}`];
            return (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  backgroundColor: colors.card,
                  borderRadius: props.radius,
                  paddingTop: 16,
                  paddingBottom: 16,
                  paddingLeft: 24,
                  paddingRight: 24,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      fontFamily: props.bodyFamily,
                      fontWeight: props.bodyWeight,
                      fontSize: 22,
                      color: colors.muted,
                    }}
                  >
                    {row.label}
                  </div>
                  <div
                    style={{
                      fontFamily: props.bodyFamily,
                      fontWeight: props.bodyWeight,
                      fontSize: 24,
                      color: colors.foreground,
                    }}
                  >
                    {`${row.beforeText} to ${row.afterText}`}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div
                    style={{
                      fontFamily: props.headingFamily,
                      fontWeight: props.headingWeight,
                      fontSize: change?.fontSize ?? 32,
                      color: row.regression ? colors.primary : colors.accent,
                    }}
                  >
                    {change?.text ?? row.changeText}
                  </div>
                  {row.regression ? (
                    <div
                      style={{
                        fontFamily: props.bodyFamily,
                        fontWeight: props.bodyWeight,
                        fontSize: 18,
                        color: colors.primary,
                      }}
                    >
                      regression
                    </div>
                  ) : undefined}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div
            style={{
              fontFamily: props.bodyFamily,
              fontWeight: props.bodyWeight,
              fontSize: 20,
              color: colors.muted,
            }}
          >
            {props.note}
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

function formatMetric(value: number): string {
  return String(value);
}
