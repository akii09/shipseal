/**
 * Tests for the release scripts, which nothing else exercises.
 *
 * `scripts/` runs only when a release is cut: rarely, under time pressure, and a failure there
 * blocks shipping. Two real bugs lived in `refresh-showcase.mjs` while 239 tests stayed green:
 *
 *  1. The light card rendered after the temporary tag had already been deleted, so `pnpm release`
 *     died with "Could not collect release facts" on the first release where the tag did not
 *     already exist, which is every real release.
 *  2. The gate blocked on byte equality of cards carrying the commit count, so committing the new
 *     cards moved the count and blocked again. It could never settle.
 *
 * Both are pinned below. The scripts are run as real processes against throwaway git
 * repositories, because that is the only way their git and filesystem behaviour is real.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const scratch: string[] = [];

afterAll(() => {
  for (const dir of scratch) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: result.status ?? -1, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function write(dir: string, rel: string, body: string): void {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}

/** A throwaway repository with one commit on main. */
function makeRepo(version = "0.2.0"): string {
  const dir = mkdtempSync(join(tmpdir(), "shipseal-scripts-"));
  scratch.push(dir);
  run("git", ["init", "-q", "-b", "main"], dir);
  run("git", ["config", "user.email", "test@example.com"], dir);
  run("git", ["config", "user.name", "test"], dir);
  write(dir, "packages/shipseal/package.json", `${JSON.stringify({ name: "shipseal", version })}\n`);
  write(dir, "README.md", "# demo\n\nuses: akii09/shipseal@v0.1.0\n");
  write(dir, "assets/examples/release-hero.png", "not really a png\n");
  write(dir, "apps/docs/src/pages/index.astro", "<p>demo</p>\n");
  run("git", ["add", "-A"], dir);
  run("git", ["commit", "-qm", "init"], dir);
  return dir;
}

function copyScript(dir: string, name: string): void {
  write(dir, `scripts/${name}`, readFileSync(join(repoRoot, "scripts", name), "utf8"));
}

