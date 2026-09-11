#!/usr/bin/env bash
# Shipseal repo scaffold. Place at scripts/scaffold.sh and run from anywhere:
#   bash scripts/scaffold.sh          # skips files that already exist
#   FORCE=1 bash scripts/scaffold.sh  # overwrites generated files
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
FORCE="${FORCE:-0}"
created=0; skipped=0

# write <path>: writes stdin to path unless it exists (or FORCE=1)
write() {
  local f="$1"; mkdir -p "$(dirname "$f")"
  if [[ -e "$f" && "$FORCE" != "1" ]]; then cat >/dev/null; echo "skip  $f"; skipped=$((skipped+1)); return; fi
  cat >"$f"; echo "write $f"; created=$((created+1))
}
# stub <path> <plan-section> <purpose>: TypeScript placeholder module
stub() { write "$1" < <(printf '// %s\n// Spec: docs/PROJECT_PLAN.md %s\n// TODO: implement. Read AGENTS.md before editing.\nexport {};\n' "$3" "$2"); }
keep() { mkdir -p "$1"; [[ -e "$1/.gitkeep" ]] || touch "$1/.gitkeep"; }

echo "Scaffolding Shipseal in $ROOT"

# ---------- legacy AGENT.md -> AGENTS.md (the standard filename) ----------
if [[ -f AGENT.md && ! -f AGENTS.md ]]; then mv AGENT.md docs/AGENT.legacy.md; echo "moved AGENT.md -> docs/AGENT.legacy.md (replaced by AGENTS.md)"; fi

# ---------- root config ----------
write package.json <<'EOF'
{
  "name": "shipseal-monorepo",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  }
}
EOF

write pnpm-workspace.yaml <<'EOF'
packages:
  - "packages/*"
EOF

write tsconfig.base.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "jsx": "react-jsx",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  }
}
EOF

write .gitignore <<'EOF'
node_modules/
dist/
coverage/
*.log
.DS_Store
.env
.env.*
.shipseal/output/
test/.tmp/
EOF

write .editorconfig <<'EOF'
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
EOF

write .nvmrc < <(echo "22")

# ---------- package: shipseal ----------
P=packages/shipseal
write $P/package.json <<'EOF'
{
  "name": "shipseal",
  "version": "0.0.0",
  "description": "Every release, sealed and ready to share. Verified release visuals from your repo.",
  "license": "MIT",
  "type": "module",
  "bin": { "shipseal": "./dist/cli.js" },
  "files": ["dist"],
  "engines": { "node": ">=22" },
  "homepage": "https://shipseal.dev",
  "repository": { "type": "git", "url": "git+https://github.com/akii09/shipseal.git", "directory": "packages/shipseal" },
  "keywords": ["release", "og-image", "social-cards", "changelog", "github-action", "takumi"],
  "scripts": {
    "build": "echo 'TODO: choose tsdown or tsup (PROJECT_PLAN §25)'",
    "test": "vitest run",
    "test:update-golden": "UPDATE_GOLDEN=1 vitest run test/golden",
    "typecheck": "tsc --noEmit",
    "lint": "echo 'TODO: add linter'"
  }
}
EOF

write $P/tsconfig.json <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
EOF

