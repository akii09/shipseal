// One cleaner for every line that becomes card text, whatever source it came from.
//
// There used to be two. `cleanChangelogItem` stripped fourteen patterns for the CLI path and
// `cleanBullet` stripped five for the browser demo, so a GitHub release body kept the things a
// CHANGELOG entry had removed. oven-sh/bun rendered a card headlined "@dylan-conway", a
// contributor's handle, and astral-sh/ruff kept backslash-escaped brackets. Same input shape,
// two different answers, because the rules lived in two places.

/** Markdown escapes a maintainer never meant to see rendered: \[ruff\] becomes [ruff]. */
const MARKDOWN_ESCAPE = /\\([[\]()*_`~#+\-.!])/g;

export function cleanReleaseLine(item: string): string {
  return (
    item
      .replace(/^\s*[-*]\s*/, "")
      // Commit and pull request references: a card is not an audit trail.
      .replace(/\[`[a-f0-9]{7,40}`]\([^)]+\)/gi, "")
      .replace(/^[a-f0-9]{7,40}:\s*/i, "")
      .replace(/\(#\d+\)/g, "")
      .replace(/\[#\d+]\([^)]+\)/g, "")
      .replace(/#\d+\b/g, "")
      // Credit lines. These are why a handle became a headline.
      .replace(/Thanks\s+\[@[\w-]+]\([^)]+\)!?\s*-?\s*/gi, "")
      .replace(/\[@[\w-]+]\([^)]+\)/g, "")
      .replace(/\(@[\w-]+\)/g, "")
      .replace(/\s+by\s+@[\w-]+/gi, "")
      .replace(/@[\w-]+/g, "")
      .replace(/^Thanks\s*!?\s*-?\s*/i, "")
      // Markdown: images dropped, links reduced to their text, HTML and emphasis removed.
      .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replaceAll(/<[^>]*>/g, "")
      .replaceAll(MARKDOWN_ESCAPE, "$1")
      .replaceAll(/[*`]/g, "")
      // After links are reduced: `([4379bf0](url))` only looks like a bare hash by this point.
      .replaceAll(/\(\s*[a-f0-9]{6,40}\s*\)/gi, "")
      // Leading scope labels, as in "[/lightbox] Add option to ...".
      .replace(/^\[[^\]]{1,24}\]\s*/, "")
      .replace(/^\s*[-*]\s*/, "")
      // Whatever the removals left behind.
      .replace(/\s*\(\s*\)/g, "")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[\s,;:-]+$/, "")
      .replace(/\.$/, "")
  );
}
