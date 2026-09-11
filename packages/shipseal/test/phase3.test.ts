import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changePhrase, percentChange } from "../src/bench/percent.js";
import { highestCrossed, selectMilestone } from "../src/commands/milestone.js";
import { DEFAULT_CONFIG } from "../src/config/schema.js";
import { jobSummaryMarkdown, uploadReleaseAssets } from "../src/outputs/github-release.js";
import { eventId, resolveOutputDir } from "../src/outputs/files.js";
import { MILESTONE_FACTS } from "./helpers/facts.js";

describe("percentChange", () => {
  it("treats lower-is-better improvements as positive and regressions as negative", () => {
    expect(percentChange(420, 87, "lower")).toEqual({ signed: 79, absPercent: 79, regression: false });
    expect(percentChange(87, 98, "lower")).toEqual({ signed: -13, absPercent: 13, regression: true });
    expect(changePhrase("ms", "lower", percentChange(87, 98, "lower"))).toBe("13% slower");
  });

  it("does not divide by zero when before is 0", () => {
    expect(percentChange(0, 0, "lower")).toEqual({ signed: 0, absPercent: 0, regression: false });
    expect(percentChange(0, 10, "lower").regression).toBe(true);
    expect(percentChange(0, 10, "higher").regression).toBe(false);
  });
});

describe("selectMilestone", () => {
  it("picks the highest crossed stars threshold", () => {
    expect(highestCrossed([100, 250, 500, 1000, 2500], 1042)).toBe(1000);
    const selected = selectMilestone(MILESTONE_FACTS, DEFAULT_CONFIG, "stars", undefined);
    expect(selected).toEqual({ metric: "stars", threshold: 1000 });
  });

  it("returns undefined when nothing is crossed", () => {
    expect(highestCrossed([5000, 10000], 1042)).toBeUndefined();
  });
});

describe("eventId", () => {
  it("uses the date for bench packs", () => {
    expect(eventId({ kind: "bench", file: ".shipseal/bench.json" }, "2026-09-11T10:00:00.000Z")).toBe(
      "bench-2026-09-11",
    );
    expect(eventId({ kind: "milestone", metric: "stars", threshold: 1000 })).toBe("milestone-stars-1000");
  });
});

describe("resolveOutputDir", () => {
  it("resolves a relative output dir against cwd and leaves absolute paths", () => {
    expect(resolveOutputDir("/repo/pdfx", ".shipseal/output")).toBe(join("/repo/pdfx", ".shipseal/output"));
    expect(resolveOutputDir("/repo/pdfx", "/tmp/out")).toBe("/tmp/out");
  });
});

describe("github-release", () => {
  it("calls gh release upload with --clobber", async () => {
    const seen: string[][] = [];
    await uploadReleaseAssets({
      tag: "v2.0.0",
      files: ["/tmp/hero.png"],
      exec: async (_file, args) => {
        seen.push(args);
        return { stdout: "", stderr: "" };
      },
    });
    expect(seen[0]).toEqual(["release", "upload", "v2.0.0", "/tmp/hero.png", "--clobber"]);
  });

  it("lists facts in the job summary", () => {
    const markdown = jobSummaryMarkdown(
      {
        shipseal: "0.0.0",
        event: { kind: "milestone", metric: "stars", threshold: 1000 },
        generatedAt: "2026-09-11T10:00:00.000Z",
        brand: { name: "PDFx", theme: "dark", source: ".shipseal/brand.json" },
        copy: { mode: "deterministic" },
        files: [
          {
            path: "milestone-og.png",
            template: "milestone",
            format: "og",
            width: 1200,
            height: 630,
            bytes: 10,
            sha256: "abc",
          },
        ],
        facts: {
          "milestone.threshold": {
            value: 1000,
            source: "user-config",
            ref: "config.json milestones.stars",
            fetchedAt: "2026-09-11T10:00:00.000Z",
          },
        },
        computed: {},
        warnings: [],
        missing: [],
      },
      "/tmp/out",
    );
    expect(markdown).toContain("milestone.threshold");
    expect(markdown).toContain("1000");
  });
});
