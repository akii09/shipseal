#!/usr/bin/env node
/**
 * Regenerate the images Shipseal shows of itself, using Shipseal.
 *
 * Writes the three README example cards and the docs site social preview, then rewrites the
 * version strings in README.md so the captions never claim an older release than the images.
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

/** Keep README captions honest about which release the images came from. */
function syncReadmeVersion() {
  const path = join(root, "README.md");
  const before = readFileSync(path, "utf8");
  const after = before
    .replace(/for its own `v\d+\.\d+\.\d+` release/, `for its own \`${tag}\` release`)
    .replace(/\[v\d+\.\d+\.\d+ release\]/, `[${tag} release]`)
    .replace(/releases\/tag\/v\d+\.\d+\.\d+/g, `releases/tag/${tag}`);
  if (before !== after) {
    writeFileSync(path, after);
  }
  return before !== after;
}

if (!checkOnly) {
  const n = readmeCards();
  ogImage();
  syncReadmeVersion();
  console.log(`Refreshed ${n} README cards and og.png for ${tag}.`);
}

const dirty = run("git", ["status", "--porcelain", "assets/examples", "apps/docs/public/og.png", "README.md"], root).trim();
if (dirty.length > 0) {
  console.log("\nShowcase images changed:");
  console.log(dirty.split("\n").map((l) => `  ${l}`).join("\n"));
  process.exit(checkOnly ? 1 : 2);
}
console.log("Showcase images are already current.");
