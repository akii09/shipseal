import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { collectChangelog, cleanChangelogItem } from "../src/sources/changelog.js";
import { collectFacts } from "../src/sources/collect.js";
import { collectGit, parseConventional, versionFromTag } from "../src/sources/git.js";
import { collectGithub } from "../src/sources/github.js";
import { collectNpm } from "../src/sources/npm.js";
import { collectBenchFile } from "../src/sources/bench-file.js";
import { collectPackageJson } from "../src/sources/package-json.js";
import { collectReadme, extractH1, extractTagline } from "../src/sources/readme.js";
import { mergeFacts } from "../src/facts/merge.js";
import { fact } from "../src/facts/fact.js";

const NOW = "2026-09-11T00:00:00.000Z";

const execFileAsync = promisify(execFile);

describe("package-json source", () => {
  it("reads name, description, and repository slug", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-pkg-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "@acme/demo",
        description: "A demo package used in source tests",
        version: "1.2.3",
        homepage: "https://example.com",
        repository: "git+https://github.com/acme/demo.git",
        license: "MIT",
      }),
    );
    const facts = await collectPackageJson(dir);
    expect(facts.project?.name?.value).toBe("demo");
    expect(facts.project?.npmPackage?.value).toBe("@acme/demo");
    expect(facts.project?.repo?.value).toBe("acme/demo");
    expect(facts.release?.version?.value).toBe("1.2.3");
    expect(facts.release?.tag).toBeUndefined();
    expect(facts.release?.date).toBeUndefined();
  });
});

describe("readme source", () => {
  it("extracts H1, tagline, and the first fenced code block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-readme-"));
    await writeFile(
      join(dir, "README.md"),
      `# Demo\n\nA demo package used in source tests for readme parsing.\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`,
    );
    const facts = await collectReadme(dir);
    expect(facts.project?.name?.value).toBe("Demo");
    expect(facts.project?.tagline?.value).toContain("demo package");
    expect(facts.release?.codeSnippet?.value).toEqual({ lang: "ts", code: "const x = 1;" });
  });
});

describe("changelog source", () => {
  it("parses Keep a Changelog and strips PR links", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-cl-"));
    await writeFile(
      join(dir, "CHANGELOG.md"),
      `## [2.0.0] - 2026-09-10\n\n### Added\n- QR support (#12)\n\n### Fixed\n- Nested view crash by @alice\n\n### Removed\n- Legacy renderer\n`,
    );
    const facts = await collectChangelog(dir, "2.0.0");
    expect(facts.release?.features?.[0]?.value).toBe("QR support");
    expect(facts.release?.fixes?.[0]?.value).toBe("Nested view crash");
    expect(facts.release?.breaking?.[0]?.value).toBe("Legacy renderer");
    expect(facts.release?.date?.value).toBe("2026-09-10");
  });

  it("parses Changesets headings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-cs-"));
    await writeFile(
      join(dir, "CHANGELOG.md"),
      `## 2.0.0\n\n### Major Changes\n- abcdef1: Drop Node 18\n\n### Minor Changes\n- QR codes\n\n### Patch Changes\n- Fix wrap\n`,
    );
    const facts = await collectChangelog(dir, "v2.0.0");
    expect(facts.release?.breaking?.[0]?.value).toBe("Drop Node 18");
    expect(facts.release?.features?.[0]?.value).toBe("QR codes");
    expect(facts.release?.fixes?.[0]?.value).toBe("Fix wrap");
  });

  it("cleanChangelogItem strips hashes and authors", () => {
    expect(cleanChangelogItem("- abcdef1: Add thing (@bob)")).toBe("Add thing");
  });

  it("cleanChangelogItem strips Changesets PR links, hashes, and thanks", () => {
    expect(
      cleanChangelogItem(
        "- [#174](https://github.com/acme/demo/pull/174) [`eb437f2`](https://github.com/acme/demo/commit/eb437f2) Thanks [@ada](https://github.com/ada)! - Fix EPIPE crashes",
      ),
    ).toBe("Fix EPIPE crashes");
  });
});

