# Pre-launch testing

Use this before any public npm `latest` publish or a Product Hunt / Show HN launch. Unit tests in this repo are necessary and not sufficient: they never run `shipseal` against PDFx, and they never attach files to a real GitHub release.

## Recommendation

Test in this order. Do not skip a gate.

| Gate | Where | Why | Publish npm? |
|---|---|---|---|
| 0 | This repo | CI-equivalent: typecheck, lint, test, build | No |
| 1 | This repo, local CLI | The built binary, not vitest | No |
| 2 | PDFx, local CLI | Plan §21 Phase 1-3 acceptance | No |
| 3 | Your eyes | "Would post this without edits" | No |
| 4 | A real GitHub release | Action, `gh` upload, runner native binary (S3 still open) | No |
| 5 | Optional `npx` install | Only the published tarball path | Yes, but **not** as `latest` |

**Do not publish `shipseal@0.0.2` (or any `0.0.x`) to the npm `latest` tag for internal testing.** `npx shipseal` and the Action default `version: latest` would give strangers a pre-alpha. README still says the tool is not usable yet.

If you need an installable tarball (to test `npx` or the Action default), use one of these:

1. **Local pack (preferred first):** `pnpm --filter shipseal pack`, then `npx /absolute/path/to/shipseal-0.0.0.tgz`.
2. **npm dist-tag, not latest:** version `0.1.0-alpha.1`, `npm publish --tag next`. Install with `npx shipseal@next` or `npx shipseal@0.1.0-alpha.1`. Keep `latest` empty or pinned to a later real release.
3. **GitHub Action without npm:** from a consumer repo, `uses: akii09/shipseal@<branch-or-sha>` with `version: workspace`. That builds the CLI from the Action checkout. This is how you dogfood before the package exists on npm.

Version `0.0.2` as a git tag / changelog bump is fine. Putting it on npm `latest` is not.

## How agents should run this

- Read this file and `docs/PROJECT_PLAN.md` §21 before starting.
- Run the **exact** commands in each item. Do not substitute a vitest pass for a CLI run on PDFx.
- Paste real command output. Never claim a gate passed unless you saw it.
- Stop at the first failed **must** item. Fix or report. Do not mark the gate done.
- Visual items (Gate 3) are owner-only. Agents open the PNGs, describe them in one sentence each, and wait. Do not rate "would post this."
- Do not `git commit`, `git push`, `npm publish`, or create GitHub releases unless the owner named that action in the same message.
- Node 22 (`cat .nvmrc`). `pnpm` from `packageManager` in the repo root `package.json`.
- CLI after build: `node packages/shipseal/dist/cli.js` from the Shipseal repo root. That is the binary under test. Do not use `npx shipseal` until Gate 5.

Environment:

```bash
export SHIPSEAL_ROOT="/Users/akash/Desktop/Open-Source/shipseal"
export PDFX_ROOT="/Users/akash/Desktop/Open-Source/pdfx"
export CLI="$SHIPSEAL_ROOT/packages/shipseal/dist/cli.js"
cd "$SHIPSEAL_ROOT"
```

PDFx is a monorepo. Pass `--package` at the published package's `package.json` if the repo root is private `pdfx@0.0.0`. Confirm the path before Gate 2 (likely `packages/cli` or the package that npm publishes as `pdfx`).

---

## Gate 0: this repo is green

**Must**

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (all files, no skipped golden updates)
- [ ] `pnpm build` exits 0 and `packages/shipseal/dist/cli.js` exists and is executable

**Pass:** all four commands succeeded on this machine, output pasted or attached.

**Fail:** any non-zero exit, or goldens rewritten without owner approval (`pnpm test:update-golden`).

---

## Gate 1: local CLI on Shipseal

Prereq: Gate 0. `pnpm --filter shipseal build`.

**Must**

