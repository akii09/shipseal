// No-LLM copy rules (default path)
// Spec: docs/PROJECT_PLAN.md §13.2

import type { Facts } from "../facts/schema.js";
import { MAX_HIGHLIGHTS, type Copy } from "./slots.js";
import { isHeadlineWorthy } from "./headline.js";

export function deterministicCopy(
  facts: Facts,
  maxHighlights = MAX_HIGHLIGHTS,
  // The card shows the brand wordmark beside the headline. Falling back to the raw project
  // fact put "shipseal 0.0.8" under "Shipseal" on the same card.
  displayName?: string,
): Copy {
  const name = facts.project.name.value;
  const version = facts.release?.version.value;
  const features = (facts.release?.features ?? []).map((item) => item.value);
  const fixes = (facts.release?.fixes ?? []).map((item) => item.value);
  const breaking = (facts.release?.breaking ?? []).map((item) => item.value);

  // Breaking changes lead, then features. Fixes are deliberately excluded: every Changesets
  // "Patch Changes" entry maps to a fix, so including them put a maintainer's note on the hero.
  // v0.0.6 announced itself as "Never put a truncated headline on a card", which reads as a
  // strange instruction rather than a release, and nobody posts that. A release with only fixes
  // is better titled by its name and version.
  //
  // Prefer the first entry whose opening sentence actually fits. Taking the first sentence is
  // not enough on its own: a single long sentence still overflowed, and the v0.0.5 card shipped
  // with a headline truncated mid-phrase.
  // Fits, and reads like a change. Length alone let "Adam Chmara" and "/api" onto cards.
  const headlineSource = [...breaking, ...features]
    .map((line) => cleanLine(firstSentence(line)))
    .find((line) => line.length <= HEADLINE_MAX_CHARS && isHeadlineWorthy(line));
  const title = displayName ?? name;
  const headline =
    facts.release?.headline?.value ??
    headlineSource ??
    (version === undefined ? title : `${title} ${version}`);

  const tagline = facts.release?.subheadline?.value ?? facts.project.tagline?.value;
  const subheadline =
    tagline !== undefined && tagline.length > 0
      ? cleanLine(tagline)
      : cleanLine(features[1] ?? fixes[1] ?? fixes[0] ?? `What's new in ${version ?? name}`);

  // One sentence per highlight, for the same reason the headline takes one: changelog entries
  // are prose paragraphs, so whole entries could only be truncated mid-word on a card.
  const highlights: string[] = [];
  const addHighlight = (line: string, prefix = ""): void => {
    if (highlights.length >= maxHighlights) {
      return;
    }
    highlights.push(`${prefix}${cleanLine(firstSentence(line))}`);
  };
  for (const line of breaking) {
    addHighlight(line, "Breaking: ");
  }
  for (const line of features) {
    addHighlight(line);
  }
  for (const line of fixes) {
    addHighlight(line);
  }

  const copy: Copy = {
    headline,
    subheadline,
    highlights,
    cta: ctaFor(facts),
  };
  const snippet = facts.release?.codeSnippet?.value.code;
  if (snippet !== undefined && isInstallOnly(snippet)) {
    copy.codeTitle = "Get started";
  }
  return copy;
}

/**
 * Is this snippet nothing but install commands?
 *
 * Pairing "npm i thing" with a release headline reads as though the release was about
 * installing, which is how v0.0.6 shipped a bug-fix headline over the README's install block.
 * Install commands are still worth showing, they just need their own title.
 */
const INSTALL_COMMAND =
  /^\s*(?:\$\s*)?(?:npm\s+(?:i|install|add)|pnpm\s+(?:i|install|add|dlx)|yarn\s+(?:add|install)|bun\s+(?:a|add|install)|npx|deno\s+add|pip\s+install|cargo\s+add|go\s+get|gem\s+install|brew\s+install)\b/;

