// One page of a release story. Spec: docs/PROJECT_PLAN.md 25 (2026-09-13 decisions).
//
// The kind on the page decides the body treatment: `code` uses the mono family and preserves
// whitespace, `comparison` lays out two supplied screenshots, everything else is prose. The
// brand style decides the chrome: editorial adds rules, terminal adds a framed body.

import { z } from "zod";
import { ShipsealError } from "../core/errors.js";
import { MONO_ADVANCE } from "./code-card.js";
import { storyPageSchema } from "../facts/schema.js";
import type { Format } from "../formats.js";
import type { TemplateDefinition } from "./contract.js";
import { themeColors } from "./theme.js";

const propsSchema = z.object({
  page: storyPageSchema,
  name: z.string(),
  version: z.string(),
  heading: z.string(),
  body: z.string(),
  mono: z.string(),
  weight: z.number(),
});

const HEADER_HEIGHT = 36;
const BODY_PAD = 24;
const CODE_LINE_HEIGHT = 1.35;
const CODE_MIN_FONT_SIZE = 14;
const FOOTER_ALLOWANCE = 144;
const TALL_THRESHOLD = 900;

function geometry(format: Format) {
  const tall = format.height > TALL_THRESHOLD;
  const titleHeight = tall ? 220 : 112;
  return {
    tall,
    titleHeight,
    width: format.width - 2 * format.safeZone,
    bodyHeight: format.height - 2 * format.safeZone - titleHeight - FOOTER_ALLOWANCE,
  };
}

const NO_BORDER = "0px solid transparent";

/**
 * Monospace `pre` text does not wrap, so the generic line-count fitter cannot keep it inside
 * the card: it reports two lines that fit and the long one runs off the right edge. Mono
 * glyphs are a constant fraction of the em, so the widest line gives a size directly. Same
 * approach as code-card, which is why MONO_ADVANCE is shared rather than copied.
 */
function codeFontSize(text: string, box: { width: number; height: number }, max: number): number {
  const lines = text.split("\n");
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const byWidth = box.width / (longest * MONO_ADVANCE);
  const byHeight = box.height / (lines.length * CODE_LINE_HEIGHT);
  return Math.max(CODE_MIN_FONT_SIZE, Math.min(max, Math.floor(Math.min(byWidth, byHeight))));
}

/**
 * A body the reader is meant to copy and run: a code snippet, or upgrade instructions the
 * maintainer supplied. Generated upgrade prose (a link to the release notes) is not one, so
 * the provenance decides rather than the page kind alone.
 */
function isCommand(page: z.infer<typeof propsSchema>["page"]): boolean {
  return (
    page.kind === "code" ||
    (page.kind === "upgrade" && page.body.provenance.source === "user-config")
  );
}

