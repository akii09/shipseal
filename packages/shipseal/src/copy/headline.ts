// Whether a release-note line can carry a card.
//
// Rendering fourteen real repositories on 2026-09-15 produced eight headlines nobody would post.
// novuhq/novu led with "Adam Chmara", a contributor's name. tanstack/query led with
// "/solid-query.0.0-rc.3", directus with "/api", vitest with "Ui". Changesets bodies in a
// monorepo are full of package fragments, and a release opened with credits puts a person's
// name where the release title belongs.
//
// The rule is deliberately conservative: reject what is clearly not a sentence about a change,
// and let the caller fall back to "{project} {version}", which is always correct if dull.

/** Below this a line is a fragment or a label, not a description of a change. */
const MIN_WORDS = 3;
const MIN_CHARS = 12;

/** Housekeeping prefixes. A chore is not what a release is about. */
const CHORE = /^(chore|docs?|ci|build|test|refactor|style|revert|bump|deps?|dependencies)\b[:(]?/i;

/** A line that is only a person's name: "Adam Chmara", "Jane Q. Smith". */
const PERSON_NAME = /^[A-Z][\p{L}'’-]+(?:\s+[A-Z][.\p{L}'’-]*){1,2}$/u;

/** Package-ish fragments: "/api", "@scope/pkg", "solid-query.0.0-rc.3", "v1.2.3". */
const FRAGMENT = /^[@/]|^v?\d+\.\d+|^[\w@/.-]+$/;

export function isHeadlineWorthy(line: string): boolean {
  const text = line.trim();
  if (text.length < MIN_CHARS || text.split(/\s+/).length < MIN_WORDS) {
    return false;
  }
  if (CHORE.test(text) || PERSON_NAME.test(text) || FRAGMENT.test(text)) {
    return false;
  }
  // A headline that is mostly a URL describes a link, not a change.
  return !/https?:\/\//.test(text);
}
