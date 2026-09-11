# Changesets

Version bumps and the changelog are driven from this folder. See `docs/RELEASING.md` for the
full flow.

Add a changeset in the same pull request as the change it describes:

```bash
pnpm changeset
```

Pick `patch`, `minor` or `major`, then write one or two plain sentences about what changed for
the user. That text lands verbatim in `CHANGELOG.md`, so write it for someone reading the
release notes, not for a reviewer reading the diff.

No em dashes, per `AGENTS.md`.

A change with no user-visible effect (refactors, tests, internal docs) needs no changeset.
