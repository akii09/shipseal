import { describe, expect, it } from "vitest";
import { generate } from "../src/core/generate.js";
import { flattenFacts } from "../src/outputs/manifest.js";
import { createTakumiRenderer } from "../src/render/takumi.js";
import { benchCopy, deterministicCopy, milestoneCopy } from "../src/copy/deterministic.js";
import { unsourcedDigits, allowedNumbers } from "../src/copy/number-guard.js";
import { bench } from "../src/templates/bench.js";
import { FIXTURE_BRAND, FIXTURE_CONFIG, FIXTURE_FACTS, LONG_HEADLINE_FACTS, BENCH_FACTS, MILESTONE_FACTS } from "./helpers/facts.js";

describe("generate", () => {
  it("renders release cards and records provenance for every number in copy", async () => {
    const renderer = await createTakumiRenderer();
    const copy = deterministicCopy(FIXTURE_FACTS);
    const result = await generate({
      event: { kind: "release", tag: "v2.0.0", previousTag: "v1.9.0" },
      facts: FIXTURE_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["x"], release: { templates: ["release-hero"] } },
      copy,
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.files.length).toBe(1);
    const file = result.files[0];
    expect(file?.fileName).toBe("release-hero-x.png");
    expect(file?.bytes[0]).toBe(0x89);
    const allowed = allowedNumbers(FIXTURE_FACTS);
    for (const text of [copy.headline, copy.subheadline, copy.cta, ...copy.highlights]) {
      expect(unsourcedDigits(text, allowed)).toEqual([]);
    }
    const flat = flattenFacts(FIXTURE_FACTS);
    expect(flat["release.version"]?.value).toBe("2.0.0");
    expect(flat["release.version"]?.source).toBe("git");
  });

  it("renders a code-card PNG with a fenced snippet", async () => {
    const renderer = await createTakumiRenderer();
    const copy = deterministicCopy(FIXTURE_FACTS);
    const result = await generate({
      event: { kind: "release", tag: "v2.0.0" },
      facts: FIXTURE_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["x"], release: { templates: ["code-card"] } },
      copy,
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.files[0]?.fileName).toBe("code-card-x.png");
    expect(result.files[0]?.bytes[0]).toBe(0x89);
  });

  it("records a truncation warning for a deliberately long headline", async () => {
    const renderer = await createTakumiRenderer();
    const copy = deterministicCopy(LONG_HEADLINE_FACTS);
    const result = await generate({
      event: { kind: "release", tag: "v2.0.0" },
      facts: LONG_HEADLINE_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["x"], release: { templates: ["release-hero"] } },
      copy,
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.warnings.some((warning) => warning.slot === "headline" && warning.action === "truncated")).toBe(
      true,
    );
  });

  it("renders a 1,000-stars milestone card and records the threshold", async () => {
    const renderer = await createTakumiRenderer();
    const copy = milestoneCopy(MILESTONE_FACTS, "stars", 1000);
    const result = await generate({
      event: { kind: "milestone", metric: "stars", threshold: 1000 },
      facts: MILESTONE_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["og"] },
      copy,
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.files[0]?.fileName).toBe("milestone-og.png");
    expect(result.files[0]?.bytes[0]).toBe(0x89);
    const flat = flattenFacts(MILESTONE_FACTS);
    expect(flat["milestone.threshold"]?.value).toBe(1000);
    expect(flat["milestone.threshold"]?.source).toBe("user-config");
    expect(unsourcedDigits(copy.milestoneLine ?? "", allowedNumbers(MILESTONE_FACTS))).toEqual([]);
  });

  it("renders a regression bench card with a negative computed percent", async () => {
    const renderer = await createTakumiRenderer();
    const copy = benchCopy(BENCH_FACTS);
    const result = await generate({
      event: { kind: "bench", file: ".shipseal/bench.json" },
      facts: BENCH_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["x"] },
      copy,
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.files[0]?.fileName).toBe("bench-x.png");
    expect(result.computed["bench.metrics[0].percent"]?.value).toBe(-13);
    const built = bench.buildProps(BENCH_FACTS, copy, FIXTURE_BRAND);
    expect(built.props).toMatchObject({
      rows: [{ changeText: "13% slower", regression: true }],
    });
  });
});
