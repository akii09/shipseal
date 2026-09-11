import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FORMATS } from "../src/formats.js";
import { countLines, createTakumiRenderer, testCardNode } from "../src/render/takumi.js";

describe("countLines", () => {
  it("counts distinct rounded run.y values, never runs.length", () => {
    const tree = {
      runs: [
        { y: 0 },
        { y: 0.2 },
        { y: 20 },
        { y: 20.4 },
      ],
      children: [
        {
          runs: [{ y: 20.1 }, { y: 40 }],
          children: [],
        },
      ],
    };
    expect(tree.runs.length).toBe(4);
    expect(countLines(tree)).toBe(3);
  });
});

describe("takumi adapter", () => {
  it("registers Geist Mono and renders a PNG test card", async () => {
    const renderer = await createTakumiRenderer();
    const png = await renderer.render(testCardNode(), {
      width: FORMATS.og.width,
      height: FORMATS.og.height,
      format: "png",
    });
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
    expect(png.length).toBeGreaterThan(100);
  });

  it("is byte-identical across two renders in one process", async () => {
    const renderer = await createTakumiRenderer();
    const opts = { width: FORMATS.og.width, height: FORMATS.og.height, format: "png" as const };
    const a = await renderer.render(testCardNode(), opts);
    const b = await renderer.render(testCardNode(), opts);
    expect(createHash("sha256").update(a).digest("hex")).toBe(
      createHash("sha256").update(b).digest("hex"),
    );
  });

  it("measureText wraps a long string onto several lines", async () => {
    const renderer = await createTakumiRenderer();
    const measured = await renderer.measureText(
      "The quick brown fox jumps over the lazy dog again and again and again",
      {
        fontFamily: "Geist",
        fontSize: 72,
        maxWidth: 400,
        lineHeight: 1.1,
      },
    );
    expect(measured.lines).toBeGreaterThan(1);
    expect(measured.width).toBeGreaterThan(0);
    expect(measured.height).toBeGreaterThan(0);
  });

  it("measureText with whiteSpace pre keeps indentation width", async () => {
    const renderer = await createTakumiRenderer();
    const collapsed = await renderer.measureText("    x", {
      fontFamily: "Geist Mono",
      fontSize: 32,
      maxWidth: 800,
      lineHeight: 1.2,
      whiteSpace: "normal",
    });
    const pre = await renderer.measureText("    x", {
      fontFamily: "Geist Mono",
      fontSize: 32,
      maxWidth: 800,
      lineHeight: 1.2,
      whiteSpace: "pre",
    });
    expect(pre.width).toBeGreaterThan(collapsed.width);
  });
});
