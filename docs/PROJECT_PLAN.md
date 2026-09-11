# Shipseal: Project Plan

> **Every release, sealed and ready to share.**
>
> Domain: `shipseal.dev` · npm: `shipseal` · Status: pre-build (Phase 0) · Owner: Akash (akii09)
>
> This document is the single source of truth for the project. It is written so that a human or an AI coding agent with **zero prior context** can understand what Shipseal is, why it exists, what has already been decided, and exactly how to build it without repeating past research or reintroducing rejected ideas. Read Section 0 before doing anything.

---

## Table of contents

0. [Read this first: rules for AI agents](#0-read-this-first-rules-for-ai-agents)
1. [What Shipseal is (plain language)](#1-what-shipseal-is-plain-language)
2. [The problem](#2-the-problem)
3. [Core principles (non-negotiable)](#3-core-principles-non-negotiable)
4. [Scope: v1, later, and never](#4-scope-v1-later-and-never)
5. [Competitive landscape](#5-competitive-landscape)
6. [Architecture](#6-architecture)
7. [Tech stack](#7-tech-stack)
8. [Repository structure](#8-repository-structure)
9. [Data model: Facts and provenance](#9-data-model-facts-and-provenance)
10. [Brand kit (`brand.json`)](#10-brand-kit-brandjson)
11. [Configuration (`config.json`)](#11-configuration-configjson)
12. [Sources (data collectors)](#12-sources-data-collectors)
13. [Copy layer (optional LLM)](#13-copy-layer-optional-llm)
14. [Templates and formats](#14-templates-and-formats)
15. [Text fitting and layout checks](#15-text-fitting-and-layout-checks)
16. [Renderer adapter (Takumi)](#16-renderer-adapter-takumi)
17. [Outputs and manifest](#17-outputs-and-manifest)
18. [CLI specification](#18-cli-specification)
19. [GitHub Action specification](#19-github-action-specification)
20. [Testing strategy](#20-testing-strategy)
21. [Phased roadmap with acceptance criteria](#21-phased-roadmap-with-acceptance-criteria)
22. [Launch and distribution plan](#22-launch-and-distribution-plan)
23. [Risks and mitigations](#23-risks-and-mitigations)
24. [Known unknowns (spikes to run first)](#24-known-unknowns-spikes-to-run-first)
25. [Decisions log](#25-decisions-log)
26. [Rejected ideas (do not reintroduce)](#26-rejected-ideas-do-not-reintroduce)
27. [Glossary](#27-glossary)

---

## 0. Read this first: rules for AI agents

These rules exist because specific mistakes are easy to make on this project. Follow them strictly.

### 0.1 How to work

1. **Understand, align, design, build.** Before writing code for any task, restate the task, list the files you will touch, and explain the approach. Wait for approval on anything that changes architecture, adds a dependency, or changes a public interface (CLI flags, config schema, template contract, manifest format).
2. **One file at a time.** Create or edit one file per step, and explain what it does and why. Do not generate large batches of files in one go.
3. **Read before you write.** Before editing a file, read its current contents. Before adding a module, check Section 8 for where it belongs.
4. **Keep this plan current.** If a decision changes, update Section 25 (Decisions log) in the same change. If you discover something that contradicts this plan, stop and flag it instead of silently diverging.

### 0.2 Hard rules (never break these)

| # | Rule | Why |
|---|------|-----|
| R1 | **Never let an LLM produce a number** that appears on a card. Every number must come from a Source (Section 12) and carry provenance. | The core promise is "verified visuals." One invented number destroys trust. |
| R2 | **No headless browsers at runtime.** No Puppeteer, Playwright, Chrome, or Chromium in `dependencies`. | Shipseal is browser-free by design (speed, CI cost, portability). |
| R3 | **No image-generation models** (diffusion, GPT Image, Imagen, Flux, etc.). | Output must be deterministic and brand-exact. |
| R4 | **All Takumi calls go through the renderer adapter** (`src/render/`). No other module imports Takumi directly. | Takumi's JS API changes frequently. Isolating it keeps churn in one file. |
| R5 | **Verify external APIs against current docs** at implementation time (Takumi, GitHub REST, npm downloads API, GitHub Actions runtime). Do not rely on memory or on the examples in this plan, which may be outdated. | Package names and signatures have already changed during this project's research. |
| R6 | **Never overflow silently.** If text does not fit, fix it (Section 15) or emit a warning in the manifest. Clipped or overflowing text must never ship without a warning. | Broken layouts are the most common failure of generated visuals. |
| R7 | **Ask before adding any dependency.** State the package, its size, its license, and why it is needed. | Keep the install fast and the supply chain small. |
| R8 | **The LLM is optional.** Every feature must work with `--no-copy` (no API key). | Zero-config, zero-cost default path. |
| R9 | **Do not reintroduce anything in Section 26** (Rejected ideas) without explicit owner approval. | These were researched and rejected for specific reasons. |

### 0.3 Conventions

- TypeScript `strict: true`. No `any` without a comment explaining why.
- ESM only. Node version per Section 7.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- Every new module ships with tests (Section 20).
- Writing style for docs, README, and default card copy: short, direct, concrete. **No em dashes** in project docs or default generated copy (owner preference). Use colons, commas, or separate sentences.
- User-facing errors must say what went wrong, why, and how to fix it.

---

## 1. What Shipseal is (plain language)

Shipseal is **a designer that lives inside your repo**. When you ship something (a release, a milestone, a performance win), Shipseal reads facts that already exist in your project and produces a folder of ready-to-post images, in your brand colors, at the correct size for every platform.

**Input:** a repository plus an event (release published, milestone reached, benchmark improved).

**Output:** a visual pack, for example:

```
.shipseal/output/v2.0.0/
├── og.png                  1200×630   link previews
├── github-social.png       1280×640   GitHub social preview
├── x.png                   1200×675   X / Twitter post
├── linkedin.png            1200×627   LinkedIn post
├── highlights.png          1200×675   "What's new" list card
├── code.png                1200×675   API snippet card
└── manifest.json                      what was generated, from which facts
```

**How it works, in five steps:**

1. **Read.** Collect facts from the repo and APIs: name, tagline, version, changelog entries, contributors, stars, downloads, benchmark results.
2. **Decide.** Optionally, an LLM picks highlights and writes short headline text. It writes words only, never numbers.
3. **Design.** Facts and copy are placed into templates using the project's brand kit.
4. **Render.** Takumi rasterizes templates to PNG/WebP (and later GIF/PDF) in milliseconds, with no browser.
5. **Deliver.** Files land in a folder, get attached to the GitHub release, or both.

**One-line pitch:** "Release visuals from one line of YAML. Every number verified."

**Relationship to other projects:** Shipseal is a **standalone project with its own brand**. It is not part of PDFx (a React PDF component library). They share an owner and rendering know-how, nothing else.

---

## 2. The problem

- AI coding agents made shipping dramatically faster. Announcing what shipped did not get faster.
- Every release, feature, or milestone needs visuals: OG image, X card, LinkedIn card, GitHub social preview, changelog graphic. Developers either skip them, spend an hour in Figma or Canva, or use AI image generators that mangle text and ignore brand.
- Existing tools cover fragments (one OG image, text-only launch copy, paid template APIs), but none turns repository events into a consistent, verified, multi-platform visual pack automatically.
- Developers distrust AI output. Visuals with invented numbers are worse than no visuals.

**Target user (v1):** open-source maintainers and indie developers who ship publicly (GitHub releases, npm packages, build-in-public on X/LinkedIn).

**Owner's own validation of the pain:** the owner hand-made star-milestone banners and Product Hunt launch assets for PDFx and experienced this friction directly.

---

## 3. Core principles (non-negotiable)

1. **Verified facts.** Every number on every card comes from a real source (git, GitHub API, npm registry, a CI-produced JSON file, or explicit user config) and is recorded with provenance in the manifest. The LLM writes words only.
2. **Deterministic rendering.** Same facts + same brand + same template + same version = byte-identical output (or pixel-identical within test tolerance). No randomness.
3. **Zero config to start.** `npx shipseal init` detects the brand; `npx shipseal release` works with sensible defaults. Config is for overriding, not for starting.
4. **Browser-free and fast.** Rendering uses Takumi. A full pack should render in seconds in CI.
5. **LLM optional and cheap.** Without an API key, deterministic copy rules produce good default text. With a key, the LLM improves headline wording within strict limits.
6. **Quality over quantity.** Three excellent templates beat twenty mediocre ones. Output must look designed, not generated.
7. **Local-first.** No Shipseal server is required. No telemetry by default.
8. **Thin adapters, stable core.** New data sources, templates, and destinations plug in without changing the core pipeline.

---

## 4. Scope: v1, later, and never

### 4.1 v1 (the launch)

| Feature | Description |
|---|---|
| `shipseal init` | Detect brand (name, tagline, colors, logo, fonts) and write `.shipseal/brand.json` + `.shipseal/config.json`. |
| Release pack | On a release, generate hero cards for OG, GitHub social, X, LinkedIn, plus a highlights card and a code card. |
| Milestone cards | Stars, npm weekly downloads, contributors. Crossing a threshold (e.g. 1,000 stars) produces a card. |
| Benchmark cards | Before/after metrics from a JSON file the user or CI writes. Percentages computed by code. |
| Text fitting | Automatic font scaling, line limits, and warnings (Section 15). |
| Manifest | `manifest.json` listing every file, template, fact, and source. |
| CLI | `init`, `release`, `milestone`, `bench`, `doctor`. |
| GitHub Action | `uses: <owner>/shipseal@v1` on `release: published`; uploads images as release assets. |
| Themes | Each template supports `dark` and `light`. |

### 4.2 Later (post-v1, only after v1 has real users)

In rough priority order:

1. `shipseal preview`: local dev server with live-reloading template preview.
2. LinkedIn carousel (multi-page PDF, 1080×1350 pages).
3. README banner that auto-updates (version, stars).
4. Animated output (WebP/GIF) for hero cards.
5. Contributor thank-you card when a first-time contributor's PR merges.
6. Scheduled milestone detection in the Action (daily cron with state file).
7. MCP server and agent skill so coding agents can call Shipseal.
8. Hosted dynamic endpoint (`https://shipseal.dev/card?repo=owner/name&type=release`).
9. Community template registry (shadcn-style `npx shipseal add <template>`).
10. More sources: PyPI, crates.io, Lighthouse, bundle size tools.
11. Paid hosted tier: team brand kits, scheduled posting, asset history.

### 4.3 Never (out of scope by design)

- A general-purpose rendering engine or image framework (Takumi already is one).
- AI image generation of any kind.
- A Canva/Figma-style visual editor.
- A social media scheduler as the core product (possibly a paid add-on much later).
- Visual PR summaries / architecture diagrams from diffs (see Section 26).

---

## 5. Competitive landscape

Researched September 2026. Re-check before launch.

| Product | What it does | Why Shipseal is different |
|---|---|---|
| **shipshot** (github.com/web3wikis/shipshot) | Agent Skill (Python, Pillow) that generates a GitHub social preview, README hero, and terminal demo GIF from real command output. No browser. | **Closest competitor.** Watch closely. Shipseal adds: persistent brand kit, event triggers (release/milestone), multi-platform pack, benchmark cards, verified-facts manifest, GitHub Action. |
| OG image agent skills (many, e.g. stevysmith/og-image-skill, social-preview skills) | Prompt files that read the design system and screenshot a page with Playwright to make one OG image. | Regenerate from scratch each run (inconsistent), use browsers, produce one image, no automation. |
| og-image-generator (npm) | CLI: SVG template to PNG via resvg + sharp, presets. | Single OG image, no repo awareness, no events. |
| html2img GitHub Action | Hosted API that renders HTML to images from workflows. | Paid and metered (50 free credits), you write the HTML yourself. |
| Pixelixe | Template SaaS for changelog/social cards via API. | Hosted, paid, not repo-aware. |
| Google Pomelli | Scans a website for "Business DNA" and generates social campaigns. | For small businesses, not developers. Not code-aware, no CI, limited regions. |
| Shipmate, LaunchKit | Generate launch copy (tweets, PH comments, landing pages) from a repo or URL. | Text only, no visuals. |
| Vercel json-render | Generative UI framework with an image renderer (Satori). | Adjacent infrastructure, not a product for release visuals. Could be complementary. |
| Takumi | Rendering engine (JSX/HTML/CSS to PNG/WebP/GIF/PDF, no browser). | **Shipseal's dependency, not a competitor.** |

**Shipseal's wedge is the combination nobody offers:** persistent brand kit + event triggers + code-aware cards + deterministic engine + full multi-platform pack + verified numbers.

---

## 6. Architecture

### 6.1 The pipeline

The core is one pure pipeline. Everything else is a thin adapter around it.

```
 ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐
 │ Sources  │ -> │  Facts   │ -> │   Copy   │ -> │ Templates │ -> │  Render  │ -> │ Outputs  │
 │ git, GH, │    │ typed,   │    │ optional │    │ JSX +     │    │ Takumi   │    │ files,   │
 │ npm, CI  │    │ validated│    │ LLM,     │    │ brand +   │    │ adapter  │    │ release  │
 │ JSON     │    │ + source │    │ words    │    │ fitting   │    │          │    │ assets,  │
 │          │    │          │    │ only     │    │           │    │          │    │ manifest │
 └──────────┘    └──────────┘    └──────────┘    └───────────┘    └──────────┘    └──────────┘

 Wrapped by:   CLI   ·   GitHub Action   ·   (later) MCP server   ·   (later) hosted endpoint
```

**Conceptual signature of the core:**

```ts
generate(event: ShipsealEvent, facts: Facts, brand: Brand, config: Config): Promise<GenerateResult>
```

`generate` performs no network I/O itself. Sources gather facts before it runs; outputs write results after. This keeps the core testable with fixtures.

### 6.2 Why this scales without over-engineering

| Growth | Where it lands | Core changes? |
|---|---|---|
| New data source (PyPI, Lighthouse) | New collector in `src/sources/` | No |
| New visual | New template in `src/templates/` | No |
| New platform size | New entry in `src/formats.ts` | No |
| New destination (Slack, commit to repo) | New writer in `src/outputs/` | No |
| New entry point (MCP, hosted) | New adapter wrapping `generate` | No |

**Rule:** ship as **one npm package** (`shipseal`) with internal modules. Split into multiple packages only when an outside user needs one piece independently. Do not create `@shipseal/core`, `@shipseal/render`, etc. in v1.

### 6.3 Events

```ts
type ShipsealEvent =
  | { kind: "release"; tag: string; previousTag?: string }
  | { kind: "milestone"; metric: "stars" | "downloads" | "contributors"; threshold: number }
  | { kind: "bench"; file: string };
```

Each event kind maps to a default set of templates (Section 14.3).

---

## 7. Tech stack

Verify current versions and APIs before installing (Rule R5).

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict), ESM | |
| Runtime | Node.js 22 LTS minimum (`engines.node >= 22`) | Confirm the Node version GitHub Actions runners provide. |
| Package manager | pnpm (workspaces) | Owner's standard. |
| Build | tsdown or tsup | Pick one in Phase 1; record in Decisions log. |
| Rendering | **Takumi** via `takumi-js` | Package names have changed historically (`@takumi-rs/core`, `@takumi-rs/image-response`, now `takumi-js` with subpaths like `takumi-js/response` and `takumi-js/helpers`). Confirm current package and API from takumi.kane.tw/docs. Wrapped by the renderer adapter only. |
| Default fonts | Geist and Geist Mono | Bundled with Takumi per its docs (verify). OFL licensed. |
| Validation | zod | All facts, config, brand, and LLM output validated. |
| CLI framework | cac or commander | Pick one in Phase 1. |
| Interactive prompts | @clack/prompts | For `init` only. |
| Terminal colors | picocolors | |
| Git access | `node:child_process` running `git` | No git library dependency. |
| GitHub API | Plain `fetch` to REST v3 | No Octokit in v1 to keep deps small. Token optional (`GITHUB_TOKEN`). |
| npm downloads | `fetch` to `https://api.npmjs.org/downloads/point/last-week/<pkg>` | Verify endpoint. |
| Syntax highlighting | shiki (tokens only, rendered as colored spans) | For code cards. Confirm Takumi renders many inline spans efficiently. |
| LLM (optional) | Provider-agnostic, BYOK. Candidate: Vercel AI SDK (`ai`) | Decide in Phase 2. Must be an optional/lazy import. |
| Tests | vitest | |
| Image snapshot diff | pixelmatch + pngjs | For golden image tests. |
| Releasing Shipseal itself | Changesets | Dogfood: Shipseal generates its own release visuals. |
| Docs site (later) | shipseal.dev on Vercel | Framework decided in Phase 4. |

---

## 8. Repository structure

```
shipseal/
├── action.yml                      # Composite GitHub Action (root, so `uses: owner/shipseal@v1` works)
├── package.json                    # Workspace root (private)
├── pnpm-workspace.yaml
├── AGENTS.md                       # Short pointer to Section 0 of this plan
├── docs/
│   └── PROJECT_PLAN.md             # This file
├── packages/
│   └── shipseal/                   # The single published npm package
│       ├── package.json            # name: "shipseal", bin: { "shipseal": "./dist/cli.js" }
│       ├── src/
│       │   ├── cli.ts              # CLI entry: parses args, calls commands
│       │   ├── commands/
│       │   │   ├── init.ts
│       │   │   ├── release.ts
│       │   │   ├── milestone.ts
│       │   │   ├── bench.ts
│       │   │   └── doctor.ts
│       │   ├── core/
│       │   │   ├── generate.ts     # The pure pipeline (Section 6.1)
│       │   │   ├── events.ts       # ShipsealEvent types
│       │   │   └── errors.ts       # Typed, user-friendly errors
│       │   ├── facts/
│       │   │   ├── schema.ts       # zod schemas for Facts + Provenance
│       │   │   └── fact.ts         # fact() helper that attaches provenance
│       │   ├── sources/
│       │   │   ├── git.ts          # tags, commits, contributors
│       │   │   ├── package-json.ts
│       │   │   ├── readme.ts       # title, tagline, first code block
│       │   │   ├── changelog.ts    # Keep a Changelog + Changesets formats
│       │   │   ├── github.ts       # repo meta, release body, stars
│       │   │   ├── npm.ts          # weekly downloads
│       │   │   └── bench-file.ts   # user/CI benchmark JSON
│       │   ├── brand/
│       │   │   ├── schema.ts       # brand.json zod schema
│       │   │   ├── detect.ts       # detection pipeline (Section 10.3)
│       │   │   ├── tailwind.ts     # Tailwind v3 config + v4 @theme parsing
│       │   │   ├── css-vars.ts
│       │   │   ├── dtcg.ts         # W3C Design Tokens reader
│       │   │   └── logo.ts         # logo file discovery
│       │   ├── config/
│       │   │   ├── schema.ts
│       │   │   └── load.ts
│       │   ├── copy/
│       │   │   ├── deterministic.ts  # no-LLM copy rules
│       │   │   ├── llm.ts            # optional LLM copy
│       │   │   └── number-guard.ts   # Rule R1 enforcement
│       │   ├── templates/
│       │   │   ├── contract.ts     # TemplateDefinition interface
│       │   │   ├── registry.ts
│       │   │   ├── primitives/     # shared JSX building blocks (Logo, Badge, Stat...)
│       │   │   ├── release-hero.tsx
│       │   │   ├── release-highlights.tsx
│       │   │   ├── code-card.tsx
│       │   │   ├── milestone.tsx
│       │   │   └── bench.tsx
│       │   ├── formats.ts          # platform sizes (Section 14.2)
│       │   ├── fit/
│       │   │   └── fit-text.ts     # Section 15
│       │   ├── render/
│       │   │   ├── adapter.ts      # RendererAdapter interface
│       │   │   └── takumi.ts       # the ONLY file importing Takumi (Rule R4)
│       │   └── outputs/
│       │       ├── files.ts        # write to disk
│       │       ├── manifest.ts
│       │       └── github-release.ts  # upload assets (used by Action)
│       └── test/
│           ├── fixtures/
│           │   ├── repos/          # tiny fixture git repos (created by setup script)
│           │   ├── brands/
│           │   └── bench/
│           ├── golden/             # approved reference images
│           └── *.test.ts
└── examples/
    └── workflows/                  # example GitHub workflow files
```

---

## 9. Data model: Facts and provenance

### 9.1 Provenance (every fact has one)

```ts
type SourceId =
  | "git"            // local git repository
  | "package-json"
  | "readme"
  | "changelog"
  | "github-api"
  | "npm-api"
  | "bench-file"
  | "user-config"    // explicitly set by the user in config or CLI flags
  | "brand";

interface Provenance {
  source: SourceId;
  ref: string;         // precise pointer: "package.json#version", "git tag v2.0.0",
                       // "GET /repos/akii09/pdfx stargazers_count", "bench.json#metrics[0].after"
  fetchedAt: string;   // ISO 8601
}

interface Fact<T> {
  value: T;
  provenance: Provenance;
}
```

**Rule:** any value rendered on a card that is a number, date, version, count, or percentage **must** be a `Fact` or be computed from `Fact`s by code (the computation is recorded in the manifest, e.g. `"percentChange": { "computedFrom": ["metrics[0].before", "metrics[0].after"] }`).

### 9.2 Facts shape (v1)

```ts
interface Facts {
  project: {
    name: Fact<string>;
    tagline?: Fact<string>;
    url?: Fact<string>;           // homepage or repo URL
    repo?: Fact<string>;          // "owner/name"
    npmPackage?: Fact<string>;
    license?: Fact<string>;
  };
  release?: {
    version: Fact<string>;        // "2.0.0" (tag without leading "v")
    tag: Fact<string>;            // "v2.0.0"
    previousVersion?: Fact<string>;
    date: Fact<string>;
    features: Fact<string>[];     // changelog/conventional "feat" entries
    fixes: Fact<string>[];
    breaking: Fact<string>[];
    commitCount?: Fact<number>;
    contributors?: Fact<string[]>;   // display names or GitHub logins
    codeSnippet?: Fact<{ code: string; lang: string }>;
  };
  metrics?: {
    stars?: Fact<number>;
    weeklyDownloads?: Fact<number>;
    contributorCount?: Fact<number>;
  };
  bench?: {
    title: Fact<string>;
    metrics: Array<{
      label: Fact<string>;
      before: Fact<number>;
      after: Fact<number>;
      unit: Fact<string>;         // "ms", "KB", "s", "%"
      better: Fact<"lower" | "higher">;
    }>;
    note?: Fact<string>;          // e.g. "vitest bench, M4, 2026-09-10"
  };
}
```

### 9.3 Missing facts

If a template needs a fact that is missing, the template must degrade gracefully (hide the element) and the manifest must record a `missing` entry. Never fill a missing number with a placeholder or estimate.

---

## 10. Brand kit (`brand.json`)

### 10.1 Location and precedence

File: `.shipseal/brand.json`, created by `shipseal init`, committed to the repo.

Resolution order (first wins, per field):

1. CLI flags (e.g. `--primary "#ff4d4d"`)
2. `.shipseal/brand.json`
3. W3C Design Tokens (DTCG) file referenced by `brand.tokens`, if present
4. Auto-detection (Section 10.3), used only by `init` and as a fallback when no brand.json exists
5. Built-in defaults

### 10.2 Schema (v1)

```json
{
  "$schema": "https://shipseal.dev/schema/brand.v1.json",
  "version": 1,
  "name": "PDFx",
  "tagline": "React PDF components, shadcn style",
  "url": "https://github.com/akii09/pdfx",
  "logo": {
    "light": "./assets/logo.svg",
    "dark": "./assets/logo-dark.svg"
  },
  "colors": {
    "background": "#0b0b0c",
    "foreground": "#fafafa",
    "muted": "#a1a1aa",
    "primary": "#ff4d4d",
    "accent": "#fbbf24"
  },
  "fonts": {
    "heading": { "family": "Geist", "weight": 700 },
    "body": { "family": "Geist", "weight": 400 },
    "mono": { "family": "Geist Mono", "weight": 400 }
  },
  "radius": 16,
  "theme": "dark",
  "style": "minimal",
  "tokens": null
}
```

Field rules:

- `colors.*`: hex strings. `background` and `foreground` required; others optional with derived defaults.
- `fonts.*.file`: optional path to a TTF/OTF/WOFF/WOFF2 file for custom fonts. If absent, use bundled Geist.
- `theme`: `"dark" | "light"`. Templates render both; this is the default.
- `style`: `"minimal"` only in v1 (reserved for future styles).
- `tokens`: optional path to a DTCG `.tokens.json` file. Do not invent a competing token standard; read DTCG where it exists.

### 10.3 Detection pipeline (`shipseal init`)

Run all detectors, score candidates, then show the result to the user for confirmation.

| Field | Detection sources, in order |
|---|---|
| name | `package.json#name` (strip scope), README first `# H1`, repo name |
| tagline | `package.json#description`, first README paragraph after H1 (strip badges/images) |
| url | `package.json#homepage`, `package.json#repository`, `git remote get-url origin` |
| logo | `logo.svg`/`logo.png` in: repo root, `assets/`, `public/`, `.github/`, `docs/`, `static/`, `branding/`; then `favicon.svg` |
| colors | Tailwind v4 `@theme { --color-* }` in CSS files; Tailwind v3 `theme.extend.colors` in `tailwind.config.*`; CSS `:root` variables named `--primary`, `--brand`, `--accent`, `--background`, `--foreground`; dominant non-neutral color of the SVG logo |
| fonts | Custom font files in `public/fonts` or `assets/fonts`; otherwise Geist |

Rules:

- Never execute project code to read config. Parse files statically. For `tailwind.config.js/ts`, extract color literals with a conservative parser and fall back to defaults if unsure.
- Always ensure sufficient contrast between `background` and `foreground` (WCAG AA for large text, ratio at least 3:1). If detected colors fail, adjust `foreground` and tell the user.
- `init` prints what it detected and where it found each value, then asks for confirmation (skippable with `--yes`).

---

## 11. Configuration (`config.json`)

File: `.shipseal/config.json`. All fields optional.

```json
{
  "$schema": "https://shipseal.dev/schema/config.v1.json",
  "version": 1,
  "outputDir": ".shipseal/output",
  "formats": ["og", "github-social", "x", "linkedin"],
  "release": {
    "templates": ["release-hero", "release-highlights", "code-card"],
    "maxHighlights": 4,
    "changelogPath": "CHANGELOG.md",
    "snippet": null
  },
  "milestones": {
    "stars": [100, 250, 500, 1000, 2500, 5000, 10000],
    "downloads": [1000, 10000, 100000, 1000000],
    "contributors": [10, 25, 50, 100]
  },
  "bench": {
    "file": ".shipseal/bench.json"
  },
  "copy": {
    "llm": false,
    "provider": null,
    "model": null,
    "maxRetries": 2
  },
  "output": {
    "imageFormat": "png"
  },
  "attribution": true
}
```

- `release.snippet`: optional `"path/to/file.ts#L10-L24"` to force the code card snippet.
- `copy.llm`: false by default. When true, requires an API key in the environment (never in config files).
- `attribution`: when true, adds a small "made with shipseal.dev" mark to cards. Users can set it to false; it is never forced.
- Environment variables: `GITHUB_TOKEN` (optional, raises API limits and enables release asset upload), `SHIPSEAL_LLM_API_KEY` (or the provider's standard variable, decided in Phase 2).

---

## 12. Sources (data collectors)

Each source is a function returning partial `Facts` with provenance. Sources never throw for missing optional data; they return nothing and let templates degrade.

### 12.1 git

- Current tag: from event or `git describe --tags --abbrev=0`.
- Previous tag: the tag before the current one in version order (`git tag --sort=-v:refname`).
- Commits between tags: `git log <prev>..<tag> --pretty=format:...`.
- Conventional Commit parsing: `feat`, `fix`, `perf`, `!`/`BREAKING CHANGE:` footers. Strip scopes for display; keep the original for the manifest.
- Contributors: unique commit authors between tags (dedupe by email). Exclude bots (`[bot]` suffix, `dependabot`, `renovate`, `github-actions`).
- In GitHub Actions, `actions/checkout` uses shallow clones by default. The Action must use `fetch-depth: 0` (Section 19) or git facts will be incomplete. `doctor` warns about shallow clones.

### 12.2 package-json

`name`, `description`, `version`, `homepage`, `repository`, `license`. For monorepos, support `--package <path>` to pick a workspace package.

### 12.3 readme

H1 title, first descriptive paragraph (strip badges, HTML, images), and the first fenced code block with a language tag (candidate for the code card).

### 12.4 changelog

Support two formats:

- **Keep a Changelog**: `## [2.0.0] - 2026-09-10` then `### Added`, `### Fixed`, `### Changed`, `### Removed`.
- **Changesets**: `## 2.0.0` then `### Major Changes`, `### Minor Changes`, `### Patch Changes`.

Map sections to `features`, `fixes`, `breaking`. Strip commit hashes, PR links, and author mentions from display text (keep them in the manifest). Changelog entries take priority over commit messages when both exist.

### 12.5 github-api

Unauthenticated works for public repos with low rate limits; `GITHUB_TOKEN` recommended.

- `GET /repos/{owner}/{repo}`: `stargazers_count`, `description`, `homepage`, `license`.
- `GET /repos/{owner}/{repo}/releases/tags/{tag}`: release body (fallback for features when no changelog).
- Contributors (optional): `GET /repos/{owner}/{repo}/contributors` for counts.

Handle rate limits with a clear error message. Cache responses in memory per run.

### 12.6 npm-api

`GET https://api.npmjs.org/downloads/point/last-week/{package}` → `downloads`. Scoped packages must be URL-encoded. Verify endpoint behavior before implementing.

### 12.7 bench-file

User or CI writes `.shipseal/bench.json`:

```json
{
  "title": "Rendering got faster",
  "metrics": [
    { "label": "Render time", "before": 420, "after": 87, "unit": "ms", "better": "lower" },
    { "label": "Bundle size", "before": 2800, "after": 1900, "unit": "KB", "better": "lower" }
  ],
  "note": "vitest bench, Mac Mini M4, 2026-09-10"
}
```

Code computes percent change: for `better: "lower"`, `(before - after) / before`; for `"higher"`, `(after - before) / before`. Round to whole percent for display. If the change is a regression, the card must say so honestly (never flip the framing).

---

## 13. Copy layer (optional LLM)

### 13.1 Copy slots

Templates declare text **slots**. The copy layer fills them.

| Slot | Example | Max length (chars) |
|---|---|---|
| `headline` | "QR and barcode support" | 48 |
| `subheadline` | "Render scannable codes in any PDF component" | 90 |
| `highlights[]` | "New `<QRCode>` component" | 56 each, max 4 |
| `cta` | "npm i pdfx" | 32 |
| `milestoneLine` | "Thank you for 1,000 stars" | 48 |

Numbers inside copy (like "1,000") are **inserted by code from facts**, never written by the LLM (see 13.3).

### 13.2 Deterministic copy (default, no LLM)

Rules, in order:

- `headline`: first `features` entry, cleaned (sentence case, no trailing period). Fallback: `"{name} {version}"`.
- `subheadline`: project tagline. Fallback: second feature entry.
- `highlights`: first N features, then fixes, then breaking changes (breaking changes are labeled).
- `cta`: `npm i {npmPackage}` if published to npm, else the repo URL without protocol.
- Milestone lines use fixed phrasing templates with the number interpolated from facts.

### 13.3 LLM copy (opt-in)

- Input to the LLM: facts **with all numbers replaced by placeholders** (`{stars}`, `{version}`), slot names, max lengths, brand voice hint.
- Output: strict JSON validated by zod against the slot schema.
- **Number guard** (`copy/number-guard.ts`): after the LLM responds, scan every string for digits. Any digit sequence that does not come from a placeholder expansion causes rejection. Retry up to `copy.maxRetries`, then fall back to deterministic copy for that slot and log a warning.
- Length guard: reject strings longer than the slot maximum; retry or fall back.
- Style guard: strip em dashes and exclamation marks by default (configurable later).
- The LLM is called **once per event** (all slots in one request) to keep cost negligible.
- Never send secrets, full source code, or private data. Only changelog lines, tagline, and names.

---

## 14. Templates and formats

### 14.1 Template contract

```ts
interface TemplateDefinition<Props> {
  id: string;                          // "release-hero"
  events: ShipsealEvent["kind"][];     // which events can use it
  formats: FormatId[];                 // which sizes it supports
  propsSchema: ZodType<Props>;         // validated before render
  slots: Record<string, TextSlotSpec>; // for copy + fitting (Section 15)
  buildProps(facts: Facts, copy: Copy, brand: Brand): Props;
  render(props: Props, ctx: RenderContext): JSX.Element;
}

interface RenderContext {
  format: Format;                      // width, height, id
  theme: "dark" | "light";
  brand: Brand;
  fitted: Record<string, FittedText>;  // results from the fitting pass
}
```

Templates are **pure functions**: no I/O, no randomness, no `Date.now()`. Dates come from facts.

Templates must be designed per format, not just scaled. A 1200×630 layout and a 1080×1350 layout need different arrangements. Use `ctx.format` to switch layouts.

Only use CSS features Takumi supports (flex, grid, absolute positioning, gradients, border radius, `background-clip: text`, etc.). Confirm against Takumi docs; do not assume browser parity.

### 14.2 Formats

All sizes live in `src/formats.ts` in one table. Verify each against the platform's current guidance before launch.

| FormatId | Size (px) | Use |
|---|---|---|
| `og` | 1200×630 | Open Graph link previews |
| `github-social` | 1280×640 | GitHub repository social preview |
| `x` | 1200×675 | X post image (16:9) |
| `linkedin` | 1200×627 | LinkedIn post image |
| `square` | 1080×1080 | Instagram / generic square (later) |
| `portrait` | 1080×1350 | LinkedIn carousel page (later) |
| `producthunt` | 1270×760 | Product Hunt gallery (later) |
| `readme-banner` | 1280×400 | README header (later) |

Safe zones: keep critical text at least 64px from edges on landscape formats (platform UIs crop and overlay).

### 14.3 v1 templates

| Template | Events | Content | Formats |
|---|---|---|---|
| `release-hero` | release | Logo, project name, version badge, headline, subheadline, CTA | og, github-social, x, linkedin |
| `release-highlights` | release | "What's new in vX", up to 4 highlights, breaking-change label | x, linkedin |
| `code-card` | release | Headline + syntax-highlighted snippet (max ~14 lines) | x, linkedin |
| `milestone` | milestone | Big number, metric label, thank-you line, logo | og, x, linkedin |
| `bench` | bench | Title, up to 3 metrics as before → after with percent change | x, linkedin |

Each template supports `dark` and `light`. Default output renders the brand's `theme` only; `--themes both` renders both.

### 14.4 Design quality bar

- Clear hierarchy: one dominant element per card (headline or big number).
- Generous whitespace; consistent spacing scale (8px base).
- Brand primary color used for accents, not large text blocks, unless contrast passes.
- Readable at small sizes: headline at least 56px on 1200-wide formats; body at least 28px.
- The owner reviews every template visually before it is marked done. "Looks generated" is a failing grade.

---

## 15. Text fitting and layout checks

### 15.1 Slot spec

```ts
interface TextSlotSpec {
  maxLines: number;        // e.g. headline: 2
  maxFontSize: number;     // e.g. 72
  minFontSize: number;     // e.g. 48
  step: number;            // e.g. 4
  box: { width: number };  // available width in px for this format (per-format override allowed)
}
```

### 15.2 Algorithm

For each text slot, per format:

1. Try font sizes from `maxFontSize` down to `minFontSize` in `step` increments.
2. At each size, measure line count within `box.width` using the actual font.
3. First size where `lines <= maxLines` wins.
4. If none fits:
   - If LLM copy is enabled: request a shorter variant for that slot (counts toward `maxRetries`), then repeat.
   - Otherwise: truncate at a word boundary with an ellipsis at `minFontSize`.
   - Record a `fit-warning` in the manifest.
5. With `--strict`, any `fit-warning` makes the command exit with code 2.

### 15.3 Measurement

Preferred: Takumi's own text measurement (the Rust crate exposes measured node and text-run types). **Spike required** (Section 24) to confirm whether `takumi-js` exposes measurement to JavaScript. Fallbacks, in order:

1. Render the text node alone in Takumi and read its laid-out size, if the JS API returns layout info.
2. Measure with font metrics via a small font-parsing library (decide during the spike; Rule R7 applies).

Measurement must use the same font files as rendering, or results will drift.

---

## 16. Renderer adapter (Takumi)

### 16.1 Interface

```ts
interface RendererAdapter {
  render(element: JSX.Element, opts: {
    width: number;
    height: number;
    format: "png" | "webp" | "jpeg";
    fonts: FontAsset[];
  }): Promise<Uint8Array>;

  measureText?(text: string, opts: {
    font: FontAsset;
    fontSize: number;
    maxWidth: number;
    lineHeight: number;
  }): Promise<{ lines: number; width: number; height: number }>;
}
```

### 16.2 Rules

- `src/render/takumi.ts` is the only file that imports Takumi (Rule R4).
- Pin the Takumi version exactly in `package.json`. Upgrade deliberately, with golden-image tests passing.
- Load fonts once per process and reuse (Takumi recommends reusing its context for performance).
- Images (logos) are read from disk and passed as data or buffers; no network fetches during render.
- Confirm how `takumi-js` accepts JSX (React elements vs its own helpers like `container()`/`text()`). If JSX requires React at runtime, record the decision and its dependency cost.

---

## 17. Outputs and manifest

### 17.1 Directory layout

```
.shipseal/output/<event-id>/
  <template>-<format>[-<theme>].png
  manifest.json
```

`<event-id>`: `v2.0.0` for releases, `milestone-stars-1000`, `bench-<yyyy-mm-dd>`.

Examples: `release-hero-og.png`, `release-hero-x-light.png`, `milestone-linkedin.png`.

Add `.shipseal/output/` to `.gitignore` during `init` (ask first).

### 17.2 manifest.json

```json
{
  "shipseal": "1.0.0",
  "event": { "kind": "release", "tag": "v2.0.0", "previousTag": "v1.9.0" },
  "generatedAt": "2026-09-11T10:00:00Z",
  "brand": { "name": "PDFx", "theme": "dark", "source": ".shipseal/brand.json" },
  "copy": { "mode": "deterministic" },
  "files": [
    {
      "path": "release-hero-og.png",
      "template": "release-hero",
      "format": "og",
      "width": 1200,
      "height": 630,
      "bytes": 48213,
      "sha256": "…"
    }
  ],
  "facts": {
    "release.version": { "value": "2.0.0", "source": "git", "ref": "git tag v2.0.0" },
    "metrics.stars": { "value": 1042, "source": "github-api", "ref": "GET /repos/akii09/pdfx stargazers_count", "fetchedAt": "…" }
  },
  "computed": {
    "bench.metrics[0].percent": { "value": 79, "computedFrom": ["bench.metrics[0].before", "bench.metrics[0].after"] }
  },
  "warnings": [
    { "type": "fit-warning", "template": "release-hero", "format": "x", "slot": "headline", "action": "truncated" }
  ],
  "missing": [
    { "template": "release-hero", "fact": "project.npmPackage", "effect": "cta hidden" }
  ]
}
```

The manifest is the proof behind "verified visuals." Keep it human-readable.

---

## 18. CLI specification

Binary: `shipseal`. All commands support `--cwd <path>`, `--json` (machine-readable output), `--quiet`, `--verbose`.

### 18.1 `shipseal init`

Detect brand, write `.shipseal/brand.json` and `.shipseal/config.json`, optionally update `.gitignore`, render one sample `release-hero-og.png` so the user sees the result immediately.

Flags: `--yes` (accept detections), `--force` (overwrite existing files).

### 18.2 `shipseal release`

Generate the release pack.

| Flag | Default | Meaning |
|---|---|---|
| `--tag <tag>` | latest tag | Release tag |
| `--from <tag>` | previous tag | Compare base |
| `--formats <list>` | from config | e.g. `og,x` |
| `--templates <list>` | from config | e.g. `release-hero` |
| `--themes <dark\|light\|both>` | brand theme | |
| `--no-copy` | | Force deterministic copy |
| `--out <dir>` | from config | Output directory |
| `--strict` | off | Fit warnings exit with code 2 |
| `--dry-run` | off | Collect facts and print them; render nothing |
| `--package <path>` | repo root | Monorepo package selection |

### 18.3 `shipseal milestone`

Detect current metric values and generate a card for the highest threshold crossed.

Flags: `--metric <stars|downloads|contributors>`, `--threshold <n>` (force a specific threshold), plus shared output flags. If no threshold is crossed, exit 0 with a clear message and generate nothing.

### 18.4 `shipseal bench`

Generate benchmark cards from `.shipseal/bench.json` or `--file <path>`.

### 18.5 `shipseal doctor`

Check: Node version, git available, shallow clone, brand.json valid, fonts load, logo readable, `GITHUB_TOKEN` present (info only), Takumi renders a test card. Print pass/fail per check with fixes.

### 18.6 Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (warnings allowed unless `--strict`) |
| 1 | Error (invalid config, missing required fact, render failure) |
| 2 | Warnings present with `--strict` |

---

## 19. GitHub Action specification

### 19.1 Type

**Composite action** at the repo root (`action.yml`) that sets up Node and runs the published CLI with `npx shipseal@<pinned-version>`. This avoids bundling Takumi's native binaries into a JavaScript action.

### 19.2 Inputs

| Input | Default | Meaning |
|---|---|---|
| `command` | `release` | `release`, `milestone`, or `bench` |
| `formats` | config | Comma-separated formats |
| `upload-assets` | `true` | Upload images to the GitHub release |
| `artifact` | `true` | Also upload the output folder as a workflow artifact |
| `strict` | `false` | Fail the job on fit warnings |
| `llm` | `false` | Enable LLM copy (requires a secret) |
| `version` | pinned | Shipseal version to run |

### 19.3 Minimal user workflow

```yaml
name: Shipseal
on:
  release:
    types: [published]

permissions:
  contents: write   # required to upload release assets

jobs:
  visuals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # required: full history and tags for release facts
      - uses: akii09/shipseal@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Verify current major versions of `actions/checkout` and `actions/setup-node` before publishing examples.

### 19.4 Behavior

1. Setup Node (version per Section 7).
2. Run `npx shipseal@<version> <command> --json`.
3. Upload files to the release with `gh release upload <tag> <files> --clobber` (the `gh` CLI is preinstalled on GitHub-hosted runners; verify).
4. Write a job summary (`$GITHUB_STEP_SUMMARY`) with thumbnails and the list of facts used.

---

## 20. Testing strategy

| Layer | What | How |
|---|---|---|
| Sources | Parse git, changelog (both formats), README, package.json | Fixture repos created by a setup script (`test/fixtures/make-repos.ts`) with known tags and commits |
| Brand detection | Tailwind v3, Tailwind v4 `@theme`, CSS vars, logo discovery, contrast fix | Fixture folders in `test/fixtures/brands/` |
| Facts | Schema validation, provenance attached everywhere | Unit tests; a test that fails if any rendered number lacks provenance |
| Number guard | LLM strings with invented digits are rejected | Unit tests with adversarial strings ("3x faster", "over 1k users", "v2") |
| Copy | Deterministic rules produce expected text | Table-driven tests |
| Fitting | Long headlines shrink, then truncate with warning | Unit tests with known fonts |
| Templates | Visual output unchanged | **Golden image tests**: render with fixture facts, compare to `test/golden/*.png` with pixelmatch, tolerance ≤ 0.1% differing pixels. Updating goldens requires `pnpm test:update-golden` and owner review. |
| CLI | End-to-end on fixture repos | Run the built CLI, assert exit codes, files, and manifest content |
| Action | Real run | A workflow in the Shipseal repo that runs the Action on its own releases (dogfooding) |

Determinism test: render the same card twice in one process and in two processes; outputs must match.

---

## 21. Phased roadmap with acceptance criteria

Durations are rough estimates for one part-time developer and will change. A phase is done only when every acceptance criterion passes.

### Phase 0: Validate demand (before writing product code)

Goal: prove people want this before building it.

Tasks:
1. Hand-build a release pack for the next PDFx release using Takumi and a throwaway script: hero (og, x, linkedin), highlights card, one milestone card.
2. Post them on X and LinkedIn as part of the normal release announcement. In replies or a follow-up post, ask: "Would you want this generated for your repo automatically?"
3. Share in 2 to 3 developer communities where self-promotion is allowed.
4. Collect signals in `docs/validation.md`.

Acceptance criteria (proceed to Phase 1 if at least two are true):
- At least 10 people ask for it or ask how it was made.
- At least 3 maintainers offer their repo as a test case.
- The hand-built visuals clearly outperform the owner's previous text-only release posts (impressions or engagement).

If signals are weak: stop, record learnings, and reassess before investing further.

### Phase 1: Foundations and spikes (about 1 to 2 weeks)

Tasks:
1. Run all spikes in Section 24 and record results in Section 25.
2. Scaffold the repo (Section 8), tooling, CI (lint, typecheck, test).
3. Implement `facts/` schemas and the `fact()` helper.
4. Implement the renderer adapter with Takumi and one hard-coded test card.
5. Implement `brand/` schema and detection; implement `shipseal init` and `shipseal doctor`.

Acceptance criteria:
- `npx shipseal init` on the PDFx repo produces a correct brand.json (name, tagline, a sensible primary color, logo found) and a sample card.
- `shipseal doctor` passes on the owner's machines (Mac Mini M4, MacBook Air M5) and on `ubuntu-latest` in CI.
- Rendering a 1200×630 card takes under 500ms on the owner's machine (excluding first-run font load).

### Phase 2: Release pack (about 2 to 3 weeks)

Tasks:
1. Sources: git, package-json, readme, changelog, github-api.
2. Deterministic copy + number guard.
3. Fitting (Section 15).
4. Templates: `release-hero`, `release-highlights`, `code-card` (dark + light, all v1 formats).
5. Outputs + manifest.
6. `shipseal release` command.
7. Optional LLM copy behind `copy.llm`.
8. Golden image tests.

Acceptance criteria:
- On the PDFx repo, `npx shipseal release --no-copy` generates all v1 release files with zero fit warnings.
- Every number on every card appears in `manifest.facts` or `manifest.computed` with provenance (enforced by a test).
- A deliberately long headline fixture produces a truncation warning, never overflow.
- The owner rates each template as "would post this without edits."

### Phase 3: Milestones, benchmarks, GitHub Action (about 1 to 2 weeks)

Tasks:
1. npm source; `milestone` template and command.
2. bench-file source; `bench` template and command.
3. Composite Action, job summary, release asset upload.
4. Dogfood: the Shipseal repo uses its own Action on every release.

Acceptance criteria:
- A test repository with the minimal workflow (Section 19.3) gets images attached to its release automatically.
- `shipseal milestone` on PDFx produces a correct 1,000-stars card with provenance.
- A bench fixture showing a regression is rendered honestly as a regression.

### Phase 4: Launch (about 1 week)

Tasks:
1. README with generated visuals of Shipseal itself, a 30-second GIF of the flow, and the two-line install.
2. Minimal docs site at shipseal.dev: what it is, quick start, config reference, templates gallery, FAQ.
3. Onboard the 3+ maintainers from Phase 0 before the public launch.
4. Launch sequence (Section 22).

Acceptance criteria:
- A new user goes from zero to images attached to a release in under 5 minutes, following only the README.
- At least 3 external repos use the Action before launch day.

### Phase 5+: Post-launch

Pick from Section 4.2 based on real user requests, not assumptions. Record each choice in the Decisions log.

---

## 22. Launch and distribution plan

**Built-in distribution:** every shared card spreads the tool. Add a small, tasteful "made with shipseal.dev" mark on free output, removable via config (`"attribution": false`). Never force it.

**Dogfooding:** Shipseal announces its own releases with Shipseal-generated visuals. PDFx does the same.

**Launch sequence:**
1. Soft launch: onboard Phase 0 maintainers; fix their issues.
2. Show HN post focused on the verified-numbers angle and the manifest.
3. X thread by the owner: the problem, a before/after of release posts, the one-line YAML.
4. Product Hunt launch (owner has prior PH launch experience with PDFx Builder).
5. Submit to awesome lists (GitHub Actions, developer tools, OG image tools).
6. Offer to generate visuals for notable open-source releases (with permission) as showcases.

**Success metrics (first 90 days after launch):**
- Repos using the Action (search GitHub code for `uses: akii09/shipseal`).
- npm weekly downloads of `shipseal`.
- GitHub stars.
- Number of Shipseal-made cards seen in the wild.
- Qualitative: unsolicited posts from users sharing their generated cards.

---

## 23. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Weak demand | Medium | High | Phase 0 validation before building. Stop early if signals are weak. |
| Takumi API churn or breaking changes | High | Medium | Adapter isolation (R4), exact version pin, golden tests on upgrade. |
| Takumi native binary fails on some platform | Medium | Medium | `doctor` detects it; investigate Takumi's WASM build as fallback (Section 24). |
| Output looks "template-y" | Medium | High | Few templates, high design bar (14.4), owner review gate. |
| Close competitor (shipshot) expands into the same space | Medium | Medium | Move faster on the differentiators: events, brand kit, manifest, Action. |
| Brand detection picks wrong colors | High | Low | Show detections with sources in `init`; easy override; contrast guard. |
| LLM invents numbers or claims | Medium | High | Placeholders + number guard + deterministic fallback (Section 13.3). |
| Platform image sizes change | Low | Low | Sizes centralized in `formats.ts`. |
| Owner bandwidth (many parallel projects) | High | High | Strict v1 scope, phase gates, no Phase 5 work before launch. |

---

## 24. Known unknowns (spikes to run first)

Each spike is time-boxed to half a day. Record results in Section 25.

| # | Question | How to answer | Decision it unblocks |
|---|---|---|---|
| S1 | What is the current Takumi JS package name and render API? Does it accept React JSX directly, and does that require React at runtime? | Read takumi.kane.tw/docs; render a card from JSX and from helpers | Template authoring approach, dependency list |
| S2 | Does `takumi-js` expose text measurement or layout info to JavaScript? | Docs + experiment | Fitting implementation (Section 15.3) |
| S3 | Does the native binary run on `ubuntu-latest` GitHub runners, macOS arm64, and Windows? Is there a usable WASM fallback? | Minimal CI matrix | Action design, platform support statement |
| S4 | Which fonts are bundled with Takumi, and how are custom fonts loaded? | Docs + experiment | Font handling in brand kit |
| S5 | Can Takumi render many colored inline spans (shiki tokens) fast enough for a 14-line code card? | Benchmark | Code card feasibility |
| S6 | Output file sizes: PNG vs WebP for each format; do platforms accept WebP for uploads? | Render + check platform docs | Default `imageFormat` |
| S7 | Tailwind v4 `@theme` parsing: how reliably can colors be extracted statically? | Test on PDFx docs site and 3 other repos | Brand detection scope |

---

## 25. Decisions log

Append-only. Format: date, decision, reason, alternatives rejected.

| Date | Decision | Reason | Alternatives rejected |
|---|---|---|---|
| 2026-09 | Project name **Shipseal**, domain `shipseal.dev`, npm `shipseal` | Short, "seal" implies verified; .dev and npm available | Shipstamp (.dev taken), Shipshot (existing competitor), Shipmark (existing release CLI) |
| 2026-09 | Standalone project, separate from PDFx | Different user and job (marketing releases vs generating documents in apps) | Building under the PDFx brand |
| 2026-09 | Use Takumi for rendering; do not build a renderer | Takumi already supports grid, z-index, calc, WOFF2, RTL, animation, PDF, WASM | Own engine; Satori (flexbox only, no WOFF2/RTL); headless browser |
| 2026-09 | LLM optional and words-only; numbers only from sources | "Verified visuals" is the core differentiator | LLM-designed images; LLM-written stats |
| 2026-09 | Single npm package in v1 | Avoid premature package splitting | core/render/providers package split |
| 2026-09 | Composite GitHub Action running `npx shipseal` | Avoid bundling native binaries into a JS action | JavaScript action with bundled dist; Docker action |
| 2026-09 | Brand kit compatible with W3C Design Tokens | Adopt an existing standard instead of inventing one | Proposing `brand.json` as a new standard |
| 2026-09 | v1 scope: release pack, milestones, benchmarks, CLI, Action | Smallest set that proves the value | Visual PRs, scheduling, hosted tier, template marketplace |
| _(Phase 1)_ | Build tool: tsdown or tsup | _to decide after spike_ | |
| _(Phase 1)_ | CLI framework: cac or commander | _to decide_ | |
| _(Phase 2)_ | LLM provider approach | _to decide_ | |

---

## 26. Rejected ideas (do not reintroduce)

These were researched in depth and rejected. Do not propose them again without new evidence and owner approval.

| Idea | Why rejected |
|---|---|
| "Remotion for images" / general image-as-code framework | Takumi and Satori already exist; Vercel json-render covers the AI-spec-to-render layer (including an image renderer). |
| Agent layer over Satori/Takumi (catalog, guardrails) | Vercel json-render already does this with many renderers. |
| Visual PR summaries / diagrams from diffs | CodeRabbit already generates PR sequence diagrams; diffs lack the data (e.g. cache hit rates), so an LLM would invent numbers, violating R1; different buyer. |
| Self-healing UI loop with a browser-free renderer | Browser-free renderers cannot run real app components (hooks, state, CSS files); Chrome DevTools MCP already gives agents real browser access. |
| Edge-native AI video framework | Takumi already renders keyframe animations; Remotion (with a hugely popular agent skill), Revideo, and json-render's Remotion renderer cover it. |
| Generative UI to image fallback for chat platforms | Vercel Chat SDK renders JSX cards natively on Slack, Teams, Discord, WhatsApp, etc. Possible small plugin idea only. |
| Agent observability / session replay ("AgentLens") | Entire (ex-GitHub CEO, $60M seed) ships Checkpoints doing exactly this. |
| Agent firewall | Hundreds of repos; HOL Guard, pipelock, Belay; built-in hooks and sandboxes in agents. |
| MCP gateway | Crowded (Docker, many OSS gateways); Anthropic Tool Search built into clients. |
| Agent memory, context compilers | Crowded (Mem0, Letta, Zep; AGENTS.md ecosystem). Owner's earlier ContextOS was partly absorbed by AGENTS.md. |
| Spec-to-software compilers | Crowded (GitHub Spec Kit, AWS Kiro, Tessl, BMAD). |
| Agent "lie detector" / task-completion verifier | groundtruth, agent-polygraph, DoneSpec, TestSprite CLI already exist. |
| Standalone "repo to one OG image" | Commoditized by many agent skills and CLIs. Only valuable as part of the full pack. |

---

## 27. Glossary

| Term | Meaning |
|---|---|
| **Event** | Something that triggers generation: release, milestone, or bench. |
| **Fact** | A value with provenance (where it came from and when). |
| **Provenance** | Source id + precise reference + timestamp for a fact. |
| **Source** | A collector that reads facts from git, files, or APIs. |
| **Copy** | Words placed on cards (headline, highlights). Never numbers invented by an LLM. |
| **Slot** | A named text area in a template with length and fitting rules. |
| **Template** | A pure function that turns props into a JSX layout for one or more formats. |
| **Format** | A target size and platform, e.g. `og` = 1200×630. |
| **Pack** | All files generated for one event. |
| **Manifest** | `manifest.json` describing every file, fact, computation, and warning in a pack. |
| **Brand kit** | `.shipseal/brand.json`: name, colors, fonts, logo, theme. |
| **Fitting** | Choosing font sizes and line breaks so text fits its slot without overflow. |
| **Renderer adapter** | The only module that talks to Takumi. |
| **Golden image** | An approved reference render used to detect visual regressions. |

---

## Appendix A: `AGENTS.md` (place at repo root)

```md
# AGENTS.md

Read `docs/PROJECT_PLAN.md` Section 0 before any task. Summary of hard rules:

1. Never let an LLM produce a number shown on a card. Numbers come from Sources with provenance.
2. No headless browsers and no image-generation models in dependencies.
3. Only `src/render/takumi.ts` may import Takumi.
4. Verify Takumi, GitHub, and npm APIs against current docs before using them.
5. Never ship overflowing text without a manifest warning.
6. Ask before adding dependencies or changing public interfaces.
7. Work one file at a time: explain the plan, get approval, then build.
8. Do not reintroduce ideas listed in Section 26 of the plan.
9. Update the Decisions log (Section 25) whenever a decision changes.
```

## Appendix B: First session checklist for a new agent

1. Read Sections 0, 1, 3, 4, and 6.
2. Check the current phase at the top of this file and in Section 21.
3. If Phase 1 spikes (Section 24) are not recorded in Section 25, do those first.
4. Propose the next single task, the file(s) involved, and the approach. Wait for approval.

## Appendix C: Agent tooling (added by scripts/scaffold.sh)

- `AGENTS.md` is the canonical, extended agent rulebook and supersedes Appendix A. (`AGENT.md` is not a standard filename; any legacy copy lives in `docs/AGENT.legacy.md`.)
- `CLAUDE.md` imports `AGENTS.md` and adds Claude Code specifics.
- `.claude/skills/` holds task playbooks: add-template, add-source, takumi-renderer, golden-images, run-spike, log-decision.
- `spikes/` is for throwaway §24 experiments; never shipped.
- `docs/validation.md` tracks Phase 0 signals.
- `scripts/scaffold.sh` regenerates this structure (skips existing files; `FORCE=1` overwrites).