- [ ] `node "$CLI" --help` lists `init`, `doctor`, `release`, `milestone`, `bench`
- [ ] `node "$CLI" doctor --cwd "$SHIPSEAL_ROOT"` : Node, fonts, and Takumi are `ok`. Failures print a Fix line.
- [ ] `node "$CLI" init --cwd "$SHIPSEAL_ROOT" --yes` (use `--force` only if `.shipseal/` already exists and the owner agrees to overwrite): writes `.shipseal/brand.json`, `.shipseal/config.json`, and a sample PNG whose first bytes are `89 50 4E 47`
- [ ] `node "$CLI" release --cwd "$SHIPSEAL_ROOT" --no-copy --tag <an existing git tag>` writes `.shipseal/output/<tag>/` with PNGs plus `manifest.json`
- [ ] Every number in `manifest.json` `copy` slots and in the filenames' implied version appears under `facts` or `computed` with `source` and `ref`
- [ ] `node "$CLI" bench --cwd "$SHIPSEAL_ROOT" --file <a fixture JSON>` : a regression metric (`better: "lower"` and `after > before` for time) shows a slower/worse label and `"regression"` in the image, and `manifest.computed["bench.metrics[0].percent"].value` is **negative**
- [ ] `node "$CLI" milestone --cwd "$SHIPSEAL_ROOT" --no-copy` : either a card whose big number matches the highest crossed threshold in config, or a clear skip message and exit 0 if GitHub stars were not fetched

**Pass:** commands above ran against the built CLI. Manifest provenance holds. Bench regression is honest.

**Fail:** `cli.not-implemented`, missing `brand.json` with no Fix, invented numbers on a card, or a regression framed as faster.

**Notes:** milestone and GitHub stars need network and usually `GITHUB_TOKEN`. Without a token, unauthenticated GitHub may rate-limit. That is not a product fail if the error names the token and how to set it.

---

## Gate 2: PDFx (plan acceptance)

Prereq: Gate 1. PDFx cloned at `$PDFX_ROOT`.

Plan §21 still requires these. They have not been signed off on PDFx in this repo's tests.

**Must**

- [ ] `node "$CLI" init --cwd "$PDFX_ROOT" --yes` produces `.shipseal/brand.json` with name `PDFx` (or the real package display name), a tagline, a primary that is not near-black zinc, and a logo path if a logo file exists
- [ ] `node "$CLI" doctor --cwd "$PDFX_ROOT"` passes Node, brand.json, fonts, Takumi. Logo is `ok` if a logo file exists, or a Fix if it does not
- [ ] `node "$CLI" release --cwd "$PDFX_ROOT" --no-copy --package <path-to-published-package.json>` generates the v1 release templates for the formats in config, **zero** `fit-warning` rows unless `--strict` is off and the owner accepts the warning
- [ ] Output includes at least `release-hero` for `og`, `x`, and `linkedin` (and `github-social` if still in default formats)
- [ ] `manifest.json` lists `release.version` (or tag) with provenance
- [ ] `node "$CLI" milestone --cwd "$PDFX_ROOT" --metric stars --no-copy` : if stars >= 1000, a card whose displayed number is `1,000` (or the highest crossed threshold), not the raw 1042-style current count as the hero number. `milestone.threshold` is in `manifest.facts` with `source: user-config`. Current stars remain in `metrics.stars`

**Known risk (do not hide):** PDFx may have no `logo.svg`/`logo.png` and a near-black primary. Init then "works" but fails the Phase 1 bar (sensible primary, logo found). Record that as a PDFx fixture problem or a detector bug. Do not lower the bar.

**Pass:** PDFx pack exists, provenance holds, milestone number is the threshold.

**Fail:** no tag so release crashes without telling you to pass `--tag`; logo silently missing with no `manifest.missing` row; milestone card shows a number the LLM invented.

---

## Gate 3: owner visual review

Agents must not pass this gate.

Open the PNGs at 100% on a laptop, then at phone width (or the X/LinkedIn preview size).

**Must (owner)**

