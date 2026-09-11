---
"shipseal": patch
---

Write headlines from changelog entries instead of raw commit subjects. A release whose
changelog holds only patch entries fell through to a git commit message, because the headline
rule looked at features alone. It now prefers a breaking change, then a feature, then a fix,
and takes only the first sentence, since changeset entries are prose paragraphs rather than
headlines.

Find a changelog inside `packages/*` and `apps/*` when the repository root has none, which is
where Changesets writes it in a monorepo.

Read the repository from `git remote get-url origin`. A monorepo root often has no `homepage`
or `repository` in its private package.json, which left the call to action showing the
workspace name.
