import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { benchCopy, deterministicCopy, milestoneCopy } from "../../src/copy/deterministic.js";
import { DEFAULT_CONFIG } from "../../src/config/schema.js";
import { generate } from "../../src/core/generate.js";
import { storyFacts } from "../../src/core/story.js";
import type { GenerateResult } from "../../src/core/generate.js";
import { createTakumiRenderer } from "../../src/render/takumi-node.js";
import {
  BENCH_FACTS,
  FIXTURE_BRAND,
  FIXTURE_CONFIG,
  FIXTURE_FACTS,
  MILESTONE_FACTS,
} from "../helpers/facts.js";

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "images");
const MAX_DIFF_RATIO = 0.001;

describe("golden images", () => {
  it("matches release-hero og within 0.1% of pixels", async () => {
    const renderer = await createTakumiRenderer();
    const result = await generate({
      event: { kind: "release", tag: "v2.0.0", previousTag: "v1.9.0" },
      facts: FIXTURE_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["og"], release: { templates: ["release-hero"] } },
      copy: deterministicCopy(FIXTURE_FACTS),
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.files.length).toBe(1);
    await assertGolden("release-hero-og.png", result);
  });

  it("matches milestone og within 0.1% of pixels", async () => {
    const renderer = await createTakumiRenderer();
    const result = await generate({
      event: { kind: "milestone", metric: "stars", threshold: 1000 },
      facts: MILESTONE_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["og"] },
      copy: milestoneCopy(MILESTONE_FACTS, "stars", 1000),
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.files.length).toBe(1);
    await assertGolden("milestone-og.png", result);
  });

  it("matches a regression bench x card within 0.1% of pixels", async () => {
    const renderer = await createTakumiRenderer();
    const result = await generate({
      event: { kind: "bench", file: ".shipseal/bench.json" },
      facts: BENCH_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["x"] },
      copy: benchCopy(BENCH_FACTS),
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.files.length).toBe(1);
    await assertGolden("bench-x.png", result);
  });
  // S5 found that code indentation collapses without `whiteSpace: "pre"`.
  // This golden is the guard against that regression coming back silently.
  it("matches code-card x within 0.1% of pixels", async () => {
    const renderer = await createTakumiRenderer();
    const result = await generate({
      event: { kind: "release", tag: "v2.0.0", previousTag: "v1.9.0" },
      facts: FIXTURE_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["x"], release: { templates: ["code-card"] } },
      copy: deterministicCopy(FIXTURE_FACTS),
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.files.length).toBe(1);
    await assertGolden("code-card-x.png", result);
  });

  it("matches release-highlights x within 0.1% of pixels", async () => {
    const renderer = await createTakumiRenderer();
    const result = await generate({
      event: { kind: "release", tag: "v2.0.0", previousTag: "v1.9.0" },
      facts: FIXTURE_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["x"], release: { templates: ["release-highlights"] } },
      copy: deterministicCopy(FIXTURE_FACTS),
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.files.length).toBe(1);
    await assertGolden("release-highlights-x.png", result);
  });

  // Every template renders both themes (§14.3). Dark alone would let a light-theme
  // contrast or token regression ship unnoticed.
  it("matches release-hero og in the light theme within 0.1% of pixels", async () => {
    const renderer = await createTakumiRenderer();
    const result = await generate({
      event: { kind: "release", tag: "v2.0.0", previousTag: "v1.9.0" },
      facts: FIXTURE_FACTS,
      brand: FIXTURE_BRAND,
      config: { ...FIXTURE_CONFIG, formats: ["og"], release: { templates: ["release-hero"] } },
      copy: deterministicCopy(FIXTURE_FACTS),
      copyMode: "deterministic",
      renderer,
      themes: ["light"],
      generatedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(result.files.length).toBe(1);
    await assertGolden("release-hero-og-light.png", result);
  });
});

/**
 * Story pages are pinned because their layout is composed rather than stacked: the title and
 * body are centred as one block, the body lines up with the title, and monospace bodies are
 * sized from their widest line. None of that is visible to a unit test.
 */
describe("golden images: story pages", () => {
  const generatedAt = "2026-09-11T10:00:00.000Z";

  async function renderStoryPage(kind: string): Promise<GenerateResult> {
    const facts = storyFacts(FIXTURE_FACTS, DEFAULT_CONFIG, FIXTURE_BRAND, generatedAt);
    const page = (facts.story ?? []).find((item) => item.kind === kind);
    expect(page, `story has no ${kind} page`).toBeDefined();
    const renderer = await createTakumiRenderer();
    const result = await generate({
      event: { kind: "release", tag: "v2.0.0", previousTag: "v1.9.0" },
      facts: { ...facts, story: page === undefined ? [] : [page] },
      brand: FIXTURE_BRAND,
      config: {
        ...FIXTURE_CONFIG,
        formats: ["portrait"],
        release: { templates: ["story-page"] },
      },
      copy: deterministicCopy(FIXTURE_FACTS),
      copyMode: "deterministic",
      renderer,
      themes: ["dark"],
      generatedAt,
    });
    return result;
  }

  it("matches the story cover, where short text is centred rather than stacked at the top", async () => {
    const result = await renderStoryPage("cover");
    expect(result.files.length).toBe(1);
    await assertGolden("story-cover-portrait.png", result);
  });

  it("matches the story code page, whose monospace body is sized to its widest line", async () => {
    const result = await renderStoryPage("code");
    expect(result.files.length).toBe(1);
    await assertGolden("story-code-portrait.png", result);
  });
});

async function assertGolden(name: string, result: GenerateResult): Promise<void> {
  const file = result.files[0];
  expect(file).toBeDefined();
  if (file === undefined) {
    return;
  }
  const goldenPath = join(GOLDEN_DIR, name);
  if (process.env.UPDATE_GOLDEN === "1") {
    await mkdir(GOLDEN_DIR, { recursive: true });
    await writeFile(goldenPath, file.bytes);
    return;
  }
  const golden = PNG.sync.read(await readFile(goldenPath));
  const actual = PNG.sync.read(Buffer.from(file.bytes));
  expect(actual.width).toBe(golden.width);
  expect(actual.height).toBe(golden.height);
  const diff = new PNG({ width: golden.width, height: golden.height });
  const mismatched = pixelmatch(actual.data, golden.data, diff.data, golden.width, golden.height, {
    threshold: 0.1,
  });
  const ratio = mismatched / (golden.width * golden.height);
  expect(ratio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
}
