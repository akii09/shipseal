import { describe, expect, it } from "vitest";
import {
  collectPublicRelease,
  listPublicReleases,
  publicGithubJson,
  defaultRelease,
  isPrerelease,
  previousTagFor,
  projectName,
  publicRepoSlug,
  releaseFacts,
  releaseVersion,
  type PublicRelease,
} from "../src/sources/public-repo.js";

const fetchedAt = "2026-09-13T09:00:00.000Z";

const release = (overrides: Partial<PublicRelease> = {}): PublicRelease => ({
  tag_name: "v2.0.0",
  name: "2.0.0",
  body: "",
  published_at: "2026-09-10T12:00:00Z",
  draft: false,
  prerelease: false,
  ...overrides,
});

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status });

const notFound = (): Promise<Response> => Promise.resolve(new Response("no", { status: 404 }));
const tooLarge = (): Promise<Response> =>
  Promise.resolve(new Response(`"${"x".repeat(2_000_001)}"`));

const route = (routes: Record<string, () => Response>): typeof fetch =>
  async (input) => {
    const url = String(input);
    for (const [fragment, respond] of Object.entries(routes)) {
      if (url.includes(fragment)) {
        return respond();
      }
    }
    return new Response("not found", { status: 404 });
  };

describe("publicRepoSlug", () => {
  it("accepts a slug, a URL, a trailing slash and a .git suffix", () => {
    expect(publicRepoSlug("akii09/shipseal")).toBe("akii09/shipseal");
    expect(publicRepoSlug("https://github.com/akii09/shipseal")).toBe("akii09/shipseal");
    expect(publicRepoSlug("https://github.com/akii09/shipseal/")).toBe("akii09/shipseal");
    expect(publicRepoSlug("https://github.com/akii09/shipseal.git")).toBe("akii09/shipseal");
  });

  it("rejects traversal segments, so a slug cannot rewrite the API path", () => {
    for (const input of ["../etc", "./x", "owner/..", "../..", "."]) {
      expect(() => publicRepoSlug(input)).toThrowError(/not a GitHub repository URL/);
    }
  });

  it("rejects anything that is not one owner and one repository", () => {
    for (const input of ["", "owner", "owner/repo/extra", "https://gitlab.com/a/b", "a b/c"]) {
      expect(() => publicRepoSlug(input)).toThrowError(/not a GitHub repository URL/);
    }
  });
});

describe("publicGithubJson", () => {
  it("returns parsed JSON on success", async () => {
    await expect(publicGithubJson("/repos/a/b", () => Promise.resolve(json({ ok: 1 })))).resolves.toEqual({
      ok: 1,
    });
  });

  it("sends no credentials, since the demo is unauthenticated", async () => {
    let seen: RequestInit | undefined;
    const fetchImpl: typeof fetch = (_input, init) => {
      seen = init;
      return Promise.resolve(json({}));
    };
    await publicGithubJson("/repos/a/b", fetchImpl);
    expect(seen?.credentials).toBe("omit");
    expect(seen?.headers).toMatchObject({ Accept: "application/vnd.github+json" });
  });

  it("maps 403 and 429 to a rate-limit error that names the local CLI", async () => {
    await Promise.all(
      [403, 429].map((status) =>
        expect(
          publicGithubJson("/repos/a/b", () => Promise.resolve(new Response("no", { status }))),
        ).rejects.toMatchObject({
          code: "demo.rate-limit",
          fix: expect.stringContaining("GITHUB_TOKEN"),
        }),
      ),
    );
  });

  it("returns undefined for an optional 404 but throws for a required one", async () => {
    await expect(publicGithubJson("/repos/a/b", notFound, true)).resolves.toBeUndefined();
    await expect(publicGithubJson("/repos/a/b", notFound)).rejects.toMatchObject({
      code: "demo.github",
    });
  });

  it("refuses a response too large for the browser demo", async () => {
    await expect(publicGithubJson("/repos/a/b", tooLarge)).rejects.toMatchObject({
      code: "demo.too-large",
    });
  });

  it("reports invalid JSON and a network failure separately", async () => {
    await expect(
      publicGithubJson("/repos/a/b", () => Promise.resolve(new Response("{not json"))),
    ).rejects.toMatchObject({ code: "demo.invalid-response" });
    await expect(
      publicGithubJson("/repos/a/b", () => Promise.reject(new Error("offline"))),
    ).rejects.toMatchObject({ code: "demo.network" });
  });
});

