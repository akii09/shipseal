// No-LLM copy rules (default path)
// Spec: docs/PROJECT_PLAN.md §13.2

import type { Facts } from "../facts/schema.js";
import { MAX_HIGHLIGHTS, type Copy } from "./slots.js";

export function deterministicCopy(facts: Facts, maxHighlights = MAX_HIGHLIGHTS): Copy {
  const name = facts.project.name.value;
  const version = facts.release?.version.value;
  const features = (facts.release?.features ?? []).map((item) => item.value);
  const fixes = (facts.release?.fixes ?? []).map((item) => item.value);
  const breaking = (facts.release?.breaking ?? []).map((item) => item.value);

  // Breaking changes lead, then features, then fixes. Looking only at features meant a
  // patch release (every Changesets "Patch Changes" entry maps to a fix) fell through to
  // "{name} {version}", or worse, to a raw commit subject when git was the only source.
  // Prefer the first entry whose opening sentence actually fits a headline. Taking the first
  // sentence is not enough on its own: a single long sentence still overflowed, and the
  // v0.0.5 card shipped with a headline truncated mid-phrase. A release with nothing short
  // enough to say is better titled by its name and version than by a cut-off sentence.
  const headlineSource = [...breaking, ...features, ...fixes]
    .map((line) => cleanLine(firstSentence(line)))
    .find((line) => line.length <= HEADLINE_MAX_CHARS);
  const headline =
    headlineSource ?? (version === undefined ? name : `${name} ${version}`);

  const tagline = facts.project.tagline?.value;
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

  return {
    headline,
    subheadline,
    highlights,
    cta: ctaFor(facts),
  };
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

export function cleanLine(text: string): string {
  // Replace an em dash with a colon and swallow the space in front of it, so "shops \u2014 mobile"
  // becomes "shops: mobile" rather than "shops : mobile". Spaced en dashes become a comma for
  // the same reason: a bare hyphen with spaces reads like a stray dash on a card.
  const stripped = text
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
    return `npm i ${npm}`;
  }
  const url = facts.project.url?.value ?? facts.project.repo?.value;
  if (url === undefined) {
    return facts.project.name.value;
  }
  return url.replace(/^https?:\/\//, "");
}
