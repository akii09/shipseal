// Template: release hero
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
  headline: z.string(),
  subheadline: z.string(),
  cta: z.string(),
  headingFamily: z.string(),
  bodyFamily: z.string(),
  headingWeight: z.number(),
  bodyWeight: z.number(),
  radius: z.number(),
  showCta: z.boolean(),
  showLogo: z.boolean(),
});

export type ReleaseHeroProps = z.infer<typeof propsSchema>;

export const releaseHero: TemplateDefinition = {
  id: "release-hero",
  events: ["release"],
  formats: ["og", "github-social", "x", "linkedin"],
  propsSchema,
  slots(format: Format) {
    const width = format.width - 2 * format.safeZone;
    return {
      headline: { maxLines: 2, maxFontSize: 72, minFontSize: 48, step: 4, box: { width } },
      subheadline: { maxLines: 2, maxFontSize: 32, minFontSize: 24, step: 2, box: { width } },
      cta: { maxLines: 1, maxFontSize: 28, minFontSize: 22, step: 2, box: { width: Math.min(480, width) } },
    };
  },
  slotText(raw) {
    const props = propsSchema.parse(raw);
    return {
      headline: props.headline,
      subheadline: props.subheadline,
      cta: props.cta,
    };
  },
  slotFont(raw, slot) {
    const props = propsSchema.parse(raw);
    if (slot === "headline") {
      return { family: props.headingFamily, weight: props.headingWeight, lineHeight: 1.1 };
    }
    return { family: props.bodyFamily, weight: props.bodyWeight, lineHeight: 1.25 };
  },
  buildProps(facts: Facts, copy: Copy, brand: Brand) {
    const missing = [];
    if (facts.project.npmPackage === undefined && facts.project.url === undefined) {
      missing.push({ fact: "project.npmPackage", effect: "cta uses project name" });
    }
    const showLogo = brand.logo !== undefined;
    if (!showLogo) {
      missing.push({ fact: "brand.logo", effect: "logo hidden" });
    }
    const version = facts.release?.version.value ?? "";
    return {
      props: {
        name: brand.name,
        version,
        headline: copy.headline,
        subheadline: copy.subheadline,
        cta: copy.cta,
        headingFamily: brand.fonts.heading.family,
        bodyFamily: brand.fonts.body.family,
        headingWeight: brand.fonts.heading.weight,
        bodyWeight: brand.fonts.body.weight,
        radius: brand.radius,
        showCta: copy.cta.length > 0,
        showLogo,
      },
      missing,
    };
  },
  render(raw, ctx) {
    const props = propsSchema.parse(raw);
    const colors = themeColors(ctx.brand, ctx.theme);
    const pad = ctx.format.safeZone;
    const headline = ctx.fitted.headline;
    const sub = ctx.fitted.subheadline;
    const cta = ctx.fitted.cta;
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
            {props.version.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: colors.card,
                  borderRadius: props.radius,
                  paddingTop: 6,
                  paddingBottom: 6,
                  paddingLeft: 14,
                  paddingRight: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: props.bodyFamily,
                    fontWeight: props.bodyWeight,
                    fontSize: 22,
                    color: colors.primary,
                  }}
                >
                  {`v${props.version}`}
                </div>
              </div>
            ) : undefined}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontFamily: props.headingFamily,
              fontWeight: props.headingWeight,
              fontSize: headline?.fontSize ?? 64,
              color: colors.foreground,
              lineHeight: 1.1,
            }}
          >
            {headline?.text ?? props.headline}
          </div>
          <div
            style={{
              fontFamily: props.bodyFamily,
              fontWeight: props.bodyWeight,
              fontSize: sub?.fontSize ?? 28,
              color: colors.muted,
              lineHeight: 1.25,
            }}
          >
            {sub?.text ?? props.subheadline}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          {props.showCta ? (
            <div
              style={{
                display: "flex",
                backgroundColor: colors.primary,
                borderRadius: props.radius,
                paddingTop: 14,
                paddingBottom: 14,
                paddingLeft: 24,
                paddingRight: 24,
              }}
            >
              <div
                style={{
                  fontFamily: props.bodyFamily,
                  fontWeight: props.headingWeight,
                  fontSize: cta?.fontSize ?? 24,
                  color: colors.background,
                }}
              >
                {cta?.text ?? props.cta}
              </div>
            </div>
          ) : (
            <div />
          )}
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
