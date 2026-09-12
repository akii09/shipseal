import { describe, expect, it } from "vitest";
import {
  collectPublicRelease,
  listPublicReleases,
  publicGithubJson,
  publicRepoSlug,
  releaseFacts,
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
