// Orchestrate collectors into one Facts object
// Spec: docs/PROJECT_PLAN.md §12

import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { dirname, join } from "node:path";
import type { ShipsealEvent } from "../core/events.js";
import { ShipsealError } from "../core/errors.js";
import { fact } from "../facts/fact.js";
import { mergeFacts } from "../facts/merge.js";
import type { Fact, Facts } from "../facts/schema.js";
import type { PartialFacts, PartialProject } from "../facts/partial.js";
import { collectBenchFile } from "./bench-file.js";
import { collectChangelog } from "./changelog.js";
import { collectGit, collectGitRemote, versionFromTag } from "./git.js";
import { collectGithub } from "./github.js";
import { collectNpm, npmPackageExists } from "./npm.js";
import { collectPackageJson } from "./package-json.js";
import { collectConfiguredSnippet, collectReadme } from "./readme.js";

export interface CollectOptions {
  cwd: string;
  event: ShipsealEvent;
  packagePath?: string;
  changelogPath?: string;
  snippet?: string | null;
  headline?: string | undefined;
  subheadline?: string | undefined;
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
  const remote = await collectGitRemote(options.cwd);
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

  // A private workspace root has no npm name, so the CTA fell back to the GitHub URL even
  // when the repo publishes a package one directory down. Sits before `pkg` so an explicit
  // root name, or one from --package, still wins.
  const workspacePkg =
    pkg.project?.npmPackage === undefined
      ? // Verify what was inferred, trust what was declared. A root name, or one from
        // --package, is the user saying so; this one is a guess worth checking.
        await collectWorkspaceNpmPackage(
          options.cwd,
          options.skipNetwork === true
            ? {}
            : { verify: async (name) => npmPackageExists(name, options.fetchImpl ?? fetch) },
        )
      : {};

  // A headline passed on the command line or set in config outranks the changelog marker,
  // which outranks anything deterministic copy would compose. Recorded as a fact either way,
  // so the manifest says the words were chosen rather than derived.
  const overrides: PartialFacts = {};
  for (const slot of ["headline", "subheadline"] as const) {
    const text = options[slot]?.trim();
    if (text !== undefined && text.length > 0) {
      overrides.release = {
        ...overrides.release,
        [slot]: fact(text, {
          source: "user-config",
          ref: `--${slot} or release.${slot}`,
          fetchedAt: new Date().toISOString(),
        }),
      };
    }
  }

  // mergeFacts fills holes, so the first source to supply a fact wins. Declared beats derived
  // throughout: package.json is the author saying so, the git remote is whatever this clone
  // happens to point at, which may be a fork, a mirror or an SSH alias.
  //
  // `remote` used to sit first, with a comment claiming that let an explicit package.json
  // homepage or repository win. It did the opposite, because first wins rather than last.
  //
  // Snippet order is explicit, then release notes, then README: a configured `release.snippet`
  // is the user saying so, a fence in the release notes is about this release, and the README's
  // first fence is usually just the install command. `snippet` used to sit last, which meant a
  // configured snippet was silently ignored whenever the README had any code block at all.
  const parts: PartialFacts[] = [overrides, pkg, workspacePkg, remote, git, snippet, changelog, readme];

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
  const found = collected.find((facts) => changelogHasNotes(facts));
  if (found !== undefined) {
    return found;
  }

  // Monorepos keep the changelog beside the package, not at the repo root, and Changesets
  // writes it there. Without this, `release` on a workspace root silently fell back to raw
  // commit subjects even though a perfectly good changelog existed one directory down.
  const candidates = await workspaceChangelogs(cwd);
  const fromWorkspace = await Promise.all(
    candidates.map((candidate) => collectChangelog(cwd, version, candidate)),
  );
  return fromWorkspace.find((facts) => changelogHasNotes(facts)) ?? {};
}

/**
 * Find the one publishable package in a workspace.
 *
 * Only when there is exactly one candidate: two publishable packages make the CTA a guess, and
 * guessing which one to tell people to install is worse than falling back to the repository
 * URL. `--package` resolves the ambiguity explicitly.
 */
async function collectWorkspaceNpmPackage(
  cwd: string,
  options: { verify?: (name: string) => Promise<boolean | undefined> } = {},
): Promise<PartialFacts> {
  const paths = await workspaceManifests(cwd);
  const manifests = await Promise.all(paths.map((path) => collectPackageJson(cwd, path)));
  const found = manifests
    .map((facts, index) => ({
      name: facts.project?.npmPackage?.value,
      cli: facts.project?.cli,
      path: paths[index] ?? "",
    }))
    .filter(
      (entry): entry is { name: string; cli: Fact<boolean> | undefined; path: string } =>
        entry.name !== undefined,
    );
  const only = found.length === 1 ? found[0] : undefined;
  if (only === undefined) {
    return {};
  }
  if (options.verify !== undefined && (await options.verify(only.name)) === false) {
    // Declared public but never published. "npm i <name>" would fail for every reader, so
    // leave npmPackage unset and let the call to action fall back to the repository URL.
    return {};
  }
  const project: PartialProject = {
    npmPackage: fact(only.name, {
      source: "package-json",
      ref: `${only.path}#name`,
      fetchedAt: new Date().toISOString(),
    }),
  };
  if (only.cli !== undefined) {
    project.cli = only.cli;
  }
  return { project };
}

async function workspaceManifests(cwd: string): Promise<string[]> {
  return (await workspaceChangelogs(cwd)).map((path) =>
    path.replace(/CHANGELOG\.md$/, "package.json"),
  );
}

async function workspaceChangelogs(cwd: string): Promise<string[]> {
  const roots = ["packages", "apps"];
  const listings = await Promise.all(
    roots.map(async (root) => {
      let entries: Dirent[];
      try {
        entries = await readdir(join(cwd, root), { withFileTypes: true });
      } catch {
        return [];
      }
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name, "CHANGELOG.md"));
    }),
  );
  return listings.flat().toSorted();
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
