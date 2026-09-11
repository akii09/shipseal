import { describe, expect, it } from "vitest";
import { deterministicCopy } from "../src/copy/deterministic.js";
import { llmCopy } from "../src/copy/llm.js";
import { allowedNumbers, guardCopy, unsourcedDigits } from "../src/copy/number-guard.js";
import { FIXTURE_FACTS } from "./helpers/facts.js";

describe("deterministic copy", () => {
  it("uses the first feature as the headline and interpolates npm cta", () => {
    const copy = deterministicCopy(FIXTURE_FACTS);
    expect(copy.headline).toBe("QR and barcode support");
    expect(copy.subheadline).toBe("React PDF components, shadcn style");
    expect(copy.highlights[0]).toBe("QR and barcode support");
    expect(copy.cta).toBe("npm i pdfx");
    expect(copy.headline.includes("\u2014")).toBe(false);
  });
});

describe("number guard", () => {
  it("allows digits that come from facts and rejects invented ones", () => {
    const allowed = allowedNumbers(FIXTURE_FACTS);
    expect(unsourcedDigits("QR and barcode support", allowed)).toEqual([]);
    expect(unsourcedDigits("Thank you for 9999 stars", allowed)).toEqual(["9999"]);
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
