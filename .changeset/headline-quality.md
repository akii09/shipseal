---
"shipseal": patch
---

Headlines no longer come out as names, fragments or chores.

Rendering fourteen public repositories showed eight cards nobody would post. One was headlined with
a contributor's full name, several with package fragments like `/api` or `Ui` taken from a
changesets body, and one with a `Chore:` entry that was mostly a URL. A release line now has to
read like a description of a change before it can be a headline, and a release with nothing
suitable falls back to the project and version, which is dull but always right.

Version badges read correctly for scoped and prefixed tags: `@novu/react@v3.19.2` shows 3.19.2, and
a tag that carries no version, such as a dated release train, is left alone rather than reduced to
a fragment of itself. Leading scope labels and commit hashes in parentheses are removed from card
text.
