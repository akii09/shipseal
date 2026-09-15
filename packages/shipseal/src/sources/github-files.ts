// The GitHub implementation of the brand detection port, so /try detects a visitor's colors
// instead of showing them Shipseal's. Spec: docs/REVIEW_2026-09-15.md R0.
//
// Budgets matter here in a way they do not on disk. An unauthenticated visitor has 60 GitHub
// requests an hour, so the tree is fetched once and only files detection can actually use are
// read, newest-shallowest first, up to a hard cap.

import { z } from "zod";
import type { ProjectFiles } from "../brand/files.js";
import { publicGithubJson } from "./public-repo.js";

/** Directories whose colors belong to someone else, or to a build. */
const SKIP = new Set(["node_modules", "dist", "build", "vendor", "fixtures", "__snapshots__"]);

/** Reads cost a request each, so detection gets a budget rather than a whole repository. */
const MAX_READS = 14;
const MAX_DEPTH = 4;

const treeSchema = z.object({
  tree: z.array(z.object({ path: z.string(), type: z.string() })),
  truncated: z.boolean().optional(),
});
const blobSchema = z.object({ encoding: z.literal("base64"), content: z.string() });

/** Only what detectColors and readPackage actually open. */
function isCandidate(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  return (
    path === "package.json" ||
    path === "README.md" ||
    path.endsWith(".css") ||
    path.endsWith(".tokens.json") ||
    name.startsWith("tailwind.config.")
  );
}

/**
 * Where projects conventionally keep the file that defines their palette. Probed directly when
 * the tree is unavailable: a large repository's recursive tree exceeds the demo response cap,
 * and failing the whole card over that is worse than rendering it in default colors.
 */
const CONVENTIONAL = [
  "app/globals.css",
  "src/app/globals.css",
  "src/styles/globals.css",
  "styles/globals.css",
  "src/index.css",
  "src/styles/index.css",
  "assets/css/main.css",
  "docs/assets/base.css",
  "tailwind.config.js",
  "tailwind.config.ts",
  "package.json",
];

/** Shallow files first: a root stylesheet describes the brand, a deep one rarely does. */
function rank(path: string): number {
  return path.split("/").length;
}

export function githubFiles(slug: string, ref: string, fetchImpl: typeof fetch = fetch): ProjectFiles {
  let listed: Promise<string[]> | undefined;
  const cache = new Map<string, Promise<string | undefined>>();

  const list = async (): Promise<string[]> => {
    try {
      return await listFromTree();
    } catch {
      // A tree that is missing, truncated or too large must not fail the card.
      return CONVENTIONAL;
    }
  };

  const listFromTree = async (): Promise<string[]> => {
    const raw = await publicGithubJson(
      `/repos/${slug}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      fetchImpl,
      true,
    );
    const parsed = treeSchema.safeParse(raw);
    if (!parsed.success) {
      return CONVENTIONAL;
    }
    const candidates = parsed.data.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => entry.path)
      .filter((path) => {
        const parts = path.split("/");
        if (parts.length > MAX_DEPTH) {
          return false;
        }
        if (parts.some((part) => SKIP.has(part) || (part.startsWith(".") && part !== ".github"))) {
          return false;
        }
        return isCandidate(path);
      })
      .toSorted((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .slice(0, MAX_READS);
    // A truncated tree can hide the very file that defines the palette.
    return candidates.length > 0 ? candidates : CONVENTIONAL;
  };

  const readText = async (path: string): Promise<string | undefined> => {
    const raw = await publicGithubJson(
      `/repos/${slug}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
      fetchImpl,
      true,
    );
    const parsed = blobSchema.safeParse(raw);
    return parsed.success ? decode(parsed.data.content) : undefined;
  };

  return {
    list: () => (listed ??= list()),
    read: (path) => {
      const hit = cache.get(path);
      if (hit !== undefined) {
        return hit;
      }
      const pending = readText(path).catch(() => undefined);
      cache.set(path, pending);
      return pending;
    },
    // Logo bytes are not fetched: the demo has no logo to colour-sample from, and each read
    // costs a request that detection spends better on stylesheets.
    readBinary: () => Promise.resolve(undefined),
  };
}

function decode(content: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(content.replaceAll(/\s/g, "")), (char) => char.charCodeAt(0)),
  );
}