describe("git source", () => {
  it("parses conventional commits", () => {
    expect(parseConventional("feat(parser): add QR codes")).toEqual({
      type: "feat",
      display: "Add QR codes",
      breaking: false,
    });
    expect(parseConventional("feat!: drop v1")).toMatchObject({ breaking: true, type: "feat" });
    expect(parseConventional("feat: add QR support (#168)")).toEqual({
      type: "feat",
      display: "Add QR support",
      breaking: false,
    });
  });

  it("reads a semver from namespaced tags", () => {
    expect(versionFromTag("v2.0.0")).toBe("2.0.0");
    expect(versionFromTag("pdfx-cli@0.6.2")).toBe("0.6.2");
    expect(versionFromTag("@acme/demo@1.2.3")).toBe("1.2.3");
  });

  it("collects features between tags from a fixture repo", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-git-"));
    await git(dir, ["init", "-b", "main"]);
    await git(dir, ["config", "user.email", "dev@example.com"]);
    await git(dir, ["config", "user.name", "Dev"]);
    await git(dir, ["config", "commit.gpgsign", "false"]);
    await writeFile(join(dir, "a.txt"), "a");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "chore: start"]);
    await git(dir, ["tag", "v1.0.0"]);
    await writeFile(join(dir, "b.txt"), "b");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "feat: add QR support"]);
    await writeFile(join(dir, "c.txt"), "c");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "fix: wrap tables"]);
    await git(dir, ["tag", "v2.0.0"]);

    const facts = await collectGit(dir, { tag: "v2.0.0" });
    expect(facts.release?.version?.value).toBe("2.0.0");
    expect(facts.release?.previousVersion?.value).toBe("1.0.0");
    expect(facts.release?.features?.map((item) => item.value)).toContain("Add QR support");
    expect(facts.release?.fixes?.map((item) => item.value)).toContain("Wrap tables");
  });
});

