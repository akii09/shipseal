#!/usr/bin/env node
/**
 * Regenerate the images Shipseal shows of itself, using Shipseal.
 *
 * Writes the three README example cards and the docs site social preview, then rewrites the
 * version strings across the README and docs so the captions never claim an older release than
 * the images, and so the documented action reference names the tag being released.
 *
 * Run by `pnpm release` before a release is created, rather than by CI after one. Branch
 * protection requires a status check on pushes to main, which a workflow commit cannot
 * satisfy, and generating here keeps the diff visible before anything is published.
 *
 *   node scripts/refresh-showcase.mjs [--check]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const cli = join(root, "packages/shipseal/dist/cli.js");
const version = JSON.parse(readFileSync(join(root, "packages/shipseal/package.json"), "utf8")).version;
const tag = `v${version}`;

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "pipe" }).toString();

/**
 * The README cards come from this repository's own release, so they are real output.
 *
 * The tag usually does not exist yet: this runs inside `pnpm release`, before the release is
 * created, and `pnpm release` refuses when the tag already exists. So tag HEAD temporarily,
 * render, then remove it. The real tag lands on the same commit moments later.
 */
function readmeCards() {
  const out = mkdtempSync(join(tmpdir(), "shipseal-showcase-"));
  let temporary = false;
  try {
    run("git", ["rev-parse", "--verify", `${tag}^{commit}`], root);
  } catch {
    run("git", ["tag", tag], root);
    temporary = true;
  }
  try {
    run("node", [cli, "release", "--tag", tag, "--formats", "og,x", "--out", out], root);
  } finally {
    if (temporary) {
      run("git", ["tag", "-d", tag], root);
    }
  }
  const from = join(out, tag);
  const pairs = [
    ["release-hero-og.png", "release-hero.png"],
    ["release-highlights-x.png", "release-highlights.png"],
    ["code-card-x.png", "code-card.png"],
    ["release-hero-x.png", "release-hero-linkedin.png"],
  ];
  mkdirSync(join(root, "assets/examples"), { recursive: true });
  for (const [src, dest] of pairs) {
    copyFileSync(join(from, src), join(root, "assets/examples", dest));
  }
  rmSync(out, { recursive: true, force: true });
  return pairs.length;
}

/**
 * The social preview is evergreen rather than release-specific, so it is rendered from a
 * throwaway project whose changelog holds the product pitch instead of this release's notes.
 */
function ogImage() {
  const dir = mkdtempSync(join(tmpdir(), "shipseal-og-"));
  const brand = JSON.parse(readFileSync(join(root, ".shipseal/brand.json"), "utf8"));
  brand.logo = { light: "assets/logo.png" };
  brand.url = "https://shipseal.dev";

  mkdirSync(join(dir, "assets"), { recursive: true });
  mkdirSync(join(dir, ".shipseal"), { recursive: true });
  copyFileSync(join(root, "assets/brand/icon.png"), join(dir, "assets/logo.png"));
  writeFileSync(join(dir, ".shipseal/brand.json"), JSON.stringify(brand, null, 2));
  copyFileSync(join(root, ".shipseal/config.json"), join(dir, ".shipseal/config.json"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "shipseal",
      description: "Your release, as an image. Automatically.",
      homepage: "https://shipseal.dev",
      license: "MIT",
    }),
  );
  writeFileSync(join(dir, "README.md"), "# Shipseal\n\nYour release, as an image. Automatically.\n");
  writeFileSync(
    join(dir, "CHANGELOG.md"),
    `# shipseal\n\n## ${version}\n\n### Minor Changes\n\n- Release visuals from one line of YAML. Every number verified from your repo.\n`,
  );

  run("git", ["init", "-q"], dir);
  run("git", ["add", "-A"], dir);
  run("git", ["-c", "user.email=a@b", "-c", "user.name=shipseal", "commit", "-qm", tag], dir);
  run("git", ["tag", tag], dir);

  const out = join(dir, "out");
  run("node", [cli, "release", "--tag", tag, "--formats", "og", "--templates", "release-hero", "--out", out], dir);
  copyFileSync(join(out, tag, "release-hero-og.png"), join(root, "apps/docs/public/og.png"));
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Every file whose text names the released version.
 *
 * The action reference is the one that breaks people: `uses: akii09/shipseal@<tag>` has to
 * name a tag that exists, and a stale one fails a consumer's workflow with "unable to resolve
 * action" before a single step runs. `scripts/check-action-ref.mjs` guards that in CI.
 */
const versionedFiles = [
  "README.md",
  "packages/shipseal/README.md",
  "examples/workflows/shipseal.yml",
  "apps/docs/public/llms.txt",
  "apps/docs/src/pages/ai.astro",
  "apps/docs/src/pages/docs/quick-start.astro",
  "apps/docs/src/pages/docs/github-action.astro",
  "docs/PROJECT_PLAN.md",
  "scripts/scaffold.sh",
];

/** Keep the docs honest about which release they describe and which tag they tell people to use. */
function syncVersionStrings() {
  const changed = [];
  for (const relative of versionedFiles) {
    const path = join(root, relative);
    const before = readFileSync(path, "utf8");
    let after = before.replace(/akii09\/shipseal@v\d+\.\d+\.\d+/g, `akii09/shipseal@${tag}`);
    if (relative === "README.md") {
      after = after
        .replace(/for its own `v\d+\.\d+\.\d+` release/, `for its own \`${tag}\` release`)
        .replace(/\[v\d+\.\d+\.\d+ release\]/, `[${tag} release]`)
        .replace(/releases\/tag\/v\d+\.\d+\.\d+/g, `releases/tag/${tag}`);
    }
    if (before === after) {
      continue;
    }
    writeFileSync(path, after);
    changed.push(relative);
  }
  return changed;
}

if (!checkOnly) {
  const n = readmeCards();
  ogImage();
  syncVersionStrings();
  console.log(`Refreshed ${n} README cards and og.png for ${tag}.`);
}

const watched = ["assets/examples", "apps/docs/public/og.png", ...versionedFiles];
const dirty = run("git", ["status", "--porcelain", ...watched], root).trim();
if (dirty.length > 0) {
  console.log("\nShowcase files changed:");
  console.log(dirty.split("\n").map((l) => `  ${l}`).join("\n"));
  process.exit(checkOnly ? 1 : 2);
}
console.log("Showcase files are already current.");
