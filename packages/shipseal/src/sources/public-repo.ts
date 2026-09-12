// Unauthenticated GitHub reads for the browser demo: repository metadata, published releases
// and an optional brand file. GitHub REST docs checked 2026-09-13 (releases, repositories,
// contents). Spec: docs/PROJECT_PLAN.md 25 (2026-09-13 decisions).

import { z } from "zod";
import {
  brandSchema,
  DEFAULT_BRAND_COLORS,
  DEFAULT_BRAND_FONTS,
  type Brand,
} from "../brand/schema.js";
import { cleanLine } from "../copy/deterministic.js";
import { ShipsealError } from "../core/errors.js";
import { fact } from "../facts/fact.js";
import type { Fact, Facts } from "../facts/schema.js";
import { parseRepo } from "./github.js";

/** A release body can list plenty; the cards show four, so more than this is never needed. */
const MAX_ENTRIES_PER_CATEGORY = 8;
const MAX_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 15_000;

const repoSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  html_url: z.url(),
  stargazers_count: z.number().int().nonnegative(),
  private: z.boolean(),
});

export const publicReleaseSchema = z.object({
  tag_name: z.string().min(1).max(200),
  name: z.string().nullable(),
  body: z.string().nullable(),
  published_at: z.iso.datetime(),
  draft: z.boolean(),
  prerelease: z.boolean(),
});
export type PublicRelease = z.infer<typeof publicReleaseSchema>;

const contentsSchema = z.object({
  encoding: z.literal("base64"),
  content: z.string(),
  size: z.number().max(1_000_000),
});

export async function publicGithubJson(
  path: string,
  fetchImpl: typeof fetch = fetch,
  optional = false,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(`https://api.github.com${path}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      credentials: "omit",
    });
  } catch (error) {
    throw new ShipsealError(
      "demo.network",
      "Could not reach GitHub.",
      "Check your connection and retry, or use the local CLI.",
      { cause: error },
    );
  }
  if (response.status === 404 && optional) {
    return undefined;
  }
  if (response.status === 403 || response.status === 429) {
    throw new ShipsealError(
      "demo.rate-limit",
      "GitHub refused this unauthenticated request, usually because the rate limit was reached.",
      "Wait for the limit to reset or use the local CLI with GITHUB_TOKEN.",
    );
  }
  if (!response.ok) {
    throw new ShipsealError(
      "demo.github",
      `GitHub returned HTTP ${String(response.status)}.`,
      "Check that the repository is public and the release exists.",
    );
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new ShipsealError(
      "demo.too-large",
      "The GitHub response is too large for the demo.",
      "Use the local CLI for this repository.",
    );
  }
  try {
    const json: unknown = JSON.parse(text);
    return json;
  } catch (error) {
    throw new ShipsealError("demo.invalid-response", "GitHub returned invalid JSON.", "Retry the request.", {
      cause: error,
    });
  }
}

export function publicRepoSlug(input: string): string {
  const repo = parseRepo(input.replace(/\/$/, ""));
  if (
    repo === undefined ||
    repo.owner === "." ||
    repo.owner === ".." ||
    repo.repo === "." ||
    repo.repo === ".."
  ) {
    throw new ShipsealError(
      "demo.bad-repo",
      "This is not a GitHub repository URL.",
      "Enter https://github.com/owner/repo or owner/repo.",
    );
  }
  return `${repo.owner}/${repo.repo}`;
}

export async function listPublicReleases(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicRelease[]> {
  const slug = publicRepoSlug(input);
  const parsed = z
    .array(publicReleaseSchema)
    .safeParse(await publicGithubJson(`/repos/${slug}/releases?per_page=12`, fetchImpl));
  if (!parsed.success) {
    throw new ShipsealError(
      "demo.release-shape",
      "GitHub returned an unexpected release response.",
      "Retry or use the local CLI.",
    );
  }
  const releases = parsed.data.filter((release) => !release.draft);
  if (releases.length === 0) {
    throw new ShipsealError(
      "demo.no-releases",
      "This repository has no published GitHub releases.",
      "Try a repository with published releases, or run shipseal init locally for a sample.",
    );
  }
  return releases;
}

/** Strip markdown images, links, inline code and raw HTML from one bullet. */
function cleanBullet(line: string): string {
  return cleanLine(
    line
      .replace(/^\s*[-*]\s+/, "")
      .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replaceAll(/<[^>]*>/g, "")
      .replaceAll(/[*`]/g, ""),
  );
}

