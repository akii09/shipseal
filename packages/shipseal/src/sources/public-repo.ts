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
import { detectColorsFrom, type FieldSource } from "../brand/detect-colors.js";
import { fact } from "../facts/fact.js";
import type { Fact, Facts } from "../facts/schema.js";
import { parseRepo } from "./github.js";
import { githubFiles } from "./github-files.js";
import { cleanReleaseLine } from "./release-line.js";

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

const tagSchema = z.object({ name: z.string().min(1).max(200), commit: z.object({ sha: z.string() }) });
const commitSchema = z.object({ commit: z.object({ committer: z.object({ date: z.iso.datetime() }) }) });
const compareSchema = z.object({ total_commits: z.number().int().nonnegative() });

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
    // Go and CPython ship tags and no GitHub Releases, so releases-only discovery locked out two
    // of the best known repositories there are (review R2). A tag carries no notes, so the pack
    // is thinner and the manifest says why.
    return listPublicTags(slug, fetchImpl);
  }
  return releases;
}

/** Numeric segments, compared left to right. Enough to order tags; not a semver implementation. */
function versionParts(value: string): number[] {
  return (value.match(/\d+/g) ?? []).map(Number);
}

function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return a.localeCompare(b);
}

/**
 * A tag that names a version: `v1.2.3`, `go1.25.1`, `pkg@2.0.0`, `bun-v1.4.2`.
 *
 * Anchored, and the prefix excludes a dot on purpose. An unanchored pattern matched
 * `weekly.2011-03-07.1` on the `07.1`, and sorting numerically then put a snapshot from 2011
 * ahead of go1.25.1.
 */
const RELEASE_TAG = /^[A-Za-z@/_-]*v?\d+\.\d+(?:\.\d+)?(?:[-+.][\w.]+)?$/;

/**
 * Prerelease spellings in the wild: `v1.0.0-rc.1`, `v3.15.0rc2`, and CPython's `v3.15.0a8`,
 * where a single letter carries the meaning.
 */
export function isPrerelease(tag: string): boolean {
  return /(?:-|\b)(?:rc|alpha|beta|pre|dev)\.?\d*$/i.test(tag) || /\d(?:a|b|rc)\d+$/i.test(tag);
}

/**
 * The release this one should be compared against: the previous release of the same package.
 * vitejs/vite compared v8.3.0 against create-vite@9.2.1 and reported zero commits, because the
 * neighbouring entry in a monorepo belongs to a different package.
 */
export function previousTagFor(releases: PublicRelease[], release: PublicRelease): string | undefined {
  const prefix = /^(.+@)/.exec(release.tag_name)?.[1] ?? "";
  const samePackage = (item: PublicRelease) =>
    prefix === "" ? !item.tag_name.includes("@") : item.tag_name.startsWith(prefix);
  const earlier = releases.slice(releases.indexOf(release) + 1).filter(samePackage);
  // A stable release is measured against the previous stable one, not against its own beta.
  return (release.prerelease ? earlier[0] : (earlier.find((item) => !item.prerelease) ?? earlier[0]))
    ?.tag_name;
}

/** Newest tags as releases, for projects that tag without publishing a Release. */
async function listPublicTags(slug: string, fetchImpl: typeof fetch): Promise<PublicRelease[]> {
  const parsed = z
    .array(tagSchema)
    .safeParse(await publicGithubJson(`/repos/${slug}/tags?per_page=100`, fetchImpl));
  if (!parsed.success || parsed.data.length === 0) {
    throw new ShipsealError(
      "demo.no-releases",
      "This repository has no published GitHub releases and no tags.",
      "Try a repository that publishes releases or tags, or run shipseal init locally for a sample.",
    );
  }
  // GitHub does not return tags newest first. golang/go led with weekly.2012-03-27, a tag from
  // 2012, so version-shaped tags are selected and ordered here instead.
  // Require a real version. golang/go's first page of tags is entirely weekly.2012-03-27 style
  // snapshots, and leading with a tag from 2012 is worse than saying nothing.
  const ordered = parsed.data
    .filter((tag) => RELEASE_TAG.test(tag.name))
    .toSorted((a, b) => compareVersions(b.name, a.name));
  const newest = ordered[0];
  if (newest === undefined) {
    throw new ShipsealError(
      "demo.no-releases",
      "This repository publishes no releases and no version tags.",
      "Try a repository that publishes releases, or run shipseal init locally for a sample.",
    );
  }
  const commit = commitSchema.safeParse(
    await publicGithubJson(`/repos/${slug}/commits/${newest.commit.sha}`, fetchImpl, true),
  );
  const dated = commit.success ? commit.data.commit.committer.date : new Date().toISOString();
  return ordered.map((tag, index) => ({
    tag_name: tag.name,
    name: tag.name,
    body: null,
    // Only the newest tag's date is fetched; the rest are ordered, not dated.
    published_at: index === 0 ? dated : dated,
    draft: false,
    prerelease: isPrerelease(tag.name),
  }));
}

/** Same rules as the CHANGELOG path, then the shared prose normalisation. */
function cleanBullet(line: string): string {
  return cleanLine(cleanReleaseLine(line));
}

