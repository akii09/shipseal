import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type Config } from "../src/config/schema.js";
import { generateStory, storyFacts } from "../src/core/story.js";
import { fact } from "../src/facts/fact.js";
import type { Facts } from "../src/facts/schema.js";
import { FIXTURE_BRAND, FIXTURE_FACTS } from "./helpers/facts.js";

const generatedAt = "2026-09-13T09:00:00.000Z";

const withStory = (story: NonNullable<Config["release"]>["story"]): Config => ({
  ...DEFAULT_CONFIG,
  release: { ...DEFAULT_CONFIG.release, story },
});

const build = (facts: Facts = FIXTURE_FACTS, config: Config = DEFAULT_CONFIG) =>
  storyFacts(facts, config, FIXTURE_BRAND.name, generatedAt).story ?? [];

const kinds = (facts?: Facts, config?: Config) => build(facts, config).map((page) => page.kind);

describe("storyFacts page order", () => {
  it("runs cover, changes, code, then upgrade", () => {
    // Three changes in the fixture: two features and one fix.
    expect(kinds()).toEqual(["cover", "change", "change", "change", "code", "upgrade"]);
  });

  it("orders breaking changes before features and features before fixes", () => {
    const release = FIXTURE_FACTS.release;
    if (release === undefined) throw new Error("fixture release required");
    const facts: Facts = {
      ...FIXTURE_FACTS,
      release: {
        ...release,
        breaking: [fact("Drop Node 18", release.tag.provenance)],
      },
    };
    const titles = build(facts)
      .filter((page) => page.kind === "change")
      .map((page) => page.title.value);
    expect(titles[0]).toBe("Drop Node 18");
    expect(titles.at(-1)).toBe("Fix page break in nested views");
  });

  it("caps the change pages at release.maxHighlights", () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      release: { ...DEFAULT_CONFIG.release, maxHighlights: 1 },
    };
    expect(kinds(FIXTURE_FACTS, config)).toEqual(["cover", "change", "code", "upgrade"]);
  });

  it("omits the code page when the release has no snippet", () => {
    const release = FIXTURE_FACTS.release;
    if (release === undefined) throw new Error("fixture release required");
    const { codeSnippet: _codeSnippet, ...withoutSnippet } = release;
    expect(kinds({ ...FIXTURE_FACTS, release: withoutSnippet })).not.toContain("code");
  });
});

describe("storyFacts provenance", () => {
  it("traces the cover headline to the change it was taken from, never to a model", () => {
    const cover = build()[0];
    expect(cover?.kind).toBe("cover");
    expect(cover?.title.provenance.source).toBe("changelog");
    expect(cover?.title.provenance.ref).toBe("CHANGELOG.md Added");
  });

  it("carries each change page's own provenance", () => {
    for (const page of build().filter((item) => item.kind === "change")) {
      expect(page.title.provenance.source).toBe("changelog");
      expect(page.body.provenance.ref).toMatch(/CHANGELOG\.md/);
    }
  });

  it("marks configured upgrade text as user-config", () => {
    const pages = build(FIXTURE_FACTS, withStory({ upgrade: "pnpm add pdfx@2" }));
    const upgrade = pages.at(-1);
    expect(upgrade?.kind).toBe("upgrade");
    expect(upgrade?.title.value).toBe("How to upgrade");
    expect(upgrade?.body.value).toBe("pnpm add pdfx@2");
    expect(upgrade?.body.provenance).toMatchObject({
      source: "user-config",
      ref: "release.story.upgrade",
      fetchedAt: generatedAt,
    });
  });
});

