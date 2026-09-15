// GitHub REST via fetch (token optional)
// Spec: docs/PROJECT_PLAN.md §12.5
// Docs checked 2026-09-11: https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28
//   GET /repos/{owner}/{repo}
//   GET /repos/{owner}/{repo}/releases/tags/{tag}
//   GET /repos/{owner}/{repo}/contributors
// Headers: Accept application/vnd.github+json, X-GitHub-Api-Version 2022-11-28

import { z } from "zod";
import { ShipsealError } from "../core/errors.js";
import { fact } from "../facts/fact.js";
import type { Fact } from "../facts/schema.js";
import type { PartialFacts } from "../facts/partial.js";
import { stripEmoji } from "../copy/deterministic.js";

const API_VERSION = "2022-11-28";
const API_ROOT = "https://api.github.com";

const repoSchema = z.object({
  stargazers_count: z.number().int().nonnegative(),
  description: z.string().nullable().optional(),
  homepage: z.string().nullable().optional(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable().optional(),
});

const releaseSchema = z.object({
  body: z.string().nullable().optional(),
});

const contributorsSchema = z.array(z.unknown());

export interface GithubCacheEntry {
  json: unknown;
  link: string | null;
}

export interface GithubCollectOptions {
  repo: string;
  tag?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  cache?: Map<string, GithubCacheEntry>;
}

export async function collectGithub(options: GithubCollectOptions): Promise<PartialFacts> {
  const slug = parseRepo(options.repo);
  if (slug === undefined) {
    return {};
  }
  const fetchedAt = new Date().toISOString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = options.cache ?? new Map<string, GithubCacheEntry>();
  const repoResponse = await githubGet(
    `${API_ROOT}/repos/${slug.owner}/${slug.repo}`,
    options.token,
    fetchImpl,
    cache,
  );
  if (repoResponse === undefined) {
    return {};
  }
  const repo = repoSchema.parse(repoResponse.json);
  const out: PartialFacts = {
    metrics: {
      stars: fact(repo.stargazers_count, {
        source: "github-api",
        ref: `GET /repos/${slug.owner}/${slug.repo} stargazers_count`,
        fetchedAt,
      }),
    },
    project: {},
  };
  if (repo.description !== undefined && repo.description !== null && repo.description.length > 0) {
    out.project = {
      ...out.project,
      tagline: fact(stripEmoji(repo.description), {
        source: "github-api",
        ref: `GET /repos/${slug.owner}/${slug.repo} description`,
        fetchedAt,
      }),
    };
  }
  if (repo.homepage !== undefined && repo.homepage !== null && repo.homepage.length > 0) {
    out.project = {
      ...out.project,
      url: fact(repo.homepage, {
        source: "github-api",
        ref: `GET /repos/${slug.owner}/${slug.repo} homepage`,
        fetchedAt,
      }),
    };
  }
  const license = repo.license?.spdx_id;
  if (license !== undefined && license !== null && license !== "NOASSERTION") {
    out.project = {
      ...out.project,
      license: fact(license, {
        source: "github-api",
        ref: `GET /repos/${slug.owner}/${slug.repo} license.spdx_id`,
        fetchedAt,
      }),
    };
  }

  if (options.tag !== undefined) {
    const releaseResponse = await githubGet(
      `${API_ROOT}/repos/${slug.owner}/${slug.repo}/releases/tags/${encodeURIComponent(options.tag)}`,
      options.token,
      fetchImpl,
      cache,
      { notFoundOk: true },
    );
    if (releaseResponse !== undefined) {
      const release = releaseSchema.parse(releaseResponse.json);
      const features = featuresFromReleaseBody(release.body ?? "", options.tag, fetchedAt);
      if (features.length > 0) {
        out.release = { features };
      }
    }
  }

  const contributors = await githubGet(
    `${API_ROOT}/repos/${slug.owner}/${slug.repo}/contributors?per_page=1&anon=true`,
    options.token,
    fetchImpl,
    cache,
    { notFoundOk: true },
  );
  if (contributors !== undefined) {
    contributorsSchema.parse(contributors.json);
    const listed = Array.isArray(contributors.json) ? contributors.json.length : 0;
    const fromLink = lastPageFromLink(contributors.link);
    out.metrics = {
      ...out.metrics,
      contributorCount: fact(fromLink ?? listed, {
        source: "github-api",
        ref: `GET /repos/${slug.owner}/${slug.repo}/contributors`,
        fetchedAt,
      }),
    };
  }

  return out;
}

export function parseRepo(value: string): { owner: string; repo: string } | undefined {
  const trimmed = value.trim().replace(/\.git$/, "");
  const match = /^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmed);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return undefined;
  }
  return { owner: match[1], repo: match[2] };
}

function featuresFromReleaseBody(body: string, tag: string, fetchedAt: string): Fact<string>[] {
  const lines = body
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  return lines.slice(0, 8).map((line) =>
    fact(line.replace(/\.$/, ""), {
      source: "github-api",
      ref: `GET /repos/.../releases/tags/${tag} body`,
      fetchedAt,
    }),
  );
}

async function githubGet(
  url: string,
  token: string | undefined,
  fetchImpl: typeof fetch,
  cache: Map<string, GithubCacheEntry>,
  opts: { notFoundOk?: boolean } = {},
): Promise<GithubCacheEntry | undefined> {
  const cached = cache.get(url);
  if (cached !== undefined) {
    return cached;
  }
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "shipseal",
  };
  if (token !== undefined && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }
  let response: Response;
  try {
    response = await fetchImpl(url, { headers });
  } catch (error) {
    throw new ShipsealError(
      "github.network",
      "Could not reach the GitHub API.",
      "Check network access, then retry. Unauthenticated calls are optional; facts still come from git and package.json.",
      { cause: error },
    );
  }
  if (response.status === 404 && opts.notFoundOk === true) {
    return undefined;
  }
  if (response.status === 403 || response.status === 429) {
    throw new ShipsealError(
      "github.rate-limit",
      "GitHub API rate limit exceeded.",
      "Set GITHUB_TOKEN in the environment to raise the limit, then retry.",
    );
  }
  if (!response.ok) {
    throw new ShipsealError(
      "github.http",
      `GitHub API returned HTTP ${String(response.status)} for ${url}.`,
      "Confirm the repository exists and GITHUB_TOKEN can read it.",
    );
  }
  const json: unknown = await response.json();
  const entry: GithubCacheEntry = { json, link: response.headers.get("link") };
  cache.set(url, entry);
  return entry;
}

function lastPageFromLink(link: string | null): number | undefined {
  if (link === null) {
    return undefined;
  }
  const match = /[?&]page=(\d+)>;\s*rel="last"/.exec(link);
  if (match === null || match[1] === undefined) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}