export function releaseFacts(
  slug: string,
  name: string,
  description: string | null,
  stars: number,
  release: PublicRelease,
  fetchedAt: string,
): Facts {
  const source = (value: string, field: string): Fact<string> =>
    fact(value, {
      source: "github-api",
      ref: `https://api.github.com/repos/${slug}/releases/tags/${encodeURIComponent(release.tag_name)}#${field}`,
      fetchedAt,
    });
  const projectSource = (field: string) => ({
    source: "github-api" as const,
    ref: `https://api.github.com/repos/${slug}#${field}`,
    fetchedAt,
  });

  const features: Fact<string>[] = [];
  const fixes: Fact<string>[] = [];
  const breaking: Fact<string>[] = [];
  const body = release.body ?? "";
  // Headings switch the bucket, bullets fill it. Fenced code and HTML comments are dropped
  // first so a snippet cannot be read as a list of changes.
  let category = features;
  for (const line of body
    .replaceAll(/```[\s\S]*?```/g, "")
    .replaceAll(/<!--[\s\S]*?-->/g, "")
    .split(/\r?\n/)) {
    if (/^#+/.test(line)) {
      category = /breaking|major/i.test(line)
        ? breaking
        : /fix|patch/i.test(line)
          ? fixes
          : features;
      continue;
    }
    if (!/^\s*[-*]\s+/.test(line)) {
      continue;
    }
    const cleaned = cleanBullet(line);
    if (cleaned.length > 0 && category.length < MAX_ENTRIES_PER_CATEGORY) {
      category.push(source(cleaned, "body"));
    }
  }

  const facts: Facts = {
    project: {
      name: fact(name, projectSource("name")),
      repo: fact(slug, projectSource("full_name")),
      url: fact(`https://github.com/${slug}`, projectSource("html_url")),
    },
    metrics: { stars: fact(stars, projectSource("stargazers_count")) },
    release: {
      tag: source(release.tag_name, "tag_name"),
      version: source(release.tag_name.replace(/^v(?=\d)/, ""), "tag_name"),
      date: source(release.published_at.slice(0, 10), "published_at"),
      features,
      fixes,
      breaking,
    },
  };
  if (description) {
    facts.project.tagline = fact(cleanLine(description), projectSource("description"));
  }
  const snippet = /```([\w+-]*)\r?\n([\s\S]*?)```/.exec(body);
  if (snippet?.[2] !== undefined && facts.release !== undefined) {
    facts.release.codeSnippet = fact(
      { code: snippet[2].trimEnd(), lang: snippet[1] || "text" },
      source("", "body").provenance,
    );
  }
  return facts;
}

function demoBrand(name: string, url: string): Brand {
  return {
    version: 1,
    name,
    url,
    colors: DEFAULT_BRAND_COLORS,
    fonts: DEFAULT_BRAND_FONTS,
    radius: 16,
    theme: "dark",
    style: "minimal",
    tokens: null,
  };
}

function decodeBase64Json(content: string): unknown {
  const bytes = Uint8Array.from(atob(content.replaceAll(/\s/g, "")), (char) =>
    char.charCodeAt(0),
  );
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return json;
}

export async function collectPublicRelease(
  input: string,
  release: PublicRelease,
  fetchImpl: typeof fetch = fetch,
): Promise<{ facts: Facts; brand: Brand; notes: string[] }> {
  const slug = publicRepoSlug(input);
  const parsed = repoSchema.safeParse(await publicGithubJson(`/repos/${slug}`, fetchImpl));
  if (!parsed.success || parsed.data.private) {
    throw new ShipsealError(
      "demo.repo-shape",
      "The public repository metadata is unavailable.",
      "Choose a public repository and retry.",
    );
  }
  const repo = parsed.data;
  const fetchedAt = new Date().toISOString();
  const facts = releaseFacts(
    slug,
    repo.name,
    repo.description,
    repo.stargazers_count,
    release,
    fetchedAt,
  );

  // Where the palette came from is disclosed on the page: a demo card must never imply it
  // is using a maintainer's real brand when it is not.
  const notes: string[] = [];
  let brand = demoBrand(repo.name, repo.html_url);
  if (repo.description) {
    brand.tagline = cleanLine(repo.description);
  }
  const raw = await publicGithubJson(
    `/repos/${slug}/contents/.shipseal/brand.json?ref=${encodeURIComponent(release.tag_name)}`,
    fetchImpl,
    true,
  );
  if (raw === undefined) {
    notes.push(
      "No Shipseal brand file was found at this release. These are demo colors; choose your accent below.",
    );
    return { facts, brand, notes };
  }
  const contents = contentsSchema.safeParse(raw);
  if (!contents.success) {
    notes.push(
      "The repository brand file exceeds the demo limit or has an unsupported encoding. Demo defaults are in use.",
    );
    return { facts, brand, notes };
  }
  try {
    const detected = brandSchema.safeParse(decodeBase64Json(contents.data.content));
    if (detected.success) {
      // Fonts and logo files are not fetched in the browser, so the bundled font is used and
      // the logo is dropped. The local CLI loads both.
      brand = { ...detected.data, fonts: DEFAULT_BRAND_FONTS };
      delete brand.logo;
      notes.push(
        "Colors and name loaded from .shipseal/brand.json. The browser demo uses bundled fonts and omits repository logo files; the local CLI loads those assets.",
      );
    } else {
      notes.push(
        "The repository brand file is invalid. Demo defaults are in use; choose your accent below.",
      );
    }
  } catch (error) {
    notes.push(
      `The repository brand file could not be decoded (${error instanceof Error ? error.message : "invalid data"}). Demo defaults are in use.`,
    );
  }
  return { facts, brand, notes };
}
