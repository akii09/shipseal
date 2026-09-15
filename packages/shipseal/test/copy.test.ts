import { describe, expect, it } from "vitest";
import {
  cleanLine,
  deterministicCopy,
  isInstallOnly,
  milestoneCopy,
  stripEmoji,
} from "../src/copy/deterministic.js";
import { llmCopy } from "../src/copy/llm.js";
import { allowedNumbers, guardCopy, unsourcedDigits } from "../src/copy/number-guard.js";
import { FIXTURE_FACTS, MILESTONE_FACTS } from "./helpers/facts.js";
import { fact } from "../src/facts/fact.js";
import { releaseKind } from "../src/sources/git.js";
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

  // G2: a fix is never the headline. v0.0.6 announced itself as "Never put a truncated headline
  // on a card", which reads as an instruction rather than a release. A fix-only release is
  // better titled by its name and version.
  it("never uses a fix as the headline, even when it is the only entry", () => {
    const copy = deterministicCopy(withRelease({ fixes: ["Fix brand detection on PNG logos"] }));
    expect(copy.headline).not.toContain("Fix brand detection");
    expect(copy.headline).toContain("0.0.2");
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
        features: [
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

describe("highlights from changelog entries", () => {
  // The v0.0.3 highlights card showed whole changelog paragraphs truncated mid-word, and one
  // bullet was a nested sub-item lifted out of its parent entry.
  const at = (v: string) => fact(v, { source: "changelog" as const, ref: "CHANGELOG.md", fetchedAt: NOW });
  const withRelease = (o: Partial<Record<"features" | "fixes" | "breaking", string[]>>): Facts => ({
    ...FIXTURE_FACTS,
    release: {
      ...FIXTURE_FACTS.release,
      version: at("0.0.3"),
      tag: at("v0.0.3"),
      date: at("2026-09-11"),
      features: (o.features ?? []).map(at),
      fixes: (o.fixes ?? []).map(at),
      breaking: (o.breaking ?? []).map(at),
    },
  });

  it("takes one sentence per highlight", () => {
    const copy = deterministicCopy(
      withRelease({
        fixes: ["Read theme colors from real stylesheets. Detection previously found nothing in several shapes."],
      }),
    );
    expect(copy.highlights[0]).toBe("Read theme colors from real stylesheets");
  });

  it("puts breaking changes first and labels them", () => {
    const copy = deterministicCopy(
      withRelease({ breaking: ["Drop Node 20"], features: ["Add bench cards"] }),
    );
    expect(copy.highlights[0]).toBe("Breaking: Drop Node 20");
    expect(copy.highlights[1]).toBe("Add bench cards");
  });
});

describe("headline length budget", () => {
  // The v0.0.5 hero card shipped with a headline truncated mid-phrase. Taking the first
  // sentence is not enough when that sentence is itself too long for the card.
  const at = (v: string) => fact(v, { source: "changelog" as const, ref: "CHANGELOG.md", fetchedAt: NOW });
  const withEntries = (lines: string[]): Facts => ({
    ...FIXTURE_FACTS,
    release: {
      ...FIXTURE_FACTS.release,
      version: at("0.0.5"),
      tag: at("v0.0.5"),
      date: at("2026-09-11"),
      features: lines.map(at),
      fixes: [],
      breaking: [],
    },
  });

  it("skips an entry that is too long and takes the next one that fits", () => {
    const copy = deterministicCopy(
      withEntries([
        "Write one sentence per highlight instead of a whole changelog paragraph, so entries fit the card rather than truncating mid-word",
        "Fold nested bullets into the entry above",
      ]),
    );
    expect(copy.headline).toBe("Fold nested bullets into the entry above");
  });

  it("falls back to name and version when nothing is short enough", () => {
    const copy = deterministicCopy(
      withEntries(["A sentence that runs on and on and on well past anything that could ever fit onto a release card headline"]),
    );
    expect(copy.headline).toContain("0.0.5");
  });

  it("keeps a headline that fits", () => {
    expect(deterministicCopy(withEntries(["Fix brand detection on PNG logos"])).headline).toBe(
      "Fix brand detection on PNG logos",
    );
  });
});

/**
 * G8: v0.0.6 shipped a code card pairing a bug-fix headline with the README's install block,
 * which read as though the release was about installing.
 */
describe("code card title", () => {
  it("recognises install commands, with prompts and trailing comments", () => {
    expect(isInstallOnly("npm i shipseal")).toBe(true);
    expect(isInstallOnly("$ pnpm add shipseal\nyarn add shipseal")).toBe(true);
    expect(isInstallOnly("npx shipseal@latest init  # detect your brand\nnpx shipseal release")).toBe(
      true,
    );
  });

  it("does not treat real code as an install command", () => {
    expect(isInstallOnly("const seal = await render(facts);")).toBe(false);
    expect(isInstallOnly("npm i shipseal\nseal.render();")).toBe(false);
    expect(isInstallOnly("")).toBe(false);
  });

  it("titles an install-only snippet Get started instead of reusing the headline", () => {
    const facts = {
      ...FIXTURE_FACTS,
      release: {
        ...FIXTURE_FACTS.release,
        codeSnippet: fact(
          { lang: "bash", code: "npm i demo" },
          { source: "readme", ref: "README.md first fenced code block", fetchedAt: "2026-09-11T00:00:00Z" },
        ),
      },
    };
    expect(deterministicCopy(facts, { kind: "release", tag: "v2.0.0" }).codeTitle).toBe("Get started");
  });

  it("leaves the headline in place when the snippet is real code", () => {
    const facts = {
      ...FIXTURE_FACTS,
      release: {
        ...FIXTURE_FACTS.release,
        codeSnippet: fact(
          { lang: "ts", code: "render({ facts });" },
          { source: "changelog", ref: "CHANGELOG.md ## 2.0.0 first fenced code block", fetchedAt: "2026-09-11T00:00:00Z" },
        ),
      },
    };
    expect(deterministicCopy(facts, { kind: "release", tag: "v2.0.0" }).codeTitle).toBeUndefined();
  });
});

/** G2: how significant a release is, derived from semver rather than asserted by a human. */
describe("releaseKind", () => {
  it("reads the bump from the two tags", () => {
    expect(releaseKind("v1.9.0", "v2.0.0")).toBe("major");
    expect(releaseKind("0.0.7", "0.1.0")).toBe("minor");
    expect(releaseKind("v0.0.7", "v0.0.8")).toBe("patch");
  });

  it("returns undefined rather than guessing", () => {
    expect(releaseKind("v0.0.7", "v0.0.7")).toBeUndefined();
    expect(releaseKind("nightly", "v0.0.8")).toBeUndefined();
  });
});

/** A package with a bin is run, not installed as a dependency. */
const withProject = (project: Partial<Facts["project"]>): Facts => ({
  ...FIXTURE_FACTS,
  project: { ...FIXTURE_FACTS.project, ...project },
});

describe("call to action", () => {
  const at = <T,>(v: T) => fact(v, { source: "package-json" as const, ref: "package.json", fetchedAt: NOW });

  it("uses npx for a CLI", () => {
    const copy = deterministicCopy(withProject({ npmPackage: at("demo"), cli: at(true) }));
    expect(copy.cta).toBe("npx demo@latest");
  });

  it("uses npm i for a library", () => {
    const copy = deterministicCopy(withProject({ npmPackage: at("demo") }));
    expect(copy.cta).toBe("npm i demo");
  });
});

describe("stripEmoji", () => {
  it("removes the emoji that rendered as a tofu box on shipseal.dev", () => {
    // sindresorhus/got's real GitHub description, which /try rendered with a missing glyph.
    expect(stripEmoji("\u{1F310} Human-friendly and powerful HTTP request library for Node.js")).toBe(
      "Human-friendly and powerful HTTP request library for Node.js",
    );
  });

  it("removes joined sequences, skin tones and dingbats without leaving gaps", () => {
    expect(stripEmoji("\u{1F468}‍\u{1F469}‍\u{1F467} family")).toBe("family");
    expect(stripEmoji("\u{1F44D}\u{1F3FD} nice")).toBe("nice");
    expect(stripEmoji("✅ Done ✓ now")).toBe("Done now");
  });

  it("keeps the textual marks that belong in real product names", () => {
    expect(stripEmoji("Acme™ © 2026 Acme®")).toBe("Acme™ © 2026 Acme®");
  });

  it("leaves ordinary text untouched", () => {
    expect(stripEmoji("no emoji here")).toBe("no emoji here");
  });

  it("is applied by cleanLine, so every card path is covered", () => {
    expect(cleanLine("\u{1F680} ships fast")).toBe("Ships fast");
  });
});
