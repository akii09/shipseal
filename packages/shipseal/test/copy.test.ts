import { describe, expect, it } from "vitest";
import { cleanLine, deterministicCopy, milestoneCopy } from "../src/copy/deterministic.js";
import { llmCopy } from "../src/copy/llm.js";
import { allowedNumbers, guardCopy, unsourcedDigits } from "../src/copy/number-guard.js";
import { FIXTURE_FACTS, MILESTONE_FACTS } from "./helpers/facts.js";
import { fact } from "../src/facts/fact.js";
import type { Facts } from "../src/facts/schema.js";

const NOW = "2026-09-11T00:00:00.000Z";

describe("deterministic copy", () => {
  it("uses the first feature as the headline and interpolates npm cta", () => {
    const copy = deterministicCopy(FIXTURE_FACTS);
    expect(copy.headline).toBe("QR and barcode support");
    expect(copy.subheadline).toBe("React PDF components, shadcn style");
    expect(copy.highlights[0]).toBe("QR and barcode support");
    expect(copy.cta).toBe("npm i pdfx");
    expect(copy.headline.includes("\u2014")).toBe(false);
  });

  it("inserts the threshold with a locale grouping separator from code", () => {
    const copy = milestoneCopy(MILESTONE_FACTS, "stars", 1000);
    expect(copy.milestoneLine).toBe("Thank you for 1,000 stars");
    expect(unsourcedDigits(copy.milestoneLine ?? "", allowedNumbers(MILESTONE_FACTS))).toEqual([]);
  });
});

describe("number guard", () => {
  it("allows digits that come from facts and rejects invented ones", () => {
    const allowed = allowedNumbers(FIXTURE_FACTS);
    expect(unsourcedDigits("QR and barcode support", allowed)).toEqual([]);
    expect(unsourcedDigits("Thank you for 9999 stars", allowed)).toEqual(["9999"]);
    expect(unsourcedDigits("Thank you for 1,000 stars", allowedNumbers(MILESTONE_FACTS))).toEqual([]);
    const copy = deterministicCopy(FIXTURE_FACTS);
    expect(guardCopy(copy, FIXTURE_FACTS).ok).toBe(true);
    expect(guardCopy({ ...copy, headline: "We hit 9999 stars" }, FIXTURE_FACTS).ok).toBe(false);
  });
});

describe("llm copy", () => {
  it("falls back to deterministic copy when the number guard rejects", async () => {
    const result = await llmCopy(
      FIXTURE_FACTS,
      { apiKey: "test", model: "test", maxRetries: 0, fetchImpl: forbiddenNumbersFetch },
    );
    expect(result.mode).toBe("deterministic");
    expect(result.copy.headline).toBe("QR and barcode support");
  });

  it("accepts JSON that only uses placeholders for numbers", async () => {
    const result = await llmCopy(
      FIXTURE_FACTS,
      { apiKey: "test", model: "test", maxRetries: 0, fetchImpl: placeholderFetch },
    );
    expect(result.mode).toBe("llm");
    expect(result.copy.headline).toBe("QR support in 2.0.0");
  });
});

const forbiddenNumbersFetch: typeof fetch = async () =>
  jsonCompletion({
    headline: "We shipped 9999 things",
    subheadline: "Nope",
    highlights: ["We shipped 9999 things"],
    cta: "npm i pdfx",
  });

const placeholderFetch: typeof fetch = async () =>
  jsonCompletion({
    headline: "QR support in {version}",
    subheadline: "Scan codes in any component",
    highlights: ["New QR component"],
    cta: "npm i pdfx",
  });

function jsonCompletion(copy: {
  headline: string;
  subheadline: string;
  highlights: string[];
  cta: string;
}): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(copy) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("headline from changelog entries", () => {
  // Regression, caught on the real v0.0.2 card. Every Changesets "Patch Changes" entry maps
  // to a fix, and the headline only looked at features, so a patch release fell through to a
  // raw git commit subject. Changeset entries are also prose paragraphs, not headlines.
  const at = (value: string) =>
    fact(value, { source: "changelog" as const, ref: "CHANGELOG.md", fetchedAt: NOW });

  const withRelease = (over: Partial<Record<"features" | "fixes" | "breaking", string[]>>): Facts => ({
    ...FIXTURE_FACTS,
    release: {
      ...FIXTURE_FACTS.release,
      version: at("0.0.2"),
      tag: at("v0.0.2"),
      date: at("2026-09-11"),
      features: (over.features ?? []).map(at),
      fixes: (over.fixes ?? []).map(at),
      breaking: (over.breaking ?? []).map(at),
    },
  });

  it("uses a fix when there are no features", () => {
    const copy = deterministicCopy(withRelease({ fixes: ["Fix brand detection on PNG logos"] }));
    expect(copy.headline).toBe("Fix brand detection on PNG logos");
  });

  it("prefers a breaking change over a feature or fix", () => {
    const copy = deterministicCopy(
      withRelease({ breaking: ["Drop Node 20"], features: ["Add bench cards"], fixes: ["Fix a typo"] }),
    );
    expect(copy.headline).toBe("Drop Node 20");
  });

  it("takes only the first sentence of a prose entry", () => {
    const copy = deterministicCopy(
      withRelease({
        fixes: [
          "Fix brand detection reading the wrong values out of a README. A `#` comment inside a code fence was read as the project name.",
        ],
      }),
    );
    expect(copy.headline).toBe("Fix brand detection reading the wrong values out of a README");
  });

  it("falls back to name and version when nothing is listed", () => {
    expect(deterministicCopy(withRelease({})).headline).toContain("0.0.2");
  });
});

describe("cleanLine punctuation", () => {
  // Caught on a real card: a README em dash became "shops : mobile" with a space before the
  // colon, because the replacement did not swallow the surrounding whitespace.
  it("turns an em dash into a colon with no space in front", () => {
    expect(cleanLine("AI marketing designer for small shops — mobile PWA")).toBe(
      "AI marketing designer for small shops: mobile PWA",
    );
  });

  it("turns a spaced en dash into a comma", () => {
    expect(cleanLine("Fast – and safe")).toBe("Fast, and safe");
  });

  it("keeps a hyphen inside a word", () => {
    expect(cleanLine("WhatsApp-first delivery")).toBe("WhatsApp-first delivery");
  });

  it("leaves an existing colon alone", () => {
    expect(cleanLine("Already: fine")).toBe("Already: fine");
  });
});
