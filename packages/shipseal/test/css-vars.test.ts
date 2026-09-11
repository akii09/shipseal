import { describe, expect, it } from "vitest";
import { extractCssRootColors } from "../src/brand/css-vars.js";

describe("extractCssRootColors", () => {
  // Every case here came from a real stylesheet shape that returned nothing, or dropped a
  // color, before 2026-09-11. Reported by a user whose project yielded only muted and accent.
  const cases: Array<[string, string, { background: string; foreground: string; primary: string }]> = [
    [
      "hex with no trailing semicolon on the last declaration",
      ":root{--primary:#7c3aed;--background:#fff;--foreground:#111}",
      { background: "#ffffff", foreground: "#111111", primary: "#7c3aed" },
    ],
    [
      "shadcn bare HSL channels, applied as hsl(var(--x))",
      ":root{--background:0 0% 100%;--foreground:222.2 84% 4.9%;--primary:221.2 83.2% 53.3%}",
      { background: "#ffffff", foreground: "#020817", primary: "#2563eb" },
    ],
    [
      "bare RGB channels",
      ":root{--primary:124 58 237;--background:255 255 255;--foreground:17 17 17}",
      { background: "#ffffff", foreground: "#111111", primary: "#7c3aed" },
    ],
    [
      "var() indirection to another token",
      ":root{--brand-500:#7c3aed;--primary:var(--brand-500);--background:#fff;--foreground:#000}",
      { background: "#ffffff", foreground: "#000000", primary: "#7c3aed" },
    ],
    [
      "nested inside @layer base",
      "@layer base{:root{--primary:#7c3aed;--background:#faf5ff;--foreground:#1e1b4b}}",
      { background: "#faf5ff", foreground: "#1e1b4b", primary: "#7c3aed" },
    ],
    [
      "a [data-theme] block rather than :root",
      '[data-theme="light"]{--primary:#7c3aed;--background:#fff;--foreground:#111}',
      { background: "#ffffff", foreground: "#111111", primary: "#7c3aed" },
    ],
    [
      "tokens on html rather than :root",
      "html{--primary:#7c3aed;--background:#fff;--foreground:#111}",
      { background: "#ffffff", foreground: "#111111", primary: "#7c3aed" },
    ],
  ];

  for (const [name, css, expected] of cases) {
    it(`reads ${name}`, () => {
      expect(extractCssRootColors(css)).toMatchObject(expected);
    });
  }

  it("prefers a dark block over a light one, as the cascade does", () => {
    const css = ":root{--background:#ffffff;--foreground:#000000}.dark{--background:#0b0b0c;--foreground:#fafafa}";
    expect(extractCssRootColors(css).background).toBe("#0b0b0c");
  });

  it("returns nothing for a stylesheet with no theme tokens", () => {
    expect(extractCssRootColors(".btn{color:red}")).toEqual({});
  });
});
