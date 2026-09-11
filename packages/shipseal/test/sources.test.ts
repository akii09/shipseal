import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { collectChangelog, cleanChangelogItem } from "../src/sources/changelog.js";
import { collectFacts } from "../src/sources/collect.js";
import { collectGit, parseConventional } from "../src/sources/git.js";
import { collectGithub } from "../src/sources/github.js";
import { collectNpm } from "../src/sources/npm.js";
import { collectBenchFile } from "../src/sources/bench-file.js";
import { collectPackageJson } from "../src/sources/package-json.js";
import { collectReadme } from "../src/sources/readme.js";
import { mergeFacts } from "../src/facts/merge.js";
import { fact } from "../src/facts/fact.js";

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
});

describe("git source", () => {
  it("parses conventional commits", () => {
    expect(parseConventional("feat(parser): add QR codes")).toEqual({
      type: "feat",
      display: "Add QR codes",
      breaking: false,
    });
    expect(parseConventional("feat!: drop v1")).toMatchObject({ breaking: true, type: "feat" });
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
