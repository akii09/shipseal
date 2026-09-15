// The disk half of brand detection. Split out so `detect.ts` carries no `node:` import and the
// browser demo can run the same detection over the GitHub API (review R0). The split mirrors
// `render/takumi.ts` and `render/takumi-node.ts`, for the same reason: one top-level Node
// builtin is enough for Vite to externalise a module and serve /try a blank page.

import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { detectBrandFrom, normalizeGitUrl, type BrandDetection } from "./detect.js";
import type { ProjectFiles } from "./files.js";

const execFileAsync = promisify(execFile);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".astro",
  "out",
  "vendor",
]);

export async function detectBrand(cwd: string): Promise<BrandDetection> {
  return detectBrandFrom(diskFiles(cwd), cwd);
}

/** The disk implementation of the port, used by the CLI. Paths stay absolute here. */
export function diskFiles(cwd: string, maxDepth = 4): ProjectFiles {
  return {
    list: () => listFiles(cwd, maxDepth),
    read: async (path) => {
      try {
        return await readFile(isAbsolute(path) ? path : join(cwd, path), "utf8");
      } catch {
        return undefined;
      }
    },
    gitRemote: () => gitRemote(cwd),
    readBinary: async (path) => {
      try {
        return await readFile(isAbsolute(path) ? path : join(cwd, path));
      } catch {
        return undefined;
      }
    },
  };
}

async function listFiles(root: string, maxDepth: number): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth < 0) {
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const nested: Promise<void>[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github") {
        continue;
      }
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        nested.push(walk(path, depth - 1));
      } else {
        out.push(path);
      }
    }
    await Promise.all(nested);
  };
  await walk(root, maxDepth);
  return out;
}

async function gitRemote(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd });
    return normalizeGitUrl(stdout.trim());
  } catch (error) {
    if (error instanceof Error) {
      return undefined;
    }
    throw error;
  }
}
