---
"shipseal": patch
---

Find the published package in a workspace. On a monorepo whose root package is private, the call
to action fell back to the repository URL even when the repo publishes to npm, because nothing
looked in `packages` or `apps`. Shipseal now uses the single publishable package it finds there,
and checks the registry knows the name before putting an install command on a card. When more
than one package is publishable the choice would be a guess, so pass `--package` to settle it.

Prefer what a project declares over what is derived from its checkout. A `homepage` or
`repository` in package.json now wins over the origin remote, which may point at a fork, a mirror
or an SSH alias.
