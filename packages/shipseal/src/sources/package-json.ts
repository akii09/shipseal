// package.json source
// Spec: docs/PROJECT_PLAN.md §12.2

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { fact } from "../facts/fact.js";
import type { PartialFacts, PartialProject } from "../facts/partial.js";
import { stripEmoji } from "../copy/deterministic.js";

const pkgSchema = z.object({
  private: z.boolean().optional(),
  name: z.string().optional(),
  bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  homepage: z.string().optional(),
  license: z.string().optional(),
  repository: z.union([z.string(), z.object({ url: z.string().optional() })]).optional(),
});

export async function collectPackageJson(
  cwd: string,
  packagePath = "package.json",
): Promise<PartialFacts> {
  const path = join(cwd, packagePath);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  const pkg = pkgSchema.safeParse(parsed);
  if (!pkg.success) {
    return {};
  }
  const fetchedAt = new Date().toISOString();
  // A private package.json is a workspace root and its name is plumbing, not a brand. Using
  // it put "shipseal-monorepo 0.0.5" on a real hero card. Fall back to the directory, and let
  // a README heading or the git remote win if either has something better.
  const rawName = pkg.data.private === true ? undefined : pkg.data.name;
  const project: PartialProject = {
    name: fact(stripScope(rawName ?? basenameFromPath(cwd)), {
      source: "package-json",
      ref: rawName === undefined ? `${packagePath} directory name` : `${packagePath}#name`,
      fetchedAt,
    }),
  };
  if (pkg.data.description !== undefined && pkg.data.description.length > 0) {
    project.tagline = fact(stripEmoji(pkg.data.description), {
      source: "package-json",
      ref: `${packagePath}#description`,
      fetchedAt,
    });
  }
  const url = pkg.data.homepage ?? repositoryUrl(pkg.data.repository);
  if (url !== undefined) {
    project.url = fact(url, {
      source: "package-json",
      ref: pkg.data.homepage !== undefined ? `${packagePath}#homepage` : `${packagePath}#repository`,
      fetchedAt,
    });
  }
  const repo = repoSlug(pkg.data.repository);
  if (repo !== undefined) {
    project.repo = fact(repo, {
      source: "package-json",
      ref: `${packagePath}#repository`,
      fetchedAt,
    });
  }
  // A private package is never on npm. Taking its name put "npm i shipseal-monorepo" on a
  // real release card, telling people to install a package that does not exist.
  if (pkg.data.name !== undefined && pkg.data.private !== true) {
    project.npmPackage = fact(pkg.data.name, {
      source: "package-json",
      ref: `${packagePath}#name`,
      fetchedAt,
    });
  }
  // A package with a bin is run, not imported. "npm i shipseal" told people to install a CLI
  // as a dependency, which is not how any of the docs say to use it.
  if (pkg.data.bin !== undefined && pkg.data.private !== true) {
    project.cli = fact(true, {
      source: "package-json",
      ref: `${packagePath}#bin`,
      fetchedAt,
    });
  }
  if (pkg.data.license !== undefined) {
    project.license = fact(pkg.data.license, {
      source: "package-json",
      ref: `${packagePath}#license`,
      fetchedAt,
    });
  }

  const out: PartialFacts = { project };
  if (pkg.data.version !== undefined) {
    out.release = {
      version: fact(pkg.data.version.replace(/^v/, ""), {
        source: "package-json",
        ref: `${packagePath}#version`,
        fetchedAt,
      }),
    };
  }
  return out;
}

function stripScope(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

function basenameFromPath(cwd: string): string {
  const parts = cwd.split(/[/\\]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? "project";
}

function repositoryUrl(repository: z.infer<typeof pkgSchema>["repository"]): string | undefined {
  if (typeof repository === "string") {
    return normalizeGitUrl(repository);
  }
  if (repository?.url !== undefined) {
    return normalizeGitUrl(repository.url);
  }
  return undefined;
}

function repoSlug(repository: z.infer<typeof pkgSchema>["repository"]): string | undefined {
  const url = repositoryUrl(repository);
  if (url === undefined) {
    return undefined;
  }
  const match = /github\.com[/:]([^/]+\/[^/]+)$/.exec(url.replace(/\.git$/, ""));
  return match?.[1];
}

// npm allows shorthand repository strings: "owner/repo", "github:owner/repo",
// and the other hosts' prefixes. Expand the GitHub ones so repoSlug and the
// GitHub source see a real URL. Without this, `milestone` could not read stars
// for any project using the shorthand, which is the most common form.
const SHORTHAND = /^(?:github:)?([\w.-]+\/[\w.-]+)$/;

function normalizeGitUrl(url: string): string {
  const shorthand = SHORTHAND.exec(url);
  if (shorthand?.[1] !== undefined) {
    return `https://github.com/${shorthand[1].replace(/\.git$/, "")}`;
  }
  const ssh = /^git@([^:]+):(.+)$/.exec(url);
  if (ssh !== null && ssh[1] !== undefined && ssh[2] !== undefined) {
    return `https://${ssh[1]}/${ssh[2].replace(/\.git$/, "")}`;
  }
  return url.replace(/^git\+/, "").replace(/\.git$/, "");
}
