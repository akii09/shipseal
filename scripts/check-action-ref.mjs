#!/usr/bin/env node
/**
 * Verify that every documented GitHub Action reference names a git ref that exists.
 *
 * `uses: akii09/shipseal@<ref>` is the first line a new user copies. When the ref does not
 * resolve, their workflow dies with "unable to resolve action" before a single step runs, and
 * nothing in lint, typecheck or the test suite notices. The docs claimed `@v1` for months
 * while the newest tag was `v0.0.6`.
 *
 * `scripts/refresh-showcase.mjs` bumps these references during `pnpm release`. This checks them.
 *
 *   node scripts/check-action-ref.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (args) => execFileSync("git", args, { cwd: root, stdio: "pipe" }).toString();

/**
 * The tag for the release being prepared does not exist yet.
 *
 * `pnpm release` bumps the references and asks for a commit before it creates the tag, so
 * between that commit and the tag there is a window where the documented ref is correct and
 * unresolvable at the same time. Accept it, or CI blocks the push that the release needs.
 */
const pending = `v${JSON.parse(readFileSync(join(root, "packages/shipseal/package.json"), "utf8")).version}`;

/** Docs use `@<branch-or-sha>` as a stand-in. That is a placeholder, not a ref to resolve. */
const isPlaceholder = (ref) => ref.startsWith("<");

/**
 * The two scripts that rewrite and check these references are not documentation.
 *
 * Both carry the pattern in their own source: this file in the regex below, and the release
 * script in its replacement template. Searching them means the checker fails on itself, which
 * is exactly what happened the first time this ran in CI, where the file was tracked and so
 * visible to `git grep` for the first time.
 */
const excluded = [
  ":(exclude)scripts/check-action-ref.mjs",
  ":(exclude)scripts/refresh-showcase.mjs",
];

/** `git grep` exits 1 when nothing matches, which is a real failure here rather than a pass. */
function findReferences() {
  let output;
  try {
    output = run(["grep", "-nE", "akii09/shipseal@[^ `'\"),]+", "--", ".", ...excluded]);
  } catch {
    return [];
  }
  return output
    .trim()
    .split("\n")
    .map((line) => {
      const [file, lineNumber] = line.split(":");
      const ref = /akii09\/shipseal@([^ `'"),]+)/.exec(line)?.[1] ?? "";
      return { file, line: Number(lineNumber), ref };
    })
    .filter((found) => !isPlaceholder(found.ref));
}

const references = findReferences();
if (references.length === 0) {
  console.error("No akii09/shipseal@<ref> references found. The quick start should have one.");
  process.exit(1);
}

if (run(["tag"]).trim().length === 0) {
  console.error("No tags in this checkout, so action references cannot be verified.");
  console.error("Fetch tags first: actions/checkout needs fetch-depth: 0.");
  process.exit(1);
}

const broken = references.filter((found) => {
  if (found.ref === pending) {
    return false;
  }
  try {
    run(["rev-parse", "--verify", `${found.ref}^{commit}`]);
    return false;
  } catch {
    return true;
  }
});

if (broken.length > 0) {
  console.error("These action references name a git ref that does not exist:\n");
  for (const found of broken) {
    console.error(`  ${found.file}:${String(found.line)}  akii09/shipseal@${found.ref}`);
  }
  console.error("\nEvery one of these fails a consumer workflow with 'unable to resolve action'.");
  console.error("Point them at a tag that exists, or create the tag before documenting it.");
  process.exit(1);
}

const distinct = [...new Set(references.map((found) => found.ref))];
if (distinct.length > 1) {
  console.error(`Action references disagree: ${distinct.join(", ")}.`);
  console.error("The docs should tell everyone to use the same version.");
  process.exit(1);
}

let state = "an existing tag";
try {
  run(["rev-parse", "--verify", `${distinct[0]}^{commit}`]);
} catch {
  state = "the release being prepared";
}
console.log(`All ${String(references.length)} action references point at ${distinct[0]}, ${state}.`);
