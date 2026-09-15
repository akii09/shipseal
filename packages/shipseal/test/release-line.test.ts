/**
 * The survey on 2026-09-15 ran 20 public repositories through the demo path. Two rendered cards
 * nobody would post, both because the browser path cleaned less than the CHANGELOG path did.
 * Each case below is a real release body from that survey.
 */
import { describe, expect, it } from "vitest";
import { cleanReleaseLine } from "../src/sources/release-line.js";
import { cleanChangelogItem } from "../src/sources/changelog.js";

describe("cleanReleaseLine", () => {
  it("does not let a contributor handle become the headline", () => {
    // oven-sh/bun rendered a card whose headline was "@dylan-conway".
    expect(cleanReleaseLine("- @dylan-conway")).toBe("");
    expect(cleanReleaseLine("- Fix crash in bundler by @dylan-conway")).toBe("Fix crash in bundler");
    expect(cleanReleaseLine("- Thanks [@jarred](https://github.com/jarred)! Fix the resolver")).toBe(
      "Fix the resolver",
    );
  });

  it("unescapes markdown a maintainer never meant to show", () => {
    // astral-sh/ruff rendered "\\[ruff\\] Recognize re.prefixmatch".
    expect(cleanReleaseLine("- Recognize \\[re.prefixmatch\\] calls")).toBe(
      "Recognize [re.prefixmatch] calls",
    );
  });

  it("drops a leading scope label, which is routing rather than news", () => {
    // mantinedev/mantine rendered "[/ligtbox] Add option to render custom thumbnails",
    // including their own typo. astral-sh/ruff prefixes every entry with "[ruff]".
    expect(cleanReleaseLine("- [/ligtbox] Add option to render custom thumbnails")).toBe(
      "Add option to render custom thumbnails",
    );
    expect(cleanReleaseLine("- \\[ruff\\] Recognize re.prefixmatch")).toBe(
      "Recognize re.prefixmatch",
    );
  });

  it("removes commit and pull request references", () => {
    expect(cleanReleaseLine("- Add story packs (#123)")).toBe("Add story packs");
    expect(cleanReleaseLine("- Add story packs #123")).toBe("Add story packs");
    expect(cleanReleaseLine("- [#99](https://x.dev/99) Fix the seal")).toBe("Fix the seal");
    expect(cleanReleaseLine("abc1234: Fix the seal")).toBe("Fix the seal");
    // payloadcms/payload rendered "Improve access defaults for jobs (4379bf".
    expect(cleanReleaseLine("- Improve access defaults for jobs (4379bf)")).toBe(
      "Improve access defaults for jobs",
    );
  });

  it("reduces links to their text and drops images and HTML", () => {
    expect(cleanReleaseLine("- Add [story packs](https://x.dev) now")).toBe("Add story packs now");
    expect(cleanReleaseLine("- Add ![shot](a.png) story packs")).toBe("Add story packs");
    expect(cleanReleaseLine("- Add <b>story</b> packs")).toBe("Add story packs");
  });

  it("does not leave the punctuation its removals orphaned", () => {
    // "Fix the resolver (#12)" used to leave "Fix the resolver ()" once the ref went.
    expect(cleanReleaseLine("- Fix the resolver ()")).toBe("Fix the resolver");
    expect(cleanReleaseLine("- Fix the resolver ,")).toBe("Fix the resolver");
    expect(cleanReleaseLine("- Fix the resolver -")).toBe("Fix the resolver");
  });

  it("leaves an ordinary entry alone apart from its trailing period", () => {
    expect(cleanReleaseLine("- Add QR and barcode support.")).toBe("Add QR and barcode support");
  });

  it("is the single implementation both sources use", () => {
    // The two paths disagreed for months. Delegation is what stops that recurring.
    const raw = "- Fix the resolver (#42) by @someone";
    expect(cleanChangelogItem(raw)).toBe(cleanReleaseLine(raw));
    expect(cleanChangelogItem(raw)).toBe("Fix the resolver");
  });
});