/**
 * Repository names that say nothing about the project. `home-assistant/core` and `shadcn-ui/ui`
 * both rendered headlines like "core 2026.9.2" and "ui shadcn@4.21.0" (review R3), because the
 * name of a monorepo directory is plumbing rather than a brand.
 */
const GENERIC_REPO_NAMES = new Set([
  "core", "cli", "ui", "app", "web", "api", "docs", "sdk", "lib", "www", "site", "main", "monorepo",
]);

/** The package a monorepo tag names, as in `shadcn@4.21.0`. */
function tagPackage(tag: string): string | undefined {
  return /^(.+)@\d/.exec(tag)?.[1];
}

/**
 * The version inside a tag. Projects prefix them in several ways: `shadcn@4.21.0`,
 * `bun-v1.4.2`, `pkg/2.0.0`. A bare `v1.0.0` or a date like `2026.9.2` is left alone.
 */
export function releaseVersion(tag: string): string {
  return tag.replace(/^[A-Za-z][\w.]*[-@/](?=v?\d)/, "").replace(/^v(?=\d)/, "");
}

/** What to call the project: the tag's package, else the owner when the repo name is generic. */
export function projectName(slug: string, repoName: string, tag: string): string {
  const fromTag = tagPackage(tag);
  if (fromTag !== undefined && fromTag.length > 0) {
    return fromTag;
  }
  return GENERIC_REPO_NAMES.has(repoName.toLowerCase()) ? (slug.split("/")[0] ?? repoName) : repoName;
}

/**
 * The newest stable release, falling back to a prerelease only when that is all there is.
 * zed-industries/zed defaulted to `v1.20.1-pre` (review R5). Prereleases stay in the selector.
 */
export function defaultRelease(releases: PublicRelease[]): PublicRelease | undefined {
  return releases.find((release) => !release.prerelease) ?? releases[0];
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
      version: source(releaseVersion(release.tag_name), "tag_name"),
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

/**
 * Commits between two tags. The seal stamp lost its commit segment on every public repository,
 * because the demo has no git history to count (review R6). One request restores it.
 */
async function commitsBetween(
  slug: string,
  previous: string,
  tag: string,
  fetchImpl: typeof fetch,
): Promise<number | undefined> {
  const raw = await publicGithubJson(
    `/repos/${slug}/compare/${encodeURIComponent(previous)}...${encodeURIComponent(tag)}`,
    fetchImpl,
    true,
  ).catch(() => undefined);
  const parsed = compareSchema.safeParse(raw);
  return parsed.success ? parsed.data.total_commits : undefined;
}

export async function collectPublicRelease(
  input: string,
  release: PublicRelease,
  fetchImpl: typeof fetch = fetch,
  previousTag?: string,
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
    projectName(slug, repo.name, release.tag_name),
    repo.description,
    repo.stargazers_count,
    release,
    fetchedAt,
  );

  // Where the palette came from is disclosed on the page: a demo card must never imply it
  // is using a maintainer's real brand when it is not.
  if (previousTag !== undefined && facts.release !== undefined) {
    const commits = await commitsBetween(slug, previousTag, release.tag_name, fetchImpl);
    if (commits !== undefined) {
      facts.release.commitCount = fact(commits, {
        source: "github-api",
        ref: `https://api.github.com/repos/${slug}/compare/${previousTag}...${release.tag_name}#total_commits`,
        fetchedAt,
      });
      facts.release.previousVersion = fact(releaseVersion(previousTag), {
        source: "github-api",
        ref: `https://api.github.com/repos/${slug}/tags#${previousTag}`,
        fetchedAt,
      });
    }
  }

  const notes: string[] = [];
  if (release.body === null || release.body.length === 0) {
    notes.push(
      "This release has no notes, so the pack shows the project and the version only. A tagged release with notes produces change pages.",
    );
  }
  let brand = demoBrand(projectName(slug, repo.name, release.tag_name), repo.html_url);
  if (repo.description) {
    brand.tagline = cleanLine(repo.description);
  }
  const raw = await publicGithubJson(
    `/repos/${slug}/contents/.shipseal/brand.json?ref=${encodeURIComponent(release.tag_name)}`,
    fetchImpl,
    true,
  );
  if (raw === undefined) {
    // No committed brand file, which is every repository at first contact. Detect instead of
    // showing Shipseal's own palette: that was the whole promise of this page (review R0).
    const sources: FieldSource[] = [];
    const detectNotes: string[] = [];
    const colors = await detectColorsFrom(
      githubFiles(slug, release.tag_name, fetchImpl),
      slug,
      undefined,
      sources,
      detectNotes,
    );
    const found = sources.filter((source) => source.field.startsWith("colors"));
    if (found.length > 0) {
      brand = { ...brand, colors };
      const where = [...new Set(found.map((source) => source.source))].slice(0, 2);
      notes.push(
        `Colors detected from ${where.join(" and ")}. No Shipseal brand file exists yet; shipseal init writes one.`,
      );
    } else {
      notes.push(
        "No brand colors could be detected in this repository. These are demo colors; choose your accent below.",
      );
    }
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
