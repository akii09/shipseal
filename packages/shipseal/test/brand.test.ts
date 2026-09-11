import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractCssRootColors } from "../src/brand/css-vars.js";
import { detectBrand } from "../src/brand/detect.js";
import { extractDtcgColors } from "../src/brand/dtcg.js";
import { findLogo } from "../src/brand/logo.js";
import { oklchToHex, parseCssColor } from "../src/brand/color.js";
import { extractTailwindV3Colors, extractTailwindV4Colors } from "../src/brand/tailwind.js";

describe("oklch to hex", () => {
  it("converts white, black, and zero chroma gray", () => {
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
    expect(parseCssColor("oklch(100% 0 0)")).toBe("#ffffff");
  });

  it("converts a red-like oklch close to #ff0000", () => {
    const hex = oklchToHex(0.628, 0.2577, 29.234);
    expect(hex.startsWith("#")).toBe(true);
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeLessThan(20);
    expect(b).toBeLessThan(20);
  });

  it("parses hex, rgb, and hsl", () => {
    expect(parseCssColor("#fff")).toBe("#ffffff");
    expect(parseCssColor("rgb(255, 0, 0)")).toBe("#ff0000");
    expect(parseCssColor("hsl(0 100% 50%)")).toBe("#ff0000");
  });
});

describe("tailwind v4 @theme", () => {
  it("extracts --color-* with brace matching and same-file var() resolution", () => {
    const css = `
      @theme {
        --color-background: oklch(0 0 0);
        --color-foreground: #fafafa;
        --color-primary: var(--color-red-500);
        --color-red-500: #ff4d4d;
        --color-chart-1: #00ff00;
      }
    `;
    const colors = extractTailwindV4Colors(css);
    expect(colors.background).toBe("#000000");
    expect(colors.foreground).toBe("#fafafa");
    expect(colors.primary).toBe("#ff4d4d");
    expect(colors.accent).toBeUndefined();
  });

  it("does not guess a cross-file var()", () => {
    const css = `
      @theme {
        --color-primary: var(--ui-color-primary);
      }
    `;
    expect(extractTailwindV4Colors(css).primary).toBeUndefined();
  });
});

describe("tailwind v3 and css vars", () => {
  it("extracts quoted color literals from a config snippet", () => {
    const source = `theme: { extend: { colors: { primary: "#112233", muted: "#445566" } } }`;
    expect(extractTailwindV3Colors(source)).toEqual({ primary: "#112233", muted: "#445566" });
  });

  it("extracts :root brand variables", () => {
    const css = `:root { --background: #0b0b0c; --primary: #ff4d4d; --brand: #0000ff; }`;
    const colors = extractCssRootColors(css);
    expect(colors.background).toBe("#0b0b0c");
    expect(colors.primary).toBe("#ff4d4d");
  });
});

describe("dtcg and logo", () => {
  it("reads color tokens by leaf name", () => {
    const tokens = {
      color: {
        primary: { $type: "color", $value: "#ff4d4d" },
        background: { $type: "color", $value: { hex: "#0b0b0c" } },
      },
    };
    expect(extractDtcgColors(tokens)).toEqual({ primary: "#ff4d4d", background: "#0b0b0c" });
  });

  it("finds logo.svg in assets/", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-logo-"));
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "assets", "logo.svg"), "<svg></svg>");
    expect(findLogo(dir)).toBe(join("assets", "logo.svg"));
  });
});

describe("detectBrand", () => {
  it("reads name and tagline from package.json and colors from @theme", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-detect-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "@acme/demo", description: "A demo project for tests" }),
    );
    await writeFile(
      join(dir, "app.css"),
      `@theme { --color-primary: #112233; --color-background: #000000; --color-foreground: #ffffff; }`,
    );
    const detection = await detectBrand(dir);
    expect(detection.brand.name).toBe("demo");
    expect(detection.brand.tagline).toBe("A demo project for tests");
    expect(detection.brand.colors.primary).toBe("#112233");
    expect(detection.sources.some((s) => s.field === "name" && s.source === "package.json#name")).toBe(
      true,
    );
  });
});
