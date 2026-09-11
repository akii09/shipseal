// package.json source
// Spec: docs/PROJECT_PLAN.md §12.2

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { fact } from "../facts/fact.js";
import type { PartialFacts, PartialProject } from "../facts/partial.js";

const pkgSchema = z.object({
  name: z.string().optional(),
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
  const project: PartialProject = {
    name: fact(stripScope(pkg.data.name ?? basenameFromPath(cwd)), {
      source: "package-json",
      ref: `${packagePath}#name`,
      fetchedAt,
    }),
  };
  if (pkg.data.description !== undefined && pkg.data.description.length > 0) {
    project.tagline = fact(pkg.data.description, {
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
  if (pkg.data.name !== undefined) {
    project.npmPackage = fact(pkg.data.name, {
      source: "package-json",
      ref: `${packagePath}#name`,
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
      tag: fact(pkg.data.version.startsWith("v") ? pkg.data.version : `v${pkg.data.version}`, {
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

function normalizeGitUrl(url: string): string {
  const ssh = /^git@([^:]+):(.+)$/.exec(url);
  if (ssh !== null && ssh[1] !== undefined && ssh[2] !== undefined) {
    return `https://${ssh[1]}/${ssh[2].replace(/\.git$/, "")}`;
  }
  return url.replace(/^git\+/, "").replace(/\.git$/, "");
}
