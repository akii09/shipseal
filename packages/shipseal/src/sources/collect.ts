// Orchestrate collectors into one Facts object
// Spec: docs/PROJECT_PLAN.md §12

import { dirname, join } from "node:path";
import type { ShipsealEvent } from "../core/events.js";
import { ShipsealError } from "../core/errors.js";
import { mergeFacts } from "../facts/merge.js";
import type { Facts } from "../facts/schema.js";
import type { PartialFacts } from "../facts/partial.js";
import { collectBenchFile } from "./bench-file.js";
import { collectChangelog } from "./changelog.js";
import { collectGit, versionFromTag } from "./git.js";
import { collectGithub } from "./github.js";
import { collectNpm } from "./npm.js";
import { collectPackageJson } from "./package-json.js";
import { collectConfiguredSnippet, collectReadme } from "./readme.js";

export interface CollectOptions {
  cwd: string;
  event: ShipsealEvent;
  packagePath?: string;
  changelogPath?: string;
  snippet?: string | null;
  benchFile?: string;
  githubToken?: string;
  fetchImpl?: typeof fetch;
  skipNetwork?: boolean;
}

export async function collectFacts(options: CollectOptions): Promise<Facts> {
  const pkg = await collectPackageJson(options.cwd, options.packagePath ?? "package.json");
  const tag = options.event.kind === "release" ? options.event.tag : undefined;
  const previousTag = options.event.kind === "release" ? options.event.previousTag : undefined;
  const gitEvent: { tag?: string; previousTag?: string } = {};
  if (tag !== undefined) {
    gitEvent.tag = tag;
  }
  if (previousTag !== undefined) {
    gitEvent.previousTag = previousTag;
  }
  const git = await collectGit(options.cwd, gitEvent);
  const version =
    git.release?.version?.value ??
    pkg.release?.version?.value ??
    (tag === undefined ? undefined : versionFromTag(tag));
  const changelog = await collectBestChangelog(
    options.cwd,
    version,
    options.changelogPath ?? "CHANGELOG.md",
    options.packagePath,
  );
  const readme = await collectReadme(options.cwd);
  const snippet =
    options.snippet !== undefined && options.snippet !== null && options.snippet.length > 0
      ? await collectConfiguredSnippet(options.cwd, options.snippet)
      : {};

  const parts: PartialFacts[] = [pkg, git, readme, changelog, snippet];

  if (options.event.kind === "bench") {
    parts.push(await collectBenchFile(options.cwd, options.benchFile ?? ".shipseal/bench.json"));
  }

  if (options.skipNetwork !== true) {
    const repo = pkg.project?.repo?.value ?? gitRepoFromParts(pkg, readme);
    if (repo !== undefined) {
      const githubOpts: Parameters<typeof collectGithub>[0] = { repo };
      const githubTag = git.release?.tag?.value ?? tag;
      if (githubTag !== undefined) {
        githubOpts.tag = githubTag;
      }
      if (options.githubToken !== undefined) {
        githubOpts.token = options.githubToken;
      }
      if (options.fetchImpl !== undefined) {
        githubOpts.fetchImpl = options.fetchImpl;
      }
      const github = await collectGithub(githubOpts);
      const githubWithoutFeatures: PartialFacts = {};
      if (github.project !== undefined) {
        githubWithoutFeatures.project = github.project;
      }
      if (github.metrics !== undefined) {
        githubWithoutFeatures.metrics = github.metrics;
      }
      parts.push(githubWithoutFeatures);
      const mergedPreview = mergeFacts(parts);
      if (
        options.event.kind === "release" &&
        (mergedPreview.release?.features.length ?? 0) === 0 &&
        github.release?.features !== undefined &&
        github.release.features.length > 0
      ) {
        parts.push({ release: { features: github.release.features } });
      }
    }
    const npmPackage = pkg.project?.npmPackage?.value;
    if (npmPackage !== undefined) {
      const npmOpts: Parameters<typeof collectNpm>[0] = { npmPackage };
      if (options.fetchImpl !== undefined) {
        npmOpts.fetchImpl = options.fetchImpl;
      }
      parts.push(await collectNpm(npmOpts));
    }
  }

  const facts = mergeFacts(parts);
  if (options.event.kind === "release" && facts.release === undefined) {
    throw new ShipsealError(
      "facts.missing-release",
      "Could not collect release facts.",
      "Create a git tag, pass --tag, or add a matching version section to CHANGELOG.md.",
    );
  }
  return facts;
}

async function collectBestChangelog(
  cwd: string,
  version: string | undefined,
  changelogPath: string,
  packagePath: string | undefined,
): Promise<PartialFacts> {
  const paths = [changelogPath];
  if (packagePath !== undefined) {
    const sibling = join(dirname(packagePath), "CHANGELOG.md");
    if (!paths.includes(sibling)) {
      paths.push(sibling);
    }
  }
  const collected = await Promise.all(paths.map((path) => collectChangelog(cwd, version, path)));
  return collected.find((facts) => changelogHasNotes(facts)) ?? {};
}

function changelogHasNotes(facts: PartialFacts): boolean {
  const release = facts.release;
  if (release === undefined) {
    return false;
  }
  return (
    (release.features?.length ?? 0) > 0 ||
    (release.fixes?.length ?? 0) > 0 ||
    (release.breaking?.length ?? 0) > 0
  );
}

function gitRepoFromParts(pkg: PartialFacts, readme: PartialFacts): string | undefined {
  return pkg.project?.repo?.value ?? pkg.project?.url?.value ?? readme.project?.url?.value;
}
