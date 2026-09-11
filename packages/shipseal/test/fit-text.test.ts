import { describe, expect, it } from "vitest";
import { fitText } from "../src/fit/fit-text.js";
import type { RendererAdapter } from "../src/render/adapter.js";

function mockMeasure(charsPerLineAtSize: (fontSize: number) => number): Pick<RendererAdapter, "measureText"> {
  return {
    async measureText(text, opts) {
      const perLine = Math.max(1, charsPerLineAtSize(opts.fontSize));
      return {
        lines: Math.max(1, Math.ceil(text.length / perLine)),
        width: opts.maxWidth,
        height: Math.max(1, Math.ceil(text.length / perLine)) * opts.fontSize * opts.lineHeight,
      };
    },
  };
}

describe("fitText", () => {
  const spec = { maxLines: 2, maxFontSize: 72, minFontSize: 48, step: 8, box: { width: 400 } };
  const font = { family: "Geist", lineHeight: 1.1 };

  it("keeps max size when the text already fits", async () => {
    const renderer = mockMeasure(() => 80);
    const fitted = await fitText(renderer, "Short", spec, font);
    expect(fitted.fontSize).toBe(72);
    expect(fitted.truncated).toBe(false);
    expect(fitted.text).toBe("Short");
  });

  it("shrinks until the line count fits", async () => {
    const renderer = mockMeasure((size) => (size >= 64 ? 4 : 40));
    const fitted = await fitText(renderer, "This headline is quite long for the box", spec, font);
    expect(fitted.fontSize).toBeLessThan(72);
    expect(fitted.truncated).toBe(false);
    expect(fitted.lines).toBeLessThanOrEqual(2);
  });

  it("truncates at a word boundary at min size", async () => {
    const renderer = mockMeasure(() => 5);
    const fitted = await fitText(
      renderer,
      "one two three four five six seven eight nine ten",
      spec,
      font,
    );
    expect(fitted.fontSize).toBe(48);
    expect(fitted.truncated).toBe(true);
    expect(fitted.text.endsWith("...")).toBe(true);
    expect(fitted.text.includes("ten")).toBe(false);
  });
});