describe("github source", () => {
  it("reads stars from a mocked fetch and caches the URL", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (input) => {
      calls += 1;
      const url = String(input);
      if (url.endsWith("/repos/acme/demo")) {
        return new Response(
          JSON.stringify({
            stargazers_count: 1042,
            description: "Demo",
            homepage: "https://example.com",
            license: { spdx_id: "MIT" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("missing", { status: 404 });
    };
    const cache = new Map();
    const first = await collectGithub({ repo: "acme/demo", fetchImpl, cache });
    const second = await collectGithub({ repo: "acme/demo", fetchImpl, cache });
    expect(first.metrics?.stars?.value).toBe(1042);
    expect(second.metrics?.stars?.value).toBe(1042);
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(calls).toBeLessThanOrEqual(4);
  });

  it("throws a rate-limit error with a fix", async () => {
    await expect(collectGithub({ repo: "acme/demo", fetchImpl: forbiddenFetch })).rejects.toMatchObject({
      code: "github.rate-limit",
    });
  });
});

describe("mergeFacts", () => {
  it("lets changelog lists replace git lists", () => {
    const fetchedAt = "2026-09-11T10:00:00.000Z";
    const merged = mergeFacts([
      {
        project: { name: fact("demo", { source: "package-json", ref: "name", fetchedAt }) },
        release: {
          version: fact("2.0.0", { source: "git", ref: "tag", fetchedAt }),
          tag: fact("v2.0.0", { source: "git", ref: "tag", fetchedAt }),
          date: fact("2026-09-10", { source: "git", ref: "date", fetchedAt }),
          features: [fact("From git", { source: "git", ref: "log", fetchedAt })],
        },
      },
      {
        release: {
          features: [fact("From changelog", { source: "changelog", ref: "added", fetchedAt })],
        },
      },
    ]);
    expect(merged.release?.features[0]?.value).toBe("From changelog");
  });
});

describe("collectFacts", () => {
  it("builds Facts from package.json, changelog, and readme without network", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-collect-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo", description: "A demo package used in collect tests", version: "2.0.0" }),
    );
    await writeFile(
      join(dir, "CHANGELOG.md"),
      `## [2.0.0] - 2026-09-10\n\n### Added\n- QR support\n`,
    );
    await writeFile(join(dir, "README.md"), `# Demo\n\nA demo package used in collect tests for readme.\n`);
    const facts = await collectFacts({
      cwd: dir,
      event: { kind: "release", tag: "v2.0.0" },
      skipNetwork: true,
    });
    expect(facts.project.name.value).toBe("demo");
    expect(facts.release?.features[0]?.value).toBe("QR support");
    expect(facts.release?.date?.value).toBe("2026-09-10");
  });

  it("uses the package changelog when the root file has no matching version", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-collect-pkg-cl-"));
    await mkdir(join(dir, "packages", "cli"), { recursive: true });
    await writeFile(
      join(dir, "packages", "cli", "package.json"),
      JSON.stringify({ name: "demo-cli", description: "A demo CLI used in collect tests", version: "0.6.2" }),
    );
    await writeFile(join(dir, "CHANGELOG.md"), "# Changelog\n");
    await writeFile(
      join(dir, "packages", "cli", "CHANGELOG.md"),
      `## 0.6.2 - 2026-07-21\n\n### Patch Changes\n- [#174](https://github.com/acme/demo/pull/174) Fix EPIPE crashes\n`,
    );
    const facts = await collectFacts({
      cwd: dir,
      event: { kind: "release", tag: "demo-cli@0.6.2" },
      packagePath: join("packages", "cli", "package.json"),
      skipNetwork: true,
    });
    expect(facts.release?.fixes[0]?.value).toBe("Fix EPIPE crashes");
    expect(facts.release?.features).toEqual([]);
    expect(facts.release?.tag?.value).toBe("v0.6.2");
  });
});

describe("npm source", () => {
  it("reads weekly downloads from a mocked fetch and encodes scoped names", async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      seen.push(String(input));
      return new Response(
        JSON.stringify({ downloads: 31623, start: "2026-09-01", end: "2026-09-07", package: "@acme/demo" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const facts = await collectNpm({ npmPackage: "@acme/demo", fetchImpl });
    expect(facts.metrics?.weeklyDownloads?.value).toBe(31623);
    expect(facts.metrics?.weeklyDownloads?.provenance.source).toBe("npm-api");
    expect(seen[0]).toBe("https://api.npmjs.org/downloads/point/last-week/%40acme%2Fdemo");
  });

  it("returns nothing when the package is missing", async () => {
    const facts = await collectNpm({ npmPackage: "no-such-pkg", fetchImpl: missingNpmFetch });
    expect(facts.metrics?.weeklyDownloads).toBeUndefined();
  });
});

describe("bench-file source", () => {
  it("wraps each metric field with provenance", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-bench-"));
    await writeFile(
      join(dir, "bench.json"),
      JSON.stringify({
        title: "Rendering got faster",
        metrics: [{ label: "Render time", before: 420, after: 87, unit: "ms", better: "lower" }],
        note: "vitest bench fixture",
      }),
    );
    const facts = await collectBenchFile(dir, "bench.json");
    expect(facts.bench?.title.value).toBe("Rendering got faster");
    expect(facts.bench?.metrics[0]?.before.value).toBe(420);
    expect(facts.bench?.metrics[0]?.after.provenance.ref).toBe("bench.json#metrics[0].after");
  });

  it("throws a fix-it error when the file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-bench-missing-"));
    await expect(collectBenchFile(dir, "missing.json")).rejects.toMatchObject({ code: "bench.missing-file" });
  });
});

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

const forbiddenFetch: typeof fetch = async () => new Response("nope", { status: 403 });
const missingNpmFetch: typeof fetch = async () => new Response("not found", { status: 404 });

describe("npm repository shorthand", () => {
  // Regression: `"repository": "github:owner/repo"` is the most common npm form and
  // was not expanded, so repoSlug returned undefined and `milestone` could never read
  // stars. Caught by running the CLI against a real project on 2026-09-11.
  const cases: Array<[string, string | undefined]> = [
    ["github:vercel/next.js", "vercel/next.js"],
    ["vercel/next.js", "vercel/next.js"],
    ["https://github.com/vercel/next.js", "vercel/next.js"],
    ["git+https://github.com/vercel/next.js.git", "vercel/next.js"],
    ["git@github.com:vercel/next.js.git", "vercel/next.js"],
    ["https://gitlab.com/vercel/next.js", undefined],
  ];

  for (const [input, expected] of cases) {
    it(`resolves ${input}`, async () => {
      const dir = await mkdtemp(join(tmpdir(), "shipseal-repo-"));
      await writeFile(join(dir, "package.json"), JSON.stringify({ name: "demo", repository: input }), "utf8");
      const part = await collectPackageJson(dir);
      expect(part.project?.repo?.value).toBe(expected);
    });
  }
});