describe("storyFacts upgrade page", () => {
  it("links the release notes rather than inventing an install command", () => {
    const upgrade = build().at(-1);
    expect(upgrade?.title.value).toBe("Get the release");
    expect(upgrade?.body.value).toBe(
      "Read the release notes at github.com/akii09/pdfx/releases/tag/v2.0.0",
    );
    // An upgrade command would be a claim the manifest cannot back: the next version may
    // be breaking and the package manager is unknown.
    expect(upgrade?.body.value).not.toMatch(/install|add |npm |pnpm |yarn /);
  });

  it("percent-encodes a tag that is not URL safe", () => {
    const release = FIXTURE_FACTS.release;
    if (release === undefined) throw new Error("fixture release required");
    const facts: Facts = {
      ...FIXTURE_FACTS,
      release: { ...release, tag: fact("v2.0.0+build/1", release.tag.provenance) },
    };
    expect(build(facts).at(-1)?.body.value).toContain("v2.0.0%2Bbuild%2F1");
  });

  it("keeps a supplied command verbatim, without prose capitalisation or joined lines", () => {
    const command = "pnpm add pdfx@2\npnpm pdfx migrate";
    const upgrade = build(FIXTURE_FACTS, withStory({ upgrade: command })).at(-1);
    // cleanLine would return "Pnpm add pdfx@2 pnpm pdfx migrate", which does not run.
    expect(upgrade?.body.value).toBe(command);
  });

  it("treats whitespace-only upgrade text as absent in both the title and the body", () => {
    const upgrade = build(FIXTURE_FACTS, withStory({ upgrade: "   " })).at(-1);
    expect(upgrade?.title.value).toBe("Get the release");
    expect(upgrade?.body.value).toContain("Read the release notes");
  });
});

describe("storyFacts comparison page", () => {
  it("adds a comparison only when both screenshots are configured", () => {
    const both = withStory({ before: "docs/before.png", after: "docs/after.png" });
    expect(kinds(FIXTURE_FACTS, both)).toContain("comparison");

    const comparison = build(FIXTURE_FACTS, both).find((page) => page.kind === "comparison");
    expect(comparison?.before?.value).toBe("docs/before.png");
    expect(comparison?.after?.value).toBe("docs/after.png");
    expect(comparison?.before?.provenance.source).toBe("user-config");
  });

  it("places the comparison after the code page and before the upgrade page", () => {
    const order = kinds(
      FIXTURE_FACTS,
      withStory({ before: "docs/before.png", after: "docs/after.png" }),
    );
    expect(order.indexOf("comparison")).toBeGreaterThan(order.indexOf("code"));
    expect(order.indexOf("comparison")).toBeLessThan(order.indexOf("upgrade"));
  });
});

describe("story failure paths", () => {
  it("refuses a story with no release facts", () => {
    const { release: _release, ...withoutRelease } = FIXTURE_FACTS;
    expect(() => storyFacts(withoutRelease, DEFAULT_CONFIG, "PDFx", generatedAt)).toThrowError(
      /No release facts are available/,
    );
  });

  const input = (formats: Config["formats"]) => ({
    event: { kind: "release" as const, tag: "v2.0.0" },
    facts: FIXTURE_FACTS,
    brand: FIXTURE_BRAND,
    config: { ...DEFAULT_CONFIG, formats },
    copy: { headline: "", subheadline: "", cta: "", highlights: [] },
    copyMode: "deterministic" as const,
    renderer: {
      fromJsx: () => {
        throw new Error("the format guard must reject before any render");
      },
      render: () => {
        throw new Error("the format guard must reject before any render");
      },
      measureText: () => {
        throw new Error("the format guard must reject before any render");
      },
    },
    themes: ["dark" as const],
    generatedAt,
  });

  it("refuses readme-banner, which has no story layout", async () => {
    // @ts-expect-error the renderer stub only needs to prove it is never called
    await expect(generateStory(input(["portrait", "readme-banner"]))).rejects.toThrowError(
      /readme-banner/,
    );
  });

  it("refuses an empty format list", async () => {
    // @ts-expect-error the renderer stub only needs to prove it is never called
    await expect(generateStory(input([]))).rejects.toThrowError(/no supported output/);
  });
});
