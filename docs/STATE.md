# State

Where Shipseal actually is. Read this before `PROJECT_PLAN.md`: the plan describes the design,
this file describes the repository as it stands.

> Last verified **2026-09-12** by running `pnpm lint && pnpm typecheck && pnpm test` and rendering
> a real pack. If that date is more than a few weeks old, trust the repository and say so.

## Facts

| | |
|---|---|
| Version | `0.0.8` in `packages/shipseal/package.json`, tag `v0.0.8`, npm `0.0.8` |
| Phases | 1 to 3 done and verified. Phase 4 (launch) in progress |
| Tests | 17 files, 147 tests, 6 of them golden images |
| Published by | `publish.yml` over OIDC, no npm token exists anywhere |
| External adopters | **None yet.** See `adopters.md`. This is the gating number for launch |

## What works end to end

`shipseal init`, `release`, `milestone`, `bench`, `doctor`. The composite Action runs on a
published release and attaches the pack. Shipseal generates its own release cards, and dogfooding
has found more bugs than the test suite has.

Five templates: `release-hero`, `release-highlights`, `code-card`, `milestone`, `bench`. Four
formats render: `og`, `github-social`, `x`, `linkedin`. `square`, `portrait`, `producthunt` and
`readme-banner` exist in `formats.ts` but **no template declares them**, enforced by a test.

## Invariants worth knowing before you change anything

- **`mergeFacts` fills holes, so the first source in the `parts` array wins.** Declared beats
  derived: package.json before the git remote. Adding a new fact also means adding it to the
  builder in `merge.ts`, or it is silently dropped.
- **A fix is never a headline.** Every Changesets patch entry maps to a fix, so a patch release
  falls back to `"{brand name} {version}"`. Override with `--headline`, `release.headline`, or a
  `<!-- shipseal: headline "..." -->` marker in the release notes.
- **Numbers on a card come from facts, never from a model.** The seal stamp
  (`templates/primitives/seal.ts`) follows this: a missing fact drops its segment.
- **Versions in `apps/docs/src` are generated or pinned.** A hardcoded version fails
  `docs-versions.test.ts` unless it sits in a `shipseal:pinned` region explaining why. The
  homepage output tree and the action references are rewritten by `refresh-showcase.mjs` during
  `pnpm release`.
- **`check:action-ref` runs in CI** and fails when a documented `akii09/shipseal@<ref>` does not
  resolve. Changelogs are excluded: they are history, not instructions.

## Recently closed

From the 2026-09-12 review (`REVIEW_2026-09-12.md`), in order of ID: G2 release significance,
G3 headline overrides, G4 honest output listing, G7 card design and the seal stamp, G8 code card
snippet and title, G9 npm package detection in a workspace, G12 adopters file, G13 spelling.

G15 was closed by decision: the plan and the site now describe competitors by category rather than
by name.

## Open, and who can do it

| | |
|---|---|
| **G5, G11** | Get 3 external repositories running the Action. Needs real maintainers, not code. The Phase 4 gate |
| **G1** | Cut a minor release with a user-facing feature and regenerate the showcase from it. G2 removed the worst symptom, but every showcase card is still from a patch |
| **G6** | Show milestone and bench cards in the README and on the site |
| **G10, G14** | Marketplace listing, launch assets. G14 needs a template that declares `producthunt` |
| Partial G8 | Snippets come from the release section, not the specific entry the headline used. Fixing it changes the facts schema, so the manifest shape, so it needs the owner's sign-off |
| Security | Only `publish.yml` pins actions to commit SHAs. `ci.yml`, `version.yml`, `shipseal.yml` and `action.yml` still use mutable tags |
| Cleanup | `scripts/scaffold.sh` looks vestigial: a one-shot bootstrap that skips existing files and still pins `actions/checkout@v4` |

## Hard rules that trip agents up

`AGENTS.md` is binding. The three that catch people most often: never commit, push or tag; no em
dashes anywhere; never run `pnpm test:update-golden` without the owner asking. Read `AGENTS.md`
before touching anything.
