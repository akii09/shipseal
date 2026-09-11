import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { decodePng, dominantNonNeutralColor } from "../src/brand/png.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "brands");

/** Build a PNG with a grey border and a colored centre, the shape of a typical logo. */
function makePng(color: [number, number, number], options: { alpha?: number; grey?: boolean } = {}): Buffer {
  const png = new PNG({ width: 32, height: 32 });
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4;
      const inside = x >= 8 && x < 24 && y >= 8 && y < 24;
      const [r, g, b] = inside ? color : [17, 17, 17];
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = inside ? (options.alpha ?? 255) : 255;
    }
  }
  return PNG.sync.write(png);
}

/** Decode or fail the test, so the assertions below need no non-null assertions. */
function decodeOrFail(buffer: Buffer) {
  const png = decodePng(buffer);
  if (png === undefined) {
    throw new Error("expected the PNG to decode");
  }
  return png;
}

describe("decodePng", () => {
  it("decodes a truecolor-alpha PNG", () => {
    const png = decodePng(makePng([255, 77, 77]));
    expect(png?.width).toBe(32);
    expect(png?.height).toBe(32);
    expect(png?.pixels.length).toBe(32 * 32 * 4);
  });

  it("returns undefined for a non-PNG buffer", () => {
    expect(decodePng(Buffer.from("not a png at all"))).toBeUndefined();
  });

  it("returns undefined for a truncated PNG", () => {
    expect(decodePng(makePng([255, 77, 77]).subarray(0, 30))).toBeUndefined();
  });
});

describe("dominantNonNeutralColor", () => {
  it("finds the brand color and ignores the grey surround", () => {
    expect(dominantNonNeutralColor(decodeOrFail(makePng([255, 77, 77])))).toBe("#ff4d4d");
  });

  it("ignores nearly transparent pixels", () => {
    // The colored centre is transparent, so only grey remains and there is no brand color.
    expect(dominantNonNeutralColor(decodeOrFail(makePng([255, 77, 77], { alpha: 10 })))).toBeUndefined();
  });

  it("returns undefined for an all-grey logo", () => {
    expect(dominantNonNeutralColor(decodeOrFail(makePng([40, 40, 40])))).toBeUndefined();
  });

  it("reads the real Shipseal icon as its brand red", async () => {
    const hex = dominantNonNeutralColor(decodeOrFail(await readFile(join(FIXTURES, "logo.png"))));
    expect(hex).toBeDefined();
    // The icon is a red seal on white. Assert the hue rather than an exact value, so a
    // re-export of the logo at a different compression level does not break the test.
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt((hex ?? "").slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(120);
    expect(b).toBeLessThan(120);
  });
});

describe("color detection honesty", () => {
  // A logo with no usable color must not silently pass Shipseal's own red off as the
  // user's brand. Every other detected field prints its source, so the fallback has to
  // announce itself.
  it("reports built-in defaults as defaults", async () => {
    const { mkdtemp, writeFile, mkdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { detectBrand } = await import("../src/brand/detect.js");

    const dir = await mkdtemp(join(tmpdir(), "shipseal-grey-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "grey" }), "utf8");
    await mkdir(join(dir, "assets"), { recursive: true });
    await writeFile(join(dir, "assets", "logo.png"), makePng([30, 30, 30]));

    const detection = await detectBrand(dir);
    expect(detection.brand.colors.primary).toBe("#ff4d4d"); // the built-in default
    expect(detection.notes.join(" ")).toContain("built-in defaults");
    expect(detection.notes.join(" ")).toContain("colors.primary");
    expect(detection.sources.some((s) => s.field === "colors.primary")).toBe(false);
  });

  it("prefers a real logo color over the default and records its source", async () => {
    const { mkdtemp, writeFile, mkdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { detectBrand } = await import("../src/brand/detect.js");

    const dir = await mkdtemp(join(tmpdir(), "shipseal-red-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "red" }), "utf8");
    await mkdir(join(dir, "assets"), { recursive: true });
    await writeFile(join(dir, "assets", "logo.png"), makePng([16, 185, 129]));

    const detection = await detectBrand(dir);
    expect(detection.brand.colors.primary).toBe("#10b981");
    expect(detection.sources.some((s) => s.field === "colors.primary")).toBe(true);
    expect(detection.notes.join(" ")).not.toContain("colors.primary");
  });
});
