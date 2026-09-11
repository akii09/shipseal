import { fact } from "../../src/facts/fact.js";
import type { Facts } from "../../src/facts/schema.js";
import type { Brand } from "../../src/brand/schema.js";
import { DEFAULT_CONFIG, type Config } from "../../src/config/schema.js";

const fetchedAt = "2026-09-11T10:00:00.000Z";

export const FIXTURE_FACTS: Facts = {
  project: {
    name: fact("PDFx", { source: "package-json", ref: "package.json#name", fetchedAt }),
    tagline: fact("React PDF components, shadcn style", {
      source: "package-json",
      ref: "package.json#description",
      fetchedAt,
    }),
    npmPackage: fact("pdfx", { source: "package-json", ref: "package.json#name", fetchedAt }),
    url: fact("https://github.com/akii09/pdfx", {
      source: "package-json",
      ref: "package.json#homepage",
      fetchedAt,
    }),
    repo: fact("akii09/pdfx", { source: "package-json", ref: "package.json#repository", fetchedAt }),
  },
  metrics: {
    stars: fact(1042, { source: "github-api", ref: "GET /repos/akii09/pdfx stargazers_count", fetchedAt }),
    weeklyDownloads: fact(12000, { source: "npm-api", ref: "GET /downloads/point/last-week/pdfx downloads", fetchedAt }),
    contributorCount: fact(18, { source: "github-api", ref: "GET /repos/akii09/pdfx/contributors", fetchedAt }),
  },
  release: {
    version: fact("2.0.0", { source: "git", ref: "git tag v2.0.0", fetchedAt }),
    tag: fact("v2.0.0", { source: "git", ref: "git tag v2.0.0", fetchedAt }),
    previousVersion: fact("1.9.0", { source: "git", ref: "git tag v1.9.0", fetchedAt }),
    date: fact("2026-09-10", { source: "git", ref: "git log -1 --format=%cI v2.0.0", fetchedAt }),
    features: [
      fact("QR and barcode support", { source: "changelog", ref: "CHANGELOG.md Added", fetchedAt }),
      fact("Table header repeating", { source: "changelog", ref: "CHANGELOG.md Added", fetchedAt }),
    ],
    fixes: [fact("Fix page break in nested views", { source: "changelog", ref: "CHANGELOG.md Fixed", fetchedAt })],
    breaking: [],
    codeSnippet: fact(
      {
        lang: "tsx",
        code: `import { QRCode } from "pdfx";\n\nexport function Label() {\n  return (\n    <View>\n      <QRCode value="https://pdfx.dev" />\n    </View>\n  );\n}`,
      },
      { source: "readme", ref: "README.md first fenced code block", fetchedAt },
    ),
  },
};

const baseRelease = FIXTURE_FACTS.release;
if (baseRelease === undefined) {
  throw new Error("FIXTURE_FACTS.release is required");
}

export const LONG_HEADLINE_FACTS: Facts = {
  ...FIXTURE_FACTS,
  release: {
    ...baseRelease,
    features: [
      fact(
        "This headline is deliberately far too long to fit on a social card even after shrinking the font size down to the minimum allowed",
        { source: "changelog", ref: "CHANGELOG.md Added", fetchedAt },
      ),
    ],
  },
};

export const FIXTURE_BRAND: Brand = {
  version: 1,
  name: "PDFx",
  tagline: "React PDF components, shadcn style",
  url: "https://github.com/akii09/pdfx",
  colors: {
    background: "#0b0b0c",
    foreground: "#fafafa",
    muted: "#a1a1aa",
    primary: "#ff4d4d",
    accent: "#fbbf24",
  },
  fonts: {
    heading: { family: "Geist", weight: 700 },
    body: { family: "Geist", weight: 400 },
    mono: { family: "Geist Mono", weight: 400 },
  },
  radius: 16,
  theme: "dark",
  style: "minimal",
  tokens: null,
};

export const FIXTURE_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  formats: ["og", "x"],
  release: {
    ...DEFAULT_CONFIG.release,
    templates: ["release-hero", "release-highlights", "code-card"],
  },
  attribution: false,
};

export const MILESTONE_FACTS: Facts = {
  project: FIXTURE_FACTS.project,
  metrics: FIXTURE_FACTS.metrics,
  milestone: {
    metric: fact("stars", { source: "user-config", ref: "shipseal milestone --metric", fetchedAt }),
    threshold: fact(1000, { source: "user-config", ref: "config.json milestones.stars", fetchedAt }),
  },
};

export const BENCH_FACTS: Facts = {
  project: FIXTURE_FACTS.project,
  bench: {
    title: fact("Render time went up", { source: "bench-file", ref: ".shipseal/bench.json#title", fetchedAt }),
    metrics: [
      {
        label: fact("Render time", { source: "bench-file", ref: ".shipseal/bench.json#metrics[0].label", fetchedAt }),
        before: fact(87, { source: "bench-file", ref: ".shipseal/bench.json#metrics[0].before", fetchedAt }),
        after: fact(98, { source: "bench-file", ref: ".shipseal/bench.json#metrics[0].after", fetchedAt }),
        unit: fact("ms", { source: "bench-file", ref: ".shipseal/bench.json#metrics[0].unit", fetchedAt }),
        better: fact("lower", { source: "bench-file", ref: ".shipseal/bench.json#metrics[0].better", fetchedAt }),
      },
    ],
    note: fact("vitest bench fixture", { source: "bench-file", ref: ".shipseal/bench.json#note", fetchedAt }),
  },
};