export function isInstallOnly(code: string): boolean {
  const lines = code
    .split("\n")
    .map((line) => line.replace(/\s+#.*$/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  return lines.length > 0 && lines.every((line) => INSTALL_COMMAND.test(line));
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function milestoneCopy(
  facts: Facts,
  metric: "stars" | "downloads" | "contributors",
  threshold: number,
): Copy {
  const formatted = formatCount(threshold);
  const line =
    metric === "stars"
      ? `Thank you for ${formatted} stars`
      : metric === "downloads"
        ? `${formatted} weekly downloads`
        : `Thank you, ${formatted} contributors`;
  const tagline = facts.project.tagline?.value;
  return {
    headline: facts.project.name.value,
    subheadline: tagline !== undefined && tagline.length > 0 ? cleanLine(tagline) : "",
    highlights: [],
    cta: ctaFor(facts),
    milestoneLine: line,
  };
}

export function benchCopy(facts: Facts): Copy {
  const title = facts.bench?.title.value ?? facts.project.name.value;
  const note = facts.bench?.note?.value;
  return {
    headline: title,
    subheadline: note !== undefined && note.length > 0 ? note : (facts.project.tagline?.value ?? ""),
    highlights: [],
    cta: ctaFor(facts),
  };
}

/**
 * First sentence of an entry, for use as a headline.
 *
 * Changesets entries are prose paragraphs written for a changelog, so using one whole made a
 * headline that could only be truncated mid-word. The first sentence is the part a person
 * actually wrote as the summary. Abbreviations are not special-cased: a sentence ending is a
 * period followed by a space and a capital, which leaves "e.g. foo" and version numbers alone.
 */
export function firstSentence(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const match = /^(.+?[.?!])\s+[A-Z]/.exec(collapsed);
  return match?.[1] ?? collapsed;
}

/**
 * Longest headline that fits two lines at the minimum font size on a 1200 wide card.
 * Measured rather than guessed: §13.1 originally said 48, which rejects most real changelog
 * sentences, and the fitting pass comfortably handles more.
 */
const HEADLINE_MAX_CHARS = 72;

/**
 * Emoji ranges, removed from anything that reaches a card.
 *
 * No font we register carries these glyphs, so `\u{1F310} Human-friendly ...` (got's real
 * GitHub description) rendered a tofu box on shipseal.dev. Takumi ships an emoji helper, but it
 * rewrites each emoji into an <img> pointing at jsDelivr, and `generate()` does no network.
 *
 * The ranges deliberately start at U+2600, which keeps the textual symbols people put in real
 * product names: (c) U+00A9, (r) U+00AE and (tm) U+2122 all sit below it.
 */
// Alternation rather than one class: variation selectors and the zero-width joiner are
// combining marks, which lint rejects when mixed into a class with ordinary code points.
const EMOJI = /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|\u200D/gu;

export function stripEmoji(text: string): string {
  return text.replaceAll(EMOJI, "").replace(/\s+/g, " ").trim();
}

export function cleanLine(text: string): string {
  // Replace an em dash with a colon and swallow the space in front of it, so "shops \u2014 mobile"
  // becomes "shops: mobile" rather than "shops : mobile". Spaced en dashes become a comma for
  // the same reason: a bare hyphen with spaces reads like a stray dash on a card.
  const stripped = stripEmoji(text)
    .replace(/\s*\u2014\s*/g, ": ")
    .replace(/\s+\u2013\s+/g, ", ")
    .replaceAll("\u2013", "-")
    .replaceAll("!", ".")
    .replace(/\s+/g, " ")
    .trim();
  const noTrail = stripped.endsWith(".") ? stripped.slice(0, -1) : stripped;
  const first = noTrail.at(0);
  if (first === undefined) {
    return noTrail;
  }
  return first.toUpperCase() + noTrail.slice(1);
}

function ctaFor(facts: Facts): string {
  const npm = facts.project.npmPackage?.value;
  if (npm !== undefined && npm.length > 0) {
    // A package with a bin is run, not installed as a dependency. `@latest` because npx reuses
    // a cached copy otherwise, which is the footgun the README already warns about.
    return facts.project.cli?.value === true ? `npx ${npm}@latest` : `npm i ${npm}`;
  }
  const url = facts.project.url?.value ?? facts.project.repo?.value;
  if (url === undefined) {
    return facts.project.name.value;
  }
  return url.replace(/^https?:\/\//, "");
}