- [ ] Each v1 template: "would post this without edits" or a written change request
- [ ] Goldens in `packages/shipseal/test/golden/images/` : `release-hero-og.png`, `milestone-og.png`, `bench-x.png`
- [ ] PDFx pack from Gate 2, same standard
- [ ] Dark and light if `--themes both` was used: contrast holds, logo is the right variant
- [ ] No overflow, no clipped word, no em dash in default copy
- [ ] README header: GitHub **dark** appearance shows the white wordmark, **light** shows the dark-text wordmark (`docs` + both README files use `<picture>`)

**Pass:** owner said would-post for each template in play, or listed exact edits.

**Fail:** "looks generated," unreadable type, wrong logo on dark GitHub.

---

## Gate 4: GitHub Action on a real release

Unit tests cannot close S3 (native binary on a runner) or §19.3 (images on a GitHub release).

**Do this on a throwaway public or private repo first**, not on PDFx production, unless you are fine attaching test PNGs to a real release.

Minimal workflow (plan §19.3, current majors):

```yaml
name: Shipseal
on:
  release:
    types: [published]
permissions:
  contents: write
jobs:
  visuals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - uses: akii09/shipseal@<branch-or-sha>
        with:
          version: workspace
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`<branch-or-sha>` must contain this Action and `packages/shipseal`. `version: workspace` avoids npm.

Shipseal's own repo: `.github/workflows/shipseal.yml` already uses `uses: ./` and `version: workspace`. A **published GitHub release** on `akii09/shipseal` is the dogfood run.

**Must**

- [ ] Job is green on `ubuntu-latest`
- [ ] Takumi native (or WASM fallback) rendered PNGs; no missing-binary crash
- [ ] Release page has the PNG assets (upload-assets default true)
- [ ] Job summary lists files and at least one fact with source
- [ ] Workflow artifact `shipseal` contains the same pack if `artifact: true`
- [ ] `fetch-depth: 0` was set; git facts are not empty solely because of a shallow clone
- [ ] `--strict` path: a pack with a fit warning can fail the job when `strict: true` (optional but should be tried once)

**Pass:** a human can download a PNG from the GitHub release UI without opening the Actions log.

**Fail:** Action still echoes TODO; `npx shipseal@latest` 404 because version was left at `latest` and the package is unpublished; upload skipped because `contents: write` missing.

**Not required for Gate 4:** npm publish.

---

## Gate 5: optional npm (npx path only)

Run only after Gates 0-4, and only to prove `npx shipseal@<id>` and Action `version: <id>` (not `workspace`).

**Must if you publish**

- [ ] Version is a pre-release: `0.1.0-alpha.1` (or similar), **not** `0.0.2` on `latest`
- [ ] `npm publish --tag next` (or `alpha`), never the default `latest` tag until launch
- [ ] `npm pack` locally first: tarball contains `dist/cli.js` and `assets/fonts`, does not contain `src/` tests or `.shipseal/output`
- [ ] `npx shipseal@next --help` works on a machine that does not have this git clone
- [ ] Action on a test repo with `version: 0.1.0-alpha.1` (or `@next`) still renders

**Pass:** a clean machine can run the CLI from npm without this repo.

**Fail:** `latest` points at pre-alpha; tarball missing fonts so doctor/Takumi fail.

---

## What "ready to launch" is (Phase 4)

Do not treat Gates 0-5 as a launch. Plan §21 Phase 4 still needs:

- README that a stranger can follow in under 5 minutes (today it says pre-alpha, not usable)
- shipseal.dev quick start
- At least 3 external repos on the Action before launch day (soft launch, not a checklist you fake)

Launch sequence: `docs/PROJECT_PLAN.md` §22.

---

## Agent report template

Copy this when a gate is done or blocked:

```
Gate: <0-5>
Result: pass | fail | blocked
Commands run:
<paste>
Observed:
<one short paragraph, plus paths to PNGs>
Failed must items:
<or none>
Owner needed for:
<Gate 3 visual, publish, GitHub release, or none>
```