describe("listPublicReleases", () => {
  it("drops drafts and keeps prereleases", async () => {
    const releases = await listPublicReleases(
      "a/b",
      () =>
        Promise.resolve(
          json([
            release({ tag_name: "v3.0.0", draft: true }),
            release({ tag_name: "v2.0.0" }),
            release({ tag_name: "v2.1.0-rc.1", prerelease: true }),
          ]),
        ),
    );
    expect(releases.map((item) => item.tag_name)).toEqual(["v2.0.0", "v2.1.0-rc.1"]);
  });

  it("explains that a repository has no published releases", async () => {
    await expect(
      listPublicReleases("a/b", () => Promise.resolve(json([release({ draft: true })]))),
    ).rejects.toMatchObject({ code: "demo.no-releases" });
  });

  it("rejects an unexpected response shape rather than rendering partial facts", async () => {
    await expect(
      listPublicReleases("a/b", () => Promise.resolve(json([{ tag_name: 7 }]))),
    ).rejects.toMatchObject({ code: "demo.release-shape" });
  });
});

describe("releaseFacts", () => {
  const facts = (body: string) =>
    releaseFacts("akii09/shipseal", "shipseal", "Release visuals", 42, release({ body }), fetchedAt);

  it("buckets bullets by the heading above them", () => {
    const result = facts(
      [
        "## Breaking changes",
        "- Drop Node 18",
        "## Features",
        "- Add story packs",
        "## Bug fixes",
        "- Fix the seal stamp",
      ].join("\n"),
    );
    expect(result.release?.breaking.map((item) => item.value)).toEqual(["Drop Node 18"]);
    expect(result.release?.features.map((item) => item.value)).toEqual(["Add story packs"]);
    expect(result.release?.fixes.map((item) => item.value)).toEqual(["Fix the seal stamp"]);
  });

  it("treats bullets before any heading as features", () => {
    expect(facts("- Add story packs").release?.features.map((item) => item.value)).toEqual([
      "Add story packs",
    ]);
  });

  it("strips links, images, inline code and raw HTML from a bullet", () => {
    const result = facts("- Add [story packs](https://x.dev) with `--style` ![img](a.png) <b>now</b>");
    // cleanLine also collapses the whitespace the removals leave behind.
    expect(result.release?.features[0]?.value).toBe("Add story packs with --style now");
  });

  it("never reads a fenced block or an HTML comment as a list of changes", () => {
    const result = facts(
      ["```sh", "- not a change", "```", "<!--", "- also not a change", "-->", "- real change"].join(
        "\n",
      ),
    );
    // Capitalised by cleanLine: bullets become card copy, unlike upgrade commands.
    expect(result.release?.features.map((item) => item.value)).toEqual(["Real change"]);
  });

  it("caps each category at eight entries", () => {
    const body = Array.from({ length: 12 }, (_, index) => `- Change ${String(index)}`).join("\n");
    expect(facts(body).release?.features).toHaveLength(8);
  });

  it("takes the first fenced block as the code snippet with its language", () => {
    const result = facts(["```ts", "const a = 1;", "```"].join("\n"));
    expect(result.release?.codeSnippet?.value).toEqual({ code: "const a = 1;", lang: "ts" });
  });

  it("falls back to text for an unlabelled fence", () => {
    expect(facts(["```", "shipseal release", "```"].join("\n")).release?.codeSnippet?.value.lang).toBe(
      "text",
    );
  });

  it("records every value as coming from the GitHub API with a resolvable ref", () => {
    const result = facts("- Add story packs");
    expect(result.metrics?.stars?.value).toBe(42);
    expect(result.metrics?.stars?.provenance).toMatchObject({
      source: "github-api",
      ref: "https://api.github.com/repos/akii09/shipseal#stargazers_count",
      fetchedAt,
    });
    expect(result.release?.features[0]?.provenance.ref).toContain("/releases/tags/v2.0.0#body");
    expect(result.release?.version.value).toBe("2.0.0");
    expect(result.release?.date.value).toBe("2026-09-10");
  });

  it("percent-encodes the tag in the provenance ref", () => {
    const result = releaseFacts(
      "a/b",
      "b",
      null,
      0,
      release({ tag_name: "v1.0.0+meta" }),
      fetchedAt,
    );
    expect(result.release?.tag.provenance.ref).toContain("v1.0.0%2Bmeta");
    expect(result.project.tagline).toBeUndefined();
  });
});

