// npm weekly downloads
// Spec: docs/PROJECT_PLAN.md §12.6
// Docs checked 2026-09-11: https://github.com/npm/registry/blob/main/docs/download-counts.md
//   GET https://api.npmjs.org/downloads/point/{period}/{package}
//   period last-week. Scoped names are URL-encoded (@scope/pkg -> %40scope%2Fpkg).
//   404 means the package is unpublished or unknown: return nothing.

import { z } from "zod";
import { ShipsealError } from "../core/errors.js";
import { fact } from "../facts/fact.js";
import type { PartialFacts } from "../facts/partial.js";

const API_ROOT = "https://api.npmjs.org/downloads/point/last-week";
const REGISTRY_ROOT = "https://registry.npmjs.org";

const pointSchema = z.object({
  downloads: z.number().int().nonnegative(),
  start: z.string().optional(),
  end: z.string().optional(),
  package: z.string().optional(),
});

export interface NpmCollectOptions {
  npmPackage: string;
  fetchImpl?: typeof fetch;
  cache?: Map<string, unknown>;
}

export async function collectNpm(options: NpmCollectOptions): Promise<PartialFacts> {
  const name = options.npmPackage.trim();
  if (name.length === 0) {
    return {};
  }
  const url = `${API_ROOT}/${encodeURIComponent(name)}`;
  const cache = options.cache ?? new Map<string, unknown>();
  const cached = cache.get(url);
  const json = cached ?? (await npmGet(url, options.fetchImpl ?? fetch, cache));
  if (json === undefined) {
    return {};
  }
  const point = pointSchema.parse(json);
  return {
    metrics: {
      weeklyDownloads: fact(point.downloads, {
        source: "npm-api",
        ref: `GET /downloads/point/last-week/${name} downloads`,
        fetchedAt: new Date().toISOString(),
      }),
    },
  };
}

async function npmGet(
  url: string,
  fetchImpl: typeof fetch,
  cache: Map<string, unknown>,
): Promise<unknown | undefined> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "shipseal" } });
  } catch (error) {
    throw new ShipsealError(
      "npm.network",
      "Could not reach the npm downloads API.",
      "Check network access, then retry. Weekly downloads are optional; other facts still render.",
      { cause: error },
    );
  }
  if (response.status === 404) {
    return undefined;
  }
  if (response.status === 403 || response.status === 429) {
    throw new ShipsealError(
      "npm.rate-limit",
      "npm downloads API rate limit exceeded.",
      "Wait and retry. Milestone cards can still use stars and contributors without downloads.",
    );
  }
  if (!response.ok) {
    throw new ShipsealError(
      "npm.http",
      `npm downloads API returned HTTP ${String(response.status)} for ${url}.`,
      "Confirm the package name in package.json is published on npm.",
    );
  }
  const json: unknown = await response.json();
  cache.set(url, json);
  return json;
}

/**
 * Is this name actually published?
 *
 * The downloads endpoint cannot answer this: it 404s for a package published minutes ago that
 * has no download data yet, which is exactly the case a first release is in. The registry
 * document is the authority.
 *
 * Only a definitive 404 counts as "no". A network error, a rate limit or anything else returns
 * undefined, so an unreachable registry never removes a call to action that was probably right.
 */
export async function npmPackageExists(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | undefined> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return false;
  }
  let response: Response;
  try {
    response = await fetchImpl(`${REGISTRY_ROOT}/${encodeURIComponent(trimmed)}`, {
      method: "HEAD",
      headers: { accept: "application/json" },
    });
  } catch {
    return undefined;
  }
  if (response.status === 404) {
    return false;
  }
  return response.ok ? true : undefined;
}
