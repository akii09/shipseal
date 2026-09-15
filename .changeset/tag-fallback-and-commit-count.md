---
"shipseal": minor
---

Repositories that tag without publishing releases now work, and the seal regains its commit count.

A project that ships git tags and no GitHub Releases used to be rejected outright. The newest
version tags are used instead, ordered by version rather than by whatever order GitHub returns.
Snapshot tags that are not versions are ignored, so a 2011 weekly build cannot be mistaken for the
current release. A release built from a tag carries no notes, and the manifest says so.

The commit count is back on cards built from a public repository. It comes from comparing the
release against the previous one, which stays inside the same package in a monorepo and against
the previous stable release rather than against its own beta.

Prerelease detection understands the spellings projects use, including `v3.15.0a8` and
`v3.15.0rc2`, so the demo opens on a stable release.
