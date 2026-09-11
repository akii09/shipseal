import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { benchCopy, deterministicCopy, milestoneCopy } from "../../src/copy/deterministic.js";
import { generate } from "../../src/core/generate.js";
import type { GenerateResult } from "../../src/core/generate.js";
import { createTakumiRenderer } from "../../src/render/takumi.js";
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
