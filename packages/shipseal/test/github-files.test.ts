/**
 * Brand detection over the GitHub API. Spec: docs/REVIEW_2026-09-15.md R0.
 *
 * The risk here is not a wrong colour, it is a failed card. A large repository's recursive tree
 * exceeds the demo response cap, and the first version of this module let that throw, which
 * turned three repositories that used to render into outright failures. Degrading is the rule.
 */
import { describe, expect, it } from "vitest";
import { githubFiles } from "../src/sources/github-files.js";

const json = (value: unknown) => new Response(JSON.stringify(value));
const blob = (text: string) =>
  json({ encoding: "base64", content: Buffer.from(text).toString("base64") });

const tree = (paths: string[]) =>
  json({ tree: paths.map((path) => ({ path, type: "blob" })) });

describe("githubFiles.list", () => {
  it("keeps only files detection can use, shallowest first", async () => {
    const files = githubFiles("a/b", "v1", (async () =>
      tree([
        "deep/a/b/c/d/theme.css",
        "src/app/globals.css",
        "app.css",
        "README.md",
        "package.json",
        "src/main.rs",
        "tailwind.config.ts",
      ])) as unknown as typeof fetch);
    const listed = await files.list();
    expect(listed).not.toContain("src/main.rs");
    expect(listed).not.toContain("deep/a/b/c/d/theme.css");
    expect(["README.md", "app.css", "package.json", "tailwind.config.ts"]).toContain(listed[0]);
    expect(listed).toContain("src/app/globals.css");
  });

  it("skips vendored and hidden directories", async () => {
    const files = githubFiles("a/b", "v1", (async () =>
      tree(["node_modules/x/a.css", "dist/b.css", ".cache/c.css", "d.css"])) as unknown as typeof fetch);
    expect(await files.list()).toEqual(["d.css"]);
  });

  it("falls back to conventional paths when the tree is too large to fetch", async () => {
    // Real case: withastro/astro, supabase and ruff all exceeded the demo response cap.
    const files = githubFiles("a/b", "v1", (async () =>
      new Response("x".repeat(2_000_001))) as unknown as typeof fetch);
    const listed = await files.list();
    expect(listed).toContain("app/globals.css");
    expect(listed).toContain("package.json");
  });

  it("falls back when the tree is unreadable rather than failing the card", async () => {
    const files = githubFiles("a/b", "v1", (async () => json({ nope: true })) as unknown as typeof fetch);
    expect((await files.list()).length).toBeGreaterThan(0);
  });
});

describe("githubFiles.read", () => {
  it("decodes base64 content", async () => {
    const files = githubFiles("a/b", "v1", (async () => blob(":root{--x:#fff}")) as unknown as typeof fetch);
    expect(await files.read("a.css")).toBe(":root{--x:#fff}");
  });

  it("returns undefined for a missing file instead of throwing", async () => {
    const files = githubFiles("a/b", "v1", (async () =>
      new Response("no", { status: 404 })) as unknown as typeof fetch);
    expect(await files.read("nope.css")).toBeUndefined();
  });

  it("reads each path once, because every read costs a request", async () => {
    let calls = 0;
    const files = githubFiles("a/b", "v1", (async () => {
      calls += 1;
      return blob("body{}");
    }) as unknown as typeof fetch);
    await Promise.all([files.read("a.css"), files.read("a.css"), files.read("a.css")]);
    expect(calls).toBe(1);
  });

  it("does not fetch logo bytes, which the browser cannot use anyway", async () => {
    const files = githubFiles("a/b", "v1", (async () => blob("x")) as unknown as typeof fetch);
    expect(await files.readBinary("logo.png")).toBeUndefined();
  });
});
