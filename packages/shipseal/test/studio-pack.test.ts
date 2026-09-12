import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config/schema.js";
import { selectedBrand, selectedConfig, selectionSchema } from "../src/studio/pack.js";
import { FIXTURE_BRAND, FIXTURE_CONFIG } from "./helpers/facts.js";

const select = (overrides: Record<string, unknown> = {}) =>
  selectionSchema.parse({ theme: "dark", style: "minimal", accent: "#ff4d4d", ...overrides });

describe("selectionSchema", () => {
  it("defaults to a portrait story with no overrides", () => {
    expect(select()).toEqual({
      pack: "story",
      style: "minimal",
      theme: "dark",
      accent: "#ff4d4d",
      headline: "",
      upgrade: "",
      format: "portrait",
    });
  });

  it("rejects an unknown key, so a stale client cannot smuggle options through", () => {
    expect(() => select({ templates: ["release-hero"] })).toThrowError(/[Uu]nrecognized key/);
  });

  it("rejects readme-banner, an unsupported format and an over-long headline", () => {
    expect(() => select({ format: "readme-banner" })).toThrowError(/format/);
    expect(() => select({ format: "billboard" })).toThrowError(/format/);
    expect(() => select({ headline: "x".repeat(501) })).toThrowError(/headline/);
    expect(() => select({ upgrade: "x".repeat(4001) })).toThrowError(/upgrade/);
  });

  it("accepts the three brand styles and both themes", () => {
    for (const style of ["minimal", "editorial", "terminal"]) {
      expect(select({ style }).style).toBe(style);
    }
    expect(select({ theme: "light" }).theme).toBe("light");
  });
});

describe("selectedConfig", () => {
  it("expands a story pack's all to every format story-page declares", () => {
    expect(selectedConfig(DEFAULT_CONFIG, select({ format: "all" })).formats).toEqual([
      "portrait",
      "square",
      "og",
      "github-social",
      "x",
      "linkedin",
      "producthunt",
    ]);
  });

  it("expands a release pack's all to the four landscape formats only", () => {
    expect(
      selectedConfig(DEFAULT_CONFIG, select({ pack: "release", format: "all" })).formats,
    ).toEqual(["og", "github-social", "x", "linkedin"]);
  });

  it("keeps a single chosen format", () => {
    expect(selectedConfig(DEFAULT_CONFIG, select({ format: "square" })).formats).toEqual(["square"]);
  });

  it("refuses a portrait size for the standard release templates, which are landscape", () => {
    for (const format of ["portrait", "square", "producthunt"]) {
      expect(() => selectedConfig(DEFAULT_CONFIG, select({ pack: "release", format }))).toThrowError(
        /do not support this format/,
      );
    }
  });

  it("allows a landscape size for a release pack", () => {
    expect(selectedConfig(DEFAULT_CONFIG, select({ pack: "release", format: "og" })).formats).toEqual(
      ["og"],
    );
  });

  it("carries the headline and upgrade choices and pins PNG output", () => {
    const config = selectedConfig(
      FIXTURE_CONFIG,
      select({ headline: "Story packs land", upgrade: "pnpm add shipseal@1" }),
    );
    expect(config.release?.headline).toBe("Story packs land");
    expect(config.release?.story?.upgrade).toBe("pnpm add shipseal@1");
    expect(config.output?.imageFormat).toBe("png");
  });

  it("turns an empty headline into null so the deterministic fallback runs", () => {
    expect(selectedConfig(FIXTURE_CONFIG, select()).release?.headline).toBeNull();
  });

  it("preserves unrelated config, including the release templates", () => {
    const config = selectedConfig(FIXTURE_CONFIG, select());
    expect(config.release?.templates).toEqual(FIXTURE_CONFIG.release?.templates);
    expect(config.attribution).toBe(false);
  });

  it("keeps configured screenshots when the selection only changes the upgrade text", () => {
    const withShots = {
      ...DEFAULT_CONFIG,
      release: {
        ...DEFAULT_CONFIG.release,
        story: { before: "docs/a.png", after: "docs/b.png" },
      },
    };
    const config = selectedConfig(withShots, select({ upgrade: "pnpm up" }));
    expect(config.release?.story).toEqual({
      before: "docs/a.png",
      after: "docs/b.png",
      upgrade: "pnpm up",
    });
  });
});

describe("selectedBrand", () => {
  it("applies the style and accent from the selection", () => {
    const brand = selectedBrand(FIXTURE_BRAND, select({ style: "terminal", accent: "#22d3ee" }));
    expect(brand.style).toBe("terminal");
    expect(brand.colors.primary).toBe("#22d3ee");
  });

  it("leaves the stored theme alone, because it is the palette's polarity not the render theme", () => {
    expect(selectedBrand(FIXTURE_BRAND, select({ theme: "light" })).theme).toBe(FIXTURE_BRAND.theme);
  });

  it("keeps every other brand field, including the remaining colors and fonts", () => {
    const brand = selectedBrand(FIXTURE_BRAND, select({ accent: "#22d3ee" }));
    expect(brand.colors.background).toBe(FIXTURE_BRAND.colors.background);
    expect(brand.colors.accent).toBe(FIXTURE_BRAND.colors.accent);
    expect(brand.fonts).toEqual(FIXTURE_BRAND.fonts);
    expect(brand.name).toBe(FIXTURE_BRAND.name);
  });
});
