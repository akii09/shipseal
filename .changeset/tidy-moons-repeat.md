---
"shipseal": patch
---

Fix `bench` and `milestone` failing on any project that has a version in `package.json` but no
git tag. Partial release facts are no longer treated as an error, since neither command needs
release facts.

Read npm's shorthand `repository` forms (`github:owner/repo` and `owner/repo`), so `milestone`
can fetch stars for projects that use them. Previously only full `github.com` URLs worked.