describe("partial release facts", () => {
  // Regression: `package.json#version` alone made the release block partial and
  // mergeFacts threw, so `bench` and `milestone` failed on any versioned project
  // without a git tag. Those events do not need release facts at all (§6.3).
  const named = () => ({
    name: fact("demo", { source: "package-json" as const, ref: "package.json#name", fetchedAt: NOW }),
  });

  it("drops an incomplete release instead of throwing", () => {
    const facts = mergeFacts([
      {
        project: named(),
        release: {
          version: fact("0.0.1", { source: "package-json", ref: "package.json#version", fetchedAt: NOW }),
        },
      },
    ]);
    expect(facts.release).toBeUndefined();
    expect(facts.project.name.value).toBe("demo");
  });

  it("keeps a complete release", () => {
    const p = { source: "git" as const, ref: "git tag v1.0.0", fetchedAt: NOW };
    const facts = mergeFacts([
      {
        project: named(),
        release: { version: fact("1.0.0", p), tag: fact("v1.0.0", p), date: fact("2026-09-11", p) },
      },
    ]);
    expect(facts.release?.version.value).toBe("1.0.0");
  });
});

describe("README prose extraction", () => {
  // Regression, found by running init on Shipseal's own repo. A README that opens with a
  // centred logo and contains a YAML example yielded the name ".github/workflows/shipseal.yml"
  // and a tagline of raw workflow YAML. A `#` comment inside a fence is not a heading, and a
  // blank line inside a fence does not start a paragraph.
  const README = [
    '<p align="center">',
    '  <img src="./assets/brand/wordmark.png" alt="Shipseal" width="400">',
    "</p>",
    "",
    "Shipseal turns repository events into ready to post visuals.",
    "",
    "```yaml",
    "# .github/workflows/shipseal.yml",
    "on: { release: { types: [published] } }",
    "",
    "jobs:",
    "  visuals:",
    "    runs-on: ubuntu-latest",
    "```",
  ].join("\n");

  it("does not read a comment inside a code fence as the H1", () => {
    expect(extractH1(README)).toBeUndefined();
  });

  it("does not read fenced YAML as the tagline", () => {
    const tagline = extractTagline(README);
    expect(tagline).toBe("Shipseal turns repository events into ready to post visuals.");
    expect(tagline).not.toContain("runs-on");
  });

  it("still reads a normal H1 and paragraph", () => {
    const md = "# Shipseal\n\nEvery release, sealed and ready to share.\n";
    expect(extractH1(md)).toBe("Shipseal");
    expect(extractTagline(md)).toBe("Every release, sealed and ready to share.");
  });
});

describe("workspace root name", () => {
  // A private package.json is a workspace root. Its name is plumbing, not a brand:
  // Shipseal's own root is "shipseal-monorepo", which must never reach a card.
  it("ignores the name of a private package", async () => {
    const { detectBrand } = await import("../src/brand/detect.js");
    const dir = await mkdtemp(join(tmpdir(), "shipseal-private-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo-monorepo", private: true }),
      "utf8",
    );
    await writeFile(join(dir, "README.md"), "# Demo\n\nA demo project for testing.\n", "utf8");
    const detection = await detectBrand(dir);
    expect(detection.brand.name).toBe("Demo");
  });
});

describe("npmPackage on a private root", () => {
  // Regression, caught on the real v0.0.2 release card: the CTA read
  // "npm i shipseal-monorepo", a package that does not exist on npm.
  it("does not claim a private package is on npm", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-privpkg-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo-monorepo", private: true }),
      "utf8",
    );
    const part = await collectPackageJson(dir);
    expect(part.project?.npmPackage).toBeUndefined();
  });

  it("still reports a publishable package", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-pubpkg-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "demo" }), "utf8");
    const part = await collectPackageJson(dir);
    expect(part.project?.npmPackage?.value).toBe("demo");
  });
});