describe("collectPublicRelease", () => {
  const repo = {
    name: "shipseal",
    description: "Release visuals",
    html_url: "https://github.com/akii09/shipseal",
    stargazers_count: 42,
    private: false,
  };

  const brandFile = (value: unknown) =>
    json({
      encoding: "base64",
      content: Buffer.from(JSON.stringify(value)).toString("base64"),
      size: 120,
    });

  const validBrand = {
    version: 1,
    name: "Shipseal",
    url: "https://shipseal.dev",
    colors: {
      background: "#0b0b0c",
      foreground: "#fafafa",
      muted: "#a1a1aa",
      primary: "#22d3ee",
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
    logo: { light: "logo.svg" },
  };

  it("discloses demo colors when the repository has no brand file", async () => {
    const result = await collectPublicRelease(
      "akii09/shipseal",
      release(),
      route({ "/contents/": () => new Response("no", { status: 404 }), "/repos/": () => json(repo) }),
    );
    expect(result.brand.name).toBe("shipseal");
    expect(result.brand.tagline).toBe("Release visuals");
    expect(result.notes.join(" ")).toContain("These are demo colors");
  });

  it("adopts a valid brand file but drops the logo the browser cannot fetch", async () => {
    const result = await collectPublicRelease(
      "akii09/shipseal",
      release(),
      route({ "/contents/": () => brandFile(validBrand), "/repos/": () => json(repo) }),
    );
    expect(result.brand.colors.primary).toBe("#22d3ee");
    expect(result.brand.logo).toBeUndefined();
    expect(result.brand.fonts.mono.family).toBe("Geist Mono");
    expect(result.notes.join(" ")).toContain("omits repository logo files");
  });

  it("falls back to demo defaults and says so when the brand file is invalid", async () => {
    const result = await collectPublicRelease(
      "akii09/shipseal",
      release(),
      route({ "/contents/": () => brandFile({ version: 1 }), "/repos/": () => json(repo) }),
    );
    expect(result.notes.join(" ")).toContain("brand file is invalid");
    expect(result.brand.name).toBe("shipseal");
  });

  it("reports undecodable brand content without failing the whole load", async () => {
    const result = await collectPublicRelease(
      "akii09/shipseal",
      release(),
      route({
        "/contents/": () => json({ encoding: "base64", content: "!!!!not base64!!!!", size: 10 }),
        "/repos/": () => json(repo),
      }),
    );
    expect(result.notes.join(" ")).toContain("could not be decoded");
  });

  it("refuses a private or unreadable repository", async () => {
    await expect(
      collectPublicRelease("akii09/shipseal", release(), route({ "/repos/": () => json({ ...repo, private: true }) })),
    ).rejects.toMatchObject({ code: "demo.repo-shape" });
  });
});

/** Cases from the 20 repository survey on 2026-09-15. */
describe("naming and release selection", () => {
  it("reads the version out of a monorepo tag", () => {
    expect(releaseVersion("shadcn@4.21.0")).toBe("4.21.0");
    expect(releaseVersion("astro@7.3.2")).toBe("7.3.2");
    expect(releaseVersion("v16.0.0")).toBe("16.0.0");
    expect(releaseVersion("3.9.6")).toBe("3.9.6");
    expect(releaseVersion("2026.9.2")).toBe("2026.9.2");
    // oven-sh/bun rendered "bun bun-v1.4.2".
    expect(releaseVersion("bun-v1.4.2")).toBe("1.4.2");
    expect(releaseVersion("pkg/2.0.0")).toBe("2.0.0");
    expect(releaseVersion("v1.0.0-rc.1")).toBe("1.0.0-rc.1");
  });

  it("prefers the package a monorepo tag names over the directory", () => {
    // shadcn-ui/ui rendered "ui shadcn@4.21.0".
    expect(projectName("shadcn-ui/ui", "ui", "shadcn@4.21.0")).toBe("shadcn");
  });

  it("falls back to the owner when the repository name says nothing", () => {
    // home-assistant/core rendered "core 2026.9.2".
    expect(projectName("home-assistant/core", "core", "2026.9.2")).toBe("home-assistant");
    expect(projectName("acme/cli", "cli", "v2.0.0")).toBe("acme");
  });

  it("leaves a real project name alone", () => {
    expect(projectName("vitejs/vite", "vite", "v8.3.0")).toBe("vite");
    expect(projectName("sindresorhus/got", "got", "v16.0.0")).toBe("got");
  });

  it("defaults to the newest stable release, not a prerelease", () => {
    // zed-industries/zed defaulted to v1.20.1-pre.
    const releases = [
      release({ tag_name: "v1.20.1-pre", prerelease: true }),
      release({ tag_name: "v1.20.0" }),
    ];
    expect(defaultRelease(releases)?.tag_name).toBe("v1.20.0");
  });

  it("uses a prerelease when that is all the project has published", () => {
    const only = [release({ tag_name: "v0.1.0-rc.1", prerelease: true })];
    expect(defaultRelease(only)?.tag_name).toBe("v0.1.0-rc.1");
  });
});

describe("tag fallback and commit counting", () => {
  it("recognises the prerelease spellings projects actually use", () => {
    for (const tag of ["v1.0.0-rc.1", "v3.15.0rc2", "v3.15.0a8", "v1.20.1-pre", "v8.3.0-beta.1"]) {
      expect({ tag, pre: isPrerelease(tag) }).toEqual({ tag, pre: true });
    }
    for (const tag of ["v1.2.3", "go1.25.1", "astro@7.3.2", "2026.9.2"]) {
      expect({ tag, pre: isPrerelease(tag) }).toEqual({ tag, pre: false });
    }
  });

  it("compares a release against the previous release of the same package", () => {
    // vitejs/vite compared v8.3.0 against create-vite@9.2.1 and counted zero commits.
    const current = release({ tag_name: "v8.3.0" });
    const releases = [current, release({ tag_name: "create-vite@9.2.1" }), release({ tag_name: "v8.2.2" })];
    expect(previousTagFor(releases, current)).toBe("v8.2.2");
  });

  it("keeps a monorepo comparison inside its own package", () => {
    const current = release({ tag_name: "astro@7.3.2" });
    const releases = [current, release({ tag_name: "create-astro@5.0.0" }), release({ tag_name: "astro@7.3.1" })];
    expect(previousTagFor(releases, current)).toBe("astro@7.3.1");
  });

  it("measures a stable release against the previous stable one", () => {
    // zed compared v1.19.2 against v1.19.1-pre.
    const current = release({ tag_name: "v1.19.2" });
    const releases = [current, release({ tag_name: "v1.19.1-pre", prerelease: true }), release({ tag_name: "v1.18.1" })];
    expect(previousTagFor(releases, current)).toBe("v1.18.1");
  });

  it("falls back to tags when a repository publishes no releases", async () => {
    const fetchImpl = route({
      "/releases": () => json([]),
      "/tags": () => json([{ name: "v2.0.0", commit: { sha: "a" } }, { name: "v1.9.0", commit: { sha: "b" } }]),
      "/commits/": () => json({ commit: { committer: { date: "2026-01-02T00:00:00Z" } } }),
    });
    const tags = await listPublicReleases("a/b", fetchImpl);
    expect(tags.map((t) => t.tag_name)).toEqual(["v2.0.0", "v1.9.0"]);
    expect(tags[0]?.body).toBeNull();
    expect(tags[0]?.published_at).toContain("2026-01-02");
  });

  it("ignores snapshot tags that are not versions", async () => {
    // golang/go's tag page is full of weekly.2011-03-07.1, which sorted ahead of go1.25.1.
    const fetchImpl = route({
      "/releases": () => json([]),
      "/tags": () => json([
        { name: "weekly.2011-03-07.1", commit: { sha: "a" } },
        { name: "go1.25.1", commit: { sha: "b" } },
      ]),
      "/commits/": () => json({ commit: { committer: { date: "2026-01-02T00:00:00Z" } } }),
    });
    expect((await listPublicReleases("a/b", fetchImpl)).map((t) => t.tag_name)).toEqual(["go1.25.1"]);
  });

  it("says so when a repository has neither releases nor version tags", async () => {
    const fetchImpl = route({
      "/releases": () => json([]),
      "/tags": () => json([{ name: "weekly.2012-03-27", commit: { sha: "a" } }]),
    });
    await expect(listPublicReleases("a/b", fetchImpl)).rejects.toMatchObject({
      code: "demo.no-releases",
    });
  });
});