S=$P/src
stub $S/cli.ts                        "§18"   "CLI entry: parse args, dispatch to commands/*"
stub $S/commands/init.ts              "§18.1" "init: detect brand, write .shipseal/brand.json + config.json, render sample"
stub $S/commands/release.ts           "§18.2" "release: generate the release pack"
stub $S/commands/milestone.ts         "§18.3" "milestone: card for highest crossed threshold"
stub $S/commands/bench.ts             "§18.4" "bench: before/after cards from bench JSON"
stub $S/commands/doctor.ts            "§18.5" "doctor: environment and config checks"
stub $S/core/generate.ts              "§6.1"  "The pure pipeline: facts + copy + brand + templates -> rendered files (no network I/O)"
stub $S/core/events.ts                "§6.3"  "ShipsealEvent types"
stub $S/core/errors.ts                "§0.3"  "Typed errors: what went wrong, why, how to fix"
stub $S/facts/schema.ts               "§9"    "zod schemas for Facts, Fact<T>, Provenance"
stub $S/facts/fact.ts                 "§9.1"  "fact() helper that attaches provenance"
stub $S/sources/git.ts                "§12.1" "Tags, commits, conventional commits, contributors"
stub $S/sources/package-json.ts       "§12.2" "package.json facts"
stub $S/sources/readme.ts             "§12.3" "README title, tagline, first code block"
stub $S/sources/changelog.ts          "§12.4" "Keep a Changelog + Changesets parsing"
stub $S/sources/github.ts             "§12.5" "GitHub REST via fetch (token optional)"
stub $S/sources/npm.ts                "§12.6" "npm weekly downloads"
stub $S/sources/bench-file.ts         "§12.7" "Benchmark JSON reader"
stub $S/brand/schema.ts               "§10.2" "brand.json zod schema"
stub $S/brand/detect.ts               "§10.3" "Brand detection pipeline"
stub $S/brand/tailwind.ts             "§10.3" "Static Tailwind v3 config + v4 @theme color extraction"
stub $S/brand/css-vars.ts             "§10.3" "CSS :root variable extraction"
stub $S/brand/dtcg.ts                 "§10.1" "W3C Design Tokens reader"
stub $S/brand/logo.ts                 "§10.3" "Logo discovery"
stub $S/config/schema.ts              "§11"   "config.json zod schema"
stub $S/config/load.ts                "§11"   "Load and merge config (flags > file > defaults)"
stub $S/copy/deterministic.ts         "§13.2" "No-LLM copy rules (default path)"
stub $S/copy/llm.ts                   "§13.3" "Optional LLM copy (lazy import, BYOK)"
stub $S/copy/number-guard.ts          "§13.3" "Rule R1: reject any digits not from facts"
stub $S/templates/contract.ts         "§14.1" "TemplateDefinition + TextSlotSpec types"
stub $S/templates/registry.ts         "§14.3" "Template registry"
stub $S/templates/release-hero.tsx    "§14.3" "Template: release hero"
stub $S/templates/release-highlights.tsx "§14.3" "Template: what's new list"
stub $S/templates/code-card.tsx       "§14.3" "Template: syntax-highlighted snippet"
stub $S/templates/milestone.tsx       "§14.3" "Template: milestone big number"
stub $S/templates/bench.tsx           "§14.3" "Template: before/after metrics"
stub $S/formats.ts                    "§14.2" "Single table of platform sizes"
stub $S/fit/fit-text.ts               "§15"   "Text fitting: shrink, then retry/truncate + manifest warning"
stub $S/render/adapter.ts             "§16.1" "RendererAdapter interface"
stub $S/render/takumi.ts              "§16"   "ONLY file allowed to import Takumi (Rule R4). Verify API first (spike S1)"
stub $S/outputs/files.ts              "§17.1" "Write pack files to disk"
stub $S/outputs/manifest.ts           "§17.2" "Build manifest.json with facts, computed values, warnings"
stub $S/outputs/github-release.ts     "§19.4" "Upload assets to a GitHub release"
keep $S/templates/primitives
keep $P/test/fixtures/repos; keep $P/test/fixtures/brands; keep $P/test/fixtures/bench; keep $P/test/golden

write $P/test/smoke.test.ts <<'EOF'
import { describe, it, expect } from "vitest";

describe("scaffold", () => {
  it("runs the test harness", () => {
    expect(true).toBe(true);
  });
});
EOF

# ---------- GitHub Action + CI ----------
write action.yml <<'EOF'
# Composite action (PROJECT_PLAN §19). Placeholder until Phase 3.
name: Shipseal
description: Every release, sealed and ready to share. Verified release visuals from your repo.
branding: { icon: award, color: red }
inputs:
  command: { description: "release | milestone | bench", default: release }
  upload-assets: { description: "Upload images to the GitHub release", default: "true" }
  strict: { description: "Fail on fit warnings", default: "false" }
  version: { description: "Shipseal version to run", default: "latest" }
runs:
  using: composite
  steps:
    - shell: bash
      run: echo "TODO(Phase 3): setup-node, run npx shipseal@${{ inputs.version }} ${{ inputs.command }} --json, upload assets, write job summary"
