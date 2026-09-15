# State

Where Shipseal actually is. Read this before `PROJECT_PLAN.md`: the plan describes the design,
this file describes the repository as it stands.

> Last verified **2026-09-15** by running `pnpm lint && pnpm typecheck && pnpm test && pnpm build`,
> rendering a real story pack in three styles, driving `preview` end to end, and rendering two
> public repositories through `/try` in a real browser. If that date is more than a few weeks old,
> trust the repository and say so.

## Facts

| | |
|---|---|
| Version | `0.4.1` pending in `packages/shipseal/package.json`. Released: tag `v0.4.0`, npm `0.4.0` |
| Phases | 1 to 3 done and verified. Phase 4 (launch) in progress |
| Tests | 26 files, 293 tests, 8 of them golden images |
| Published by | `publish.yml` over OIDC, no npm token exists anywhere |
| External adopters | **None yet.** One maintainer has replied (see `docs/adopters.md`), which surfaced the alt text gap. This is the gating number for launch |

## What works end to end

`shipseal init`, `release`, `story`, `preview`, `milestone`, `bench`, `doctor`. The composite
Action runs on a published release and attaches the pack. Shipseal generates its own release cards,
and dogfooding has found more bugs than the test suite has.

Six templates: `release-hero`, `release-highlights`, `code-card`, `milestone`, `bench`,
`story-page`. The first five render four landscape formats: `og`, `github-social`, `x`, `linkedin`.
`story-page` adds `square`, `portrait` and `producthunt`. `readme-banner` exists in `formats.ts`
and **no template declares it**, enforced by a test.

`shipseal story` writes PNGs, a PDF carousel (`outputs/downloads.ts`, hand-rolled, image-only) and
a deterministic STORE-only ZIP. `shipseal preview` serves the shared studio UI from
`src/studio/client.ts` over a token-authenticated localhost server and saves choices back to
`.shipseal`.

**`/try` works.** The same studio runs in the browser against any public GitHub repository, with
Takumi compiled to WASM, no account and no API key. Verified by rendering `akii09/shipseal` and
`vitejs/vite` in a real browser: the WASM binary, the bundled font and the rendered blobs all load,
and a repository with no brand file is told so rather than shown invented colors.

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
- **`story-page` is the only template allowed to declare a non-v1 format**, pinned by
  `formats.test.ts`. If it gains a size, or another template declares one, that test fails and the
  wording on the homepage, the templates page and §14.2 has to change with it.
- **A story page composes, it does not stack.** Title and body are one block centred in the space
  the header and footer leave, the body's left edge lines up with the title, and the title's font
  floor sits above the body's ceiling so a long title truncates with a warning instead of shrinking
  smaller than its own paragraph. `story-cover-portrait.png` and `story-code-portrait.png` pin it.
- **`scripts/` is tested now.** `test/scripts.test.ts` runs the release scripts as real processes
  against throwaway git repositories. It pins the two bugs that shipped invisibly: the temporary
  release tag must exist for *every* render (a stub that fails on the first render cannot tell the
  broken version apart, so the fake CLI records the tag at each call), and the showcase gate must
  block on version strings while letting changed cards through, or a release can never settle.
- **Emoji never reach a card.** No registered font carries them, so a repository description
  like got's rendered a tofu box on shipseal.dev. `stripEmoji` in `copy/deterministic.ts` runs
  inside `cleanLine` and at the three tagline sources that bypass it (`package-json`, `github`,
  `readme`). Takumi's emoji helper is not an option: it rewrites each emoji into an `<img>`
  pointing at jsDelivr, and `generate()` does no network.
- **Nothing the browser can reach may import a Node builtin.** `/try` imports this package
  directly, so one top-level `node:fs` is enough for Vite to externalize the module, throw on load
  and serve a blank page with no error. That is exactly what `render/takumi.ts` did for weeks while
  every gate stayed green. `test/browser-safe.test.ts` now walks the reachable import graph and
  fails on any `node:` import, and it also pins rule 3 (only `render/takumi.ts` imports Takumi).
- **Disk access for the renderer lives in `src/render/takumi-node.ts`,** not in `takumi.ts`.
  `takumi.ts` holds the adapter and the Takumi import; the Node half holds `resolvePackageRoot`
  and `createTakumiRenderer`. Commands import the factory from `takumi-node.js`.
- **`src/core/generate.ts` must not import a Node builtin.** The browser demo imports
  `generate()`, which is why the file digests with WebCrypto rather than `node:crypto`.
- **`src/studio/client.ts` must have no runtime imports.** It is bundled on its own as
  `dist/studio-client.js` and served to the browser; importing the schema would pull zod and the
  whole render pipeline in with it. Its format list is kept in step with `selectionSchema` by hand.
- **A story page's body is the change entry minus its first sentence**, because the first sentence
  is already the page title. Passing the whole entry printed it twice.

## Recently closed

From the 2026-09-12 review (`REVIEW_2026-09-12.md`), in order of ID: G2 release significance,
G3 headline overrides, G4 honest output listing, G7 card design and the seal stamp, G8 code card
snippet and title, G9 npm package detection in a workspace, G12 adopters file, G13 spelling.

G15 was closed by decision: the plan and the site now describe competitors by category rather than
by name.

## Open, and who can do it

| | |
|---|---|
| **G5, G11** | Get 3 external repositories running the Action. Still zero. The Phase 4 gate, and the only open item that is not code |
| Outreach | A 10 repository shortlist is rendered and ready (`docs/REVIEW_2026-09-15.md`). Nothing has been posted yet |
| ~~G1~~ | **Done.** 0.4.0 shipped from a minor release and the showcase is regenerated from it |
| Partial G6 | The bench card is on the README and the CLI reference. No milestone card: the lowest threshold is 10 stars and the repo has 1, so no real one exists |
| **G10, G14** | Marketplace listing, launch assets. G14 is unblocked: `story-page` declares `producthunt` |
| Partial G8 | Snippets come from the release section, not the specific entry the headline used. Fixing it changes the facts schema, so the manifest shape, so it needs the owner's sign-off |

## Hard rules that trip agents up

`AGENTS.md` is binding. The three that catch people most often: never commit, push or tag; no em
dashes anywhere; never run `pnpm test:update-golden` without the owner asking. Read `AGENTS.md`
before touching anything.