export const storyPage: TemplateDefinition = {
  id: "story-page",
  events: ["release"],
  formats: ["og", "github-social", "x", "linkedin", "square", "portrait", "producthunt"],
  propsSchema,

  slots(format) {
    const { width, titleHeight, bodyHeight, tall } = geometry(format);
    return {
      name: { maxLines: 1, maxFontSize: 24, minFontSize: 18, step: 2, box: { width: width - 300 } },
      version: { maxLines: 1, maxFontSize: 22, minFontSize: 16, step: 2, box: { width: 220 } },
      title: {
        maxLines: tall ? 3 : 2,
        maxFontSize: tall ? 64 : 48,
        minFontSize: 28,
        step: 2,
        box: { width: width - 32, height: titleHeight },
      },
      body: {
        maxLines: Math.floor(bodyHeight / 30),
        maxFontSize: tall ? 34 : 28,
        minFontSize: 20,
        step: 2,
        box: { width: width - 48, height: bodyHeight - 48 },
      },
    };
  },

  slotText(raw) {
    const props = propsSchema.parse(raw);
    return {
      name: props.name,
      version: props.version,
      title: props.page.title.value,
      body: props.page.body.value,
    };
  },

  slotFont(raw, slot) {
    const props = propsSchema.parse(raw);
    const mono = slot === "body" && isCommand(props.page);
    return {
      family: mono ? props.mono : slot === "title" ? props.heading : props.body,
      weight: slot === "title" ? props.weight : 400,
      lineHeight: mono ? 1.35 : 1.2,
      whiteSpace: mono ? "pre" : "normal",
    };
  },

  buildProps(facts, _copy, brand) {
    const page = facts.story?.[0];
    if (page === undefined) {
      // Reachable when release.templates names story-page directly, so this has to be a
      // typed error rather than a schema failure from inside generate().
      throw new ShipsealError(
        "story-page.no-page",
        "The story-page template has no story page to render.",
        "Run shipseal story to build a story pack. Do not list story-page in release.templates.",
      );
    }
    return {
      props: {
        page,
        name: brand.name,
        version: facts.release?.tag.value ?? "",
        heading: brand.style === "terminal" ? brand.fonts.mono.family : brand.fonts.heading.family,
        body: brand.fonts.body.family,
        mono: brand.fonts.mono.family,
        weight: brand.fonts.heading.weight,
      },
      missing: [],
    };
  },

  render(raw, ctx) {
    const props = propsSchema.parse(raw);
    const colors = themeColors(ctx.brand, ctx.theme);
    const { tall, titleHeight, bodyHeight, width } = geometry(ctx.format);
    const editorial = ctx.brand.style === "editorial";
    const terminal = ctx.brand.style === "terminal";
    const code = isCommand(props.page);
    const comparison = props.page.kind === "comparison";
    const title = ctx.fitted.title;
    const body = ctx.fitted.body;
    const hasBody = props.page.body.value.trim().length > 0;
    const bodyText = body?.text ?? props.page.body.value;
    const bodyFontSize = code
      ? codeFontSize(
          bodyText,
          { width: width - 2 * BODY_PAD, height: bodyHeight - 2 * BODY_PAD },
          tall ? 34 : 28,
        )
      : (body?.fontSize ?? 28);
    const paneWidth = tall ? width : (width - 16) / 2;
    const paneHeight = tall ? (bodyHeight - 16) / 2 : bodyHeight;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: colors.background,
          color: colors.foreground,
          padding: ctx.format.safeZone,
          gap: 24,
          borderTop: editorial ? `16px solid ${colors.primary}` : NO_BORDER,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: HEADER_HEIGHT,
            borderBottom: terminal ? `1px solid ${colors.muted}` : NO_BORDER,
            paddingBottom: terminal ? 12 : 0,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {ctx.logoSrc !== undefined ? <img src={ctx.logoSrc} width={32} height={32} /> : undefined}
            <div
              style={{
                fontFamily: terminal ? props.mono : props.body,
                fontWeight: 400,
                fontSize: ctx.fitted.name?.fontSize ?? 24,
                color: colors.primary,
              }}
            >
              {ctx.fitted.name?.text ?? props.name}
            </div>
          </div>
          <div
            style={{
              fontFamily: props.mono,
              fontWeight: 400,
              fontSize: ctx.fitted.version?.fontSize ?? 22,
              color: colors.muted,
            }}
          >
            {ctx.fitted.version?.text ?? props.version}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: titleHeight,
            flexShrink: 0,
            paddingLeft: editorial ? 24 : 0,
            borderLeft: editorial ? `8px solid ${colors.primary}` : NO_BORDER,
          }}
        >
          <div
            style={{
              fontFamily: props.heading,
              fontWeight: props.weight,
              fontSize: title?.fontSize ?? 48,
              lineHeight: 1.2,
              maxWidth: width - (editorial ? 32 : 0),
            }}
          >
            {title?.text ?? props.page.title.value}
          </div>
        </div>

        {comparison ? (
          <div
            style={{
              display: "flex",
              flexDirection: tall ? "column" : "row",
              gap: 16,
              height: bodyHeight,
            }}
          >
            {["before", "after"].map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  width: paneWidth,
                  height: paneHeight,
                }}
              >
                <div style={{ fontFamily: props.body, fontSize: 20, color: colors.muted }}>
                  {label === "before" ? "Before" : "After"}
                </div>
                <img
                  src={`story-${label}`}
                  width={paneWidth}
                  height={paneHeight - HEADER_HEIGHT}
                  style={{ objectFit: "contain" }}
                />
              </div>
            ))}
          </div>
        ) : hasBody ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              // Top-aligned: centring a short paragraph in a full-height box leaves a hole
              // in the middle of the card rather than margin at the bottom.
              justifyContent: "flex-start",
              height: bodyHeight,
              padding: BODY_PAD,
              backgroundColor: terminal || code ? colors.card : "transparent",
              borderRadius: terminal ? 0 : ctx.brand.radius,
              borderLeft: terminal ? `3px solid ${colors.primary}` : NO_BORDER,
            }}
          >
            <div
              style={{
                fontFamily: code ? props.mono : props.body,
                fontWeight: 400,
                fontSize: bodyFontSize,
                lineHeight: code ? CODE_LINE_HEIGHT : 1.2,
                whiteSpace: code ? "pre" : "normal",
                color: colors.foreground,
              }}
            >
              {bodyText}
            </div>
          </div>
        ) : undefined}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "auto",
            fontFamily: props.mono,
            fontWeight: 400,
            fontSize: 16,
            color: colors.muted,
          }}
        >
          <div style={{ fontFamily: props.mono }}>
            {comparison ? "Supplied screenshots" : "Sources in manifest.json"}
          </div>
          {ctx.attribution ? (
            <div style={{ fontFamily: props.mono }}>made with shipseal.dev</div>
          ) : undefined}
        </div>
      </div>
    );
  },
};