EOF

write .github/workflows/ci.yml <<'EOF'
# Verify current major versions of these actions before relying on them.
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
EOF

write examples/workflows/shipseal.yml <<'EOF'
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
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: akii09/shipseal@v0.0.8
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
EOF

# ---------- README ----------
write README.md <<'EOF'
# Shipseal

**Every release, sealed and ready to share.**

Shipseal turns your repo's releases, milestones, and benchmarks into ready-to-post visuals: OG images, X and LinkedIn cards, GitHub social previews. On brand, at the right size, with **every number verified** from a real source.

> Status: **pre-alpha**. Not usable yet. Follow progress at [shipseal.dev](https://shipseal.dev).

## Why

Agents made shipping fast. Announcing still takes an hour in Figma. AI image tools mangle text and invent numbers. Shipseal reads facts your repo already has and renders them deterministically, with no browser and no image model.

## How it works

```
repo facts  ->  optional AI copy (words only)  ->  your brand + templates  ->  Takumi render  ->  image pack + manifest
```

Every number on a card comes from git, the GitHub API, npm, or your CI, and is listed with its source in `manifest.json`.

## Planned usage

```bash
npx shipseal init       # detect your brand once
npx shipseal release    # generate the release pack
```

```yaml
# .github/workflows/shipseal.yml
on: { release: { types: [published] } }
permissions: { contents: write }
jobs:
  visuals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: akii09/shipseal@v0.0.8
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
```

## v1 scope

- Release pack: hero (OG, GitHub social, X, LinkedIn), highlights card, code card
- Milestone cards: stars, npm downloads, contributors
- Benchmark cards: before/after from a JSON file
- Automatic text fitting, dark and light themes
- CLI and GitHub Action

## Contributing

Read [AGENTS.md](./AGENTS.md) and [docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md) first. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. Rendering powered by [Takumi](https://takumi.kane.tw).
EOF

write CONTRIBUTING.md <<'EOF'
# Contributing

1. Read `AGENTS.md` (rules) and `docs/PROJECT_PLAN.md` (spec).
2. `pnpm install`, then `pnpm typecheck && pnpm test`.
3. Open an issue before large changes. Scope is intentionally narrow (PROJECT_PLAN §4).
4. Conventional Commits. New modules need tests. Template changes need golden image updates and owner review.
EOF

# ---------- AGENTS.md (canonical, tool-agnostic) ----------
write AGENTS.md <<'EOF'
# AGENTS.md

Instructions for AI coding agents (Claude Code, Cursor, Codex, Copilot, Gemini CLI). Humans: this is also the contributor rulebook.

## Project

**Shipseal** (shipseal.dev, npm `shipseal`) turns repo events (releases, milestones, benchmarks) into verified, on-brand visual packs. Pipeline: `sources -> facts -> copy -> templates -> render (Takumi) -> outputs`.

- Full spec: `docs/PROJECT_PLAN.md` (single source of truth)
- Current phase: see top of the plan and §21
- Phase 0 (validation) comes before product code. Phase 1 starts with spikes (§24).

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter shipseal test:update-golden   # only with owner approval
```

## Repo map

| Path | Purpose |
|---|---|
| `packages/shipseal/src/core/` | Pure pipeline, no network I/O |
| `packages/shipseal/src/sources/` | Collectors returning Facts with provenance |
| `packages/shipseal/src/facts/` | Fact and provenance schemas |
| `packages/shipseal/src/brand/` | brand.json schema and detection |
| `packages/shipseal/src/copy/` | Deterministic copy, optional LLM, number guard |
| `packages/shipseal/src/templates/` | Pure JSX templates + contract |
| `packages/shipseal/src/fit/` | Text fitting |
| `packages/shipseal/src/render/takumi.ts` | The only Takumi import |
| `packages/shipseal/src/outputs/` | Files, manifest, release upload |
| `action.yml` | Composite GitHub Action |
| `.claude/skills/` | Task playbooks (usable by any agent, just read them) |

## Hard rules

1. **No invented numbers.** Every number, date, version, count, or percent on a card is a Fact with provenance or computed from Facts by code. The LLM writes words only.
2. **No headless browsers** (Puppeteer, Playwright, Chrome) and **no image-generation models** in dependencies.
3. **Only `src/render/takumi.ts` imports Takumi.** Pin its version exactly.
4. **Verify external APIs** (Takumi, GitHub REST, npm, Actions) against current docs before use. Do not trust memory or plan examples.
5. **Never overflow silently.** Fit the text or record a manifest warning.
6. **The LLM is optional.** Everything works with `--no-copy`.
7. **Ask before** adding a dependency (name, size, license, reason) or changing a public interface (CLI flags, config/brand schema, template contract, manifest).
8. **Do not reintroduce** ideas in plan §26 (Rejected ideas).
9. **Stay in scope.** v1 is plan §4.1. Anything in §4.2 needs owner approval.

## Workflow

1. Restate the task, list files to touch, propose the approach. Wait for approval on non-trivial work.
2. Work **one file at a time**, explaining each change.
3. Read a file before editing it.
4. Add or update tests with every change.
5. If reality contradicts the plan, stop and flag it. Record decisions in plan §25.

## Code conventions

- TypeScript strict, ESM, Node 22+. No `any` without a justifying comment.
- Validate all external input with zod (config, brand, facts, LLM output).
- Templates are pure: no I/O, no randomness, no `Date.now()`.
- Errors state what failed, why, and how to fix it.
- Small modules, named exports, no default exports (except where a tool requires one).
- Conventional Commits.
- Docs and default card copy: short, concrete, **no em dashes**.

## Definition of done

- Typecheck and tests pass.
- New behavior covered by tests; template changes covered by golden images.
- Every rendered number traceable in `manifest.json`.
- Plan updated if a decision or interface changed.

## Skills

Playbooks in `.claude/skills/*/SKILL.md`:

| Skill | Use when |
|---|---|
| `add-template` | Creating or changing a card template |
| `add-source` | Adding a data collector |
| `takumi-renderer` | Any work touching rendering or measurement |
| `golden-images` | Updating visual snapshots |
| `run-spike` | Resolving an unknown from plan §24 |
| `log-decision` | Any decision that changes the plan |
EOF

# ---------- CLAUDE.md (Claude Code entry; imports AGENTS.md) ----------
write CLAUDE.md <<'EOF'
# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Use **plan mode** for anything touching more than one file. Present the plan, wait for approval.
- Load the matching skill from `.claude/skills/` before starting a task it covers.
- Before rendering work, fetch current Takumi docs (https://takumi.kane.tw/docs). Package names have changed before.
- Do not run `pnpm test:update-golden` without explicit approval.
- Do not commit or push unless asked. Suggest a Conventional Commit message instead.
- Keep responses concise. Explain each file you change in 1 to 3 sentences.
EOF

# ---------- Skills ----------
write .claude/skills/add-template/SKILL.md <<'EOF'
---
name: add-template
description: Create or modify a Shipseal card template. Use for any change in src/templates/.
---

1. Read `docs/PROJECT_PLAN.md` §14 and §15, and `src/templates/contract.ts`.
2. Define `propsSchema` (zod) and `slots` (maxLines, min/max font size, box width) first.
3. `buildProps(facts, copy, brand)`: take numbers only from Facts. Never hardcode or estimate values.
4. `render(props, ctx)`: pure JSX. Switch layout per `ctx.format`; do not just scale. Support dark and light.
5. Use only CSS Takumi supports (check its docs). Keep text 64px inside edges on landscape formats.
6. Missing fact: hide the element and record it in `manifest.missing`.
7. Register in `registry.ts`, add fixture-based golden tests for every format and theme.
8. Ask the owner to review the rendered PNGs before marking done.
EOF

write .claude/skills/add-source/SKILL.md <<'EOF'
---
name: add-source
description: Add a Shipseal data collector in src/sources/. Use when new facts are needed.
---

1. Read plan §9 and §12. Confirm the API or file format against current docs.
2. Return partial `Facts`; wrap every value with `fact(value, { source, ref, fetchedAt })`.
3. `ref` must be precise enough to re-check by hand (endpoint + field, file + key, git command).
4. Missing optional data returns nothing. Throw only for invalid input, with a fix-it message.
5. Network: plain `fetch`, clear rate-limit errors, in-memory cache per run, no retries loops without limits.
6. Add the SourceId to the schema if new. Test with fixtures; no live network in tests.
EOF

write .claude/skills/takumi-renderer/SKILL.md <<'EOF'
---
name: takumi-renderer
description: Work on rendering or text measurement. Use for src/render/ and src/fit/.
---

1. Fetch current Takumi docs first. Confirm package name, render API, JSX input, font loading, output formats.
2. All Takumi imports stay in `src/render/takumi.ts`, behind `RendererAdapter` (plan §16).
3. Load fonts once per process; reuse the context. Pass logos as buffers, never fetch during render.
4. Measurement must use the same font files as rendering.
5. After any Takumi version change: run golden tests and report pixel diffs before accepting.
6. Record API findings in plan §25.
EOF

write .claude/skills/golden-images/SKILL.md <<'EOF'
---
name: golden-images
description: Update or debug golden image snapshot tests in test/golden/.
---

1. Never update goldens to make a failing test pass without understanding the diff.
2. Run tests, inspect the diff images, and describe what changed and why.
3. Only after owner approval: `pnpm --filter shipseal test:update-golden`.
4. Tolerance is at most 0.1% differing pixels. Do not raise it to hide regressions.
EOF

write .claude/skills/run-spike/SKILL.md <<'EOF'
---
name: run-spike
description: Resolve a known unknown from PROJECT_PLAN §24 with a time-boxed experiment.
---

1. Pick one spike (S1 to S7). Time-box to half a day of effort.
2. Work in `spikes/<id>/` (throwaway, not shipped). Keep code minimal.
3. Answer the question with evidence: commands run, outputs, timings, links to docs.
4. Record the result and the resulting decision via the `log-decision` skill.
5. Delete or archive the spike code once recorded.
EOF

write .claude/skills/log-decision/SKILL.md <<'EOF'
---
name: log-decision
description: Record a decision in PROJECT_PLAN §25. Use whenever a decision is made or changed.
---

1. Append a row to §25: date, decision, reason, alternatives rejected. Never rewrite past rows; supersede them.
2. If the decision changes a section of the plan (stack, schema, interface), update that section in the same change.
3. If it rejects an idea, add it to §26 with the reason.
EOF

keep spikes

# ---------- docs ----------
write docs/validation.md <<'EOF'
# Phase 0 validation log

Goal and exit criteria: `PROJECT_PLAN.md` §21 (Phase 0).

| Date | Channel | What was posted | Signals (asks, repos offered, engagement) | Notes |
|---|---|---|---|---|

## Decision

- [ ] Proceed to Phase 1
- [ ] Stop and reassess
EOF

if [[ -f docs/PROJECT_PLAN.md ]] && ! grep -q "Appendix C: Agent tooling" docs/PROJECT_PLAN.md; then
cat >>docs/PROJECT_PLAN.md <<'EOF'

## Appendix C: Agent tooling (added by scripts/scaffold.sh)

- `AGENTS.md` is the canonical, extended agent rulebook and supersedes Appendix A. (`AGENT.md` is not a standard filename; any legacy copy lives in `docs/AGENT.legacy.md`.)
- `CLAUDE.md` imports `AGENTS.md` and adds Claude Code specifics.
- `.claude/skills/` holds task playbooks: add-template, add-source, takumi-renderer, golden-images, run-spike, log-decision.
- `spikes/` is for throwaway §24 experiments; never shipped.
- `docs/validation.md` tracks Phase 0 signals.
- `scripts/scaffold.sh` regenerates this structure (skips existing files; `FORCE=1` overwrites).
EOF
echo "append docs/PROJECT_PLAN.md (Appendix C)"
fi

echo
echo "Done: $created written, $skipped skipped."
echo "Next:"
echo "  pnpm add -D -w typescript vitest @types/node   # dev tooling (latest versions)"
echo "  pnpm install && pnpm typecheck && pnpm test"
echo "  Review AGENTS.md, then start Phase 0 (docs/validation.md)."