describe("refresh-showcase: the files it rewrites", () => {
  it("every versioned file it reads actually exists", () => {
    // It readFileSync's each one, so a deleted or renamed file crashes `pnpm release`. This is
    // exactly what deleting scripts/scaffold.sh would have done.
    const source = readFileSync(join(repoRoot, "scripts/refresh-showcase.mjs"), "utf8");
    const block = /const versionedFiles = \[([\s\S]*?)\];/.exec(source)?.[1];
    expect(block).toBeDefined();
    const files = [...(block ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(files.length).toBeGreaterThan(3);
    expect(files.filter((file) => !existsSync(join(repoRoot, file)))).toEqual([]);
  });
});

/**
 * A repository complete enough for refresh-showcase to run end to end, with a fake CLI that
 * records whether the release tag existed at each invocation.
 */
function makeFullRepo(version = "0.2.0"): string {
  const dir = makeRepo(version);
  copyScript(dir, "refresh-showcase.mjs");

  for (const rel of [
    "packages/shipseal/README.md",
    "examples/workflows/shipseal.yml",
    "apps/docs/public/llms.txt",
    "apps/docs/src/pages/ai.astro",
    "apps/docs/src/pages/docs/quick-start.astro",
    "apps/docs/src/pages/docs/github-action.astro",
    "docs/PROJECT_PLAN.md",
  ]) {
    write(dir, rel, "uses: akii09/shipseal@v0.1.0\n");
  }
  write(
    dir,
    "apps/docs/src/pages/index.astro",
    '{/* shipseal:tree start */}\nold tree\n{/* shipseal:tree end */}\n',
  );
  write(dir, ".shipseal/brand.json", `${JSON.stringify({ name: "demo", colors: {} })}\n`);
  write(dir, ".shipseal/config.json", "{}\n");
  write(dir, "assets/brand/icon.png", "icon\n");

  // Records `git tag` at every invocation, then writes what readmeCards expects to copy.
  write(
    dir,
    "packages/shipseal/dist/cli.js",
    [
      'import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";',
      'import { execFileSync } from "node:child_process";',
      'const a = process.argv;',
      'const out = a[a.indexOf("--out") + 1];',
      'const tag = a[a.indexOf("--tag") + 1];',
      'const tags = execFileSync("git", ["tag"], { cwd: process.env.SHIPSEAL_TEST_REPO }).toString();',
      'appendFileSync(process.env.SHIPSEAL_TEST_LOG, `${tag}|${tags.trim()}\\n`);',
      'const dir = `${out}/${tag}`;',
      'mkdirSync(dir, { recursive: true });',
      'for (const f of ["release-hero-og.png","release-highlights-x.png","code-card-x.png","release-hero-x.png"]) writeFileSync(`${dir}/${f}`, f);',
      'writeFileSync(`${dir}/manifest.json`, JSON.stringify({ files: [{ path: "release-hero-og.png", width: 1200, height: 630, template: "release-hero", format: "og" }] }));',
    ].join("\n") + "\n",
  );
  run("git", ["add", "-A"], dir);
  run("git", ["commit", "-qm", "fixture"], dir);
  return dir;
}

describe("refresh-showcase: the temporary tag", () => {
  it("exists for every render, not just the first", () => {
    // The bug: the light card rendered after the finally had already removed the tag, so
    // `release --tag v0.2.0` could not collect facts and `pnpm release` died. A stub that fails
    // on the first render cannot tell the two versions apart, so record the tag at each call.
    const dir = makeFullRepo("0.2.0");
    const log = join(dir, "render-log.txt");
    writeFileSync(log, "");

    const result = run("node", ["scripts/refresh-showcase.mjs"], dir, {
      SHIPSEAL_TEST_REPO: dir,
      SHIPSEAL_TEST_LOG: log,
    });

    const calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
    // The dark pack and the light card both render against this repository.
    const local = calls.filter((line) => line.endsWith("|v0.2.0"));
    expect(local.length).toBeGreaterThanOrEqual(2);
    expect(calls.filter((line) => line.endsWith("|")).length).toBe(0);
    expect(result.out).not.toContain("Could not collect release facts");
  });

  it("is removed again once rendering is done", () => {
    const dir = makeFullRepo("0.2.0");
    const log = join(dir, "render-log.txt");
    writeFileSync(log, "");
    run("node", ["scripts/refresh-showcase.mjs"], dir, {
      SHIPSEAL_TEST_REPO: dir,
      SHIPSEAL_TEST_LOG: log,
    });
    // Left behind, `pnpm release` refuses with "tag v0.2.0 already exists".
    expect(run("git", ["tag"], dir).out.trim()).toBe("");
  });

  it("is removed even when a render fails", () => {
    const dir = makeRepo("0.2.0");
    copyScript(dir, "refresh-showcase.mjs");
    write(dir, "packages/shipseal/dist/cli.js", "process.exit(1);\n");

    const result = run("node", ["scripts/refresh-showcase.mjs"], dir);
    expect(result.status).not.toBe(0);
    expect(run("git", ["tag"], dir).out.trim()).toBe("");
  });

  it("leaves a tag it did not create alone", () => {
    const dir = makeRepo("0.2.0");
    copyScript(dir, "refresh-showcase.mjs");
    write(dir, "packages/shipseal/dist/cli.js", "process.exit(1);\n");
    run("git", ["tag", "v0.2.0"], dir);

    run("node", ["scripts/refresh-showcase.mjs"], dir);
    expect(run("git", ["tag"], dir).out.trim()).toBe("v0.2.0");
  });
});

describe("refresh-showcase: what blocks a release and what does not", () => {
  const check = (dir: string) => run("node", ["scripts/refresh-showcase.mjs", "--check"], dir);

  it("passes when nothing has drifted", () => {
    const dir = makeRepo();
    copyScript(dir, "refresh-showcase.mjs");
    const result = check(dir);
    expect(result.status).toBe(0);
    expect(result.out).toContain("Version strings are current");
  });

  it("does not block on a changed card, because the seal moves with every commit", () => {
    const dir = makeRepo();
    copyScript(dir, "refresh-showcase.mjs");
    write(dir, "assets/examples/release-hero.png", "different bytes\n");

    const result = check(dir);
    // This is the non-convergent loop: blocking here means committing the card moves the commit
    // count, which re-renders the card, which blocks again.
    expect(result.status).toBe(0);
    expect(result.out).toContain("does not block");
  });

  it("blocks on a changed version string, which is what breaks a consumer workflow", () => {
    const dir = makeRepo();
    copyScript(dir, "refresh-showcase.mjs");
    write(dir, "README.md", "# demo\n\nuses: akii09/shipseal@v0.0.1\n");

    const result = check(dir);
    expect(result.status).toBe(1);
    expect(result.out).toContain("do block");
  });
});

describe("release.sh: the gates refuse rather than ask", () => {
  /** release.sh reaches for origin, so give it one. */
  function withRemote(version = "0.2.0"): string {
    const dir = makeRepo(version);
    const bare = mkdtempSync(join(tmpdir(), "shipseal-origin-"));
    scratch.push(bare);
    run("git", ["init", "-q", "--bare"], bare);
    run("git", ["remote", "add", "origin", bare], dir);
    run("git", ["push", "-q", "origin", "main"], dir);
    copyScript(dir, "release.sh");
    return dir;
  }
  const release = (dir: string) => run("bash", ["scripts/release.sh", "--check"], dir);

  it("refuses on a branch that is not main", () => {
    const dir = withRemote();
    run("git", ["checkout", "-q", "-b", "feature"], dir);
    const result = release(dir);
    expect(result.status).toBe(1);
    expect(result.out).toContain("not main");
  });

  it("refuses an uncommitted working tree, so a release matches what was pushed", () => {
    const dir = withRemote();
    write(dir, "README.md", "edited\n");
    const result = release(dir);
    expect(result.status).toBe(1);
    expect(result.out).toContain("uncommitted changes");
  });

  it("refuses a changeset that was never versioned, which would miss the release", () => {
    const dir = withRemote();
    write(dir, ".changeset/pending.md", '---\n"shipseal": patch\n---\n\nnot versioned yet\n');
    run("git", ["add", "-A"], dir);
    run("git", ["commit", "-qm", "changeset"], dir);
    run("git", ["push", "-q", "origin", "main"], dir);

    const result = release(dir);
    expect(result.status).toBe(1);
    expect(result.out).toContain("not versioned yet");
  });

  it("refuses when local and origin have diverged", () => {
    const dir = withRemote();
    write(dir, "README.md", "ahead\n");
    run("git", ["add", "-A"], dir);
    run("git", ["commit", "-qm", "ahead"], dir);

    const result = release(dir);
    expect(result.status).toBe(1);
    expect(result.out).toContain("differ");
  });
});

describe("check-action-ref: documented action references resolve", () => {
  function repoWithRef(ref: string, version = "0.2.0", tags: string[] = ["v0.1.0"]): string {
    const dir = makeRepo(version);
    copyScript(dir, "check-action-ref.mjs");
    write(dir, "README.md", `# demo\n\nuses: akii09/shipseal@${ref}\n`);
    run("git", ["add", "-A"], dir);
    run("git", ["commit", "-qm", "ref"], dir);
    for (const tag of tags) {
      run("git", ["tag", tag], dir);
    }
    return dir;
  }
  const check = (dir: string) => run("node", ["scripts/check-action-ref.mjs"], dir);

  it("accepts a tag that exists", () => {
    const result = check(repoWithRef("v0.1.0"));
    expect(result.status).toBe(0);
    expect(result.out).toContain("an existing tag");
  });

  it("accepts the release being prepared, whose tag does not exist yet", () => {
    // Without this, CI blocks the very commit that `pnpm release` needs to push.
    const result = check(repoWithRef("v0.2.0"));
    expect(result.status).toBe(0);
    expect(result.out).toContain("the release being prepared");
  });

  it("rejects a reference nobody can resolve", () => {
    const result = check(repoWithRef("v9.9.9"));
    expect(result.status).toBe(1);
    expect(result.out).toContain("does not exist");
  });

  it("rejects references that disagree with each other", () => {
    const dir = repoWithRef("v0.1.0");
    write(dir, "docs/other.md", "uses: akii09/shipseal@v0.2.0\n");
    run("git", ["add", "-A"], dir);
    run("git", ["commit", "-qm", "second ref"], dir);

    const result = check(dir);
    expect(result.status).toBe(1);
    expect(result.out).toContain("disagree");
  });
});
