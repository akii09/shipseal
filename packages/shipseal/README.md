<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/akii09/shipseal/main/assets/brand/wordmark-white-800.png">
    <img src="https://raw.githubusercontent.com/akii09/shipseal/main/assets/brand/wordmark-800.png" alt="Shipseal" width="400">
  </picture>
</p>

<p align="center">
  <strong>Every release, sealed and ready to share.</strong>
</p>

Shipseal turns your repo's releases, milestones, and benchmarks into ready-to-post visuals: OG images, X and LinkedIn cards, GitHub social previews. On brand, at the right size, with **every number verified** from a real source.

> Status: **pre-alpha**. Not usable yet. Follow progress at [shipseal.dev](https://shipseal.dev).

## Install

```bash
npx shipseal init       # detect your brand once
npx shipseal release    # generate the release pack
```

## How it works

```
repo facts  ->  optional AI copy (words only)  ->  your brand + templates  ->  Takumi render  ->  image pack + manifest
```

Facts come from git, the GitHub API, npm, or your CI. An optional LLM writes words and never numbers, so every figure on a card is listed with its source in `manifest.json`. Rendering uses [Takumi](https://takumi.kane.tw): no headless browser, no image model, deterministic output.

## Commands

| Command | What it does |
|---|---|
| `shipseal init` | Detect brand (name, tagline, colors, logo, fonts) and write `.shipseal/` |
| `shipseal release` | Generate the release pack for a tag |
| `shipseal milestone` | Card for a crossed stars, downloads, or contributors threshold |
| `shipseal bench` | Before and after cards from a benchmark JSON file |
| `shipseal doctor` | Check the environment and report fixes |

## GitHub Action

```yaml
on: { release: { types: [published] } }
permissions: { contents: write }
jobs:
  visuals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - uses: akii09/shipseal@v0.0.6
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
```

`fetch-depth: 0` is required: release facts need full history and tags.

## Documentation

Full specification in [docs/PROJECT_PLAN.md](https://github.com/akii09/shipseal/blob/main/docs/PROJECT_PLAN.md). Contributions: read [AGENTS.md](https://github.com/akii09/shipseal/blob/main/AGENTS.md) first.

## License

MIT. The bundled Geist Mono font is licensed separately under the SIL Open Font License 1.1; see `assets/fonts/OFL.txt`.
