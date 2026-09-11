// Merge partial Facts from sources. Later sources fill holes.
// Changelog feature lists replace git commit lists when present.
// Spec: docs/PROJECT_PLAN.md §12

import { ShipsealError } from "../core/errors.js";
import type { Facts } from "./schema.js";
import type { PartialFacts, PartialMetrics, PartialProject, PartialRelease } from "./partial.js";

export function mergeFacts(parts: PartialFacts[]): Facts {
  const project: PartialProject = {};
  const release: PartialRelease = {};
  const metrics: PartialMetrics = {};
  let bench: Facts["bench"];

  for (const part of parts) {
    fillObject(project, part.project);
    mergeRelease(release, part.release);
    fillObject(metrics, part.metrics);
    if (part.bench !== undefined) {
      bench = part.bench;
    }
  }

  if (project.name === undefined) {
    throw new ShipsealError(
      "facts.missing-name",
      "Could not determine the project name.",
      "Add a name field to package.json, or an H1 in README.md.",
    );
  }

  const facts: Facts = {
    project: {
      name: project.name,
    },
  };
  if (project.tagline !== undefined) {
    facts.project.tagline = project.tagline;
  }
  if (project.url !== undefined) {
    facts.project.url = project.url;
  }
  if (project.repo !== undefined) {
    facts.project.repo = project.repo;
  }
  if (project.npmPackage !== undefined) {
    facts.project.npmPackage = project.npmPackage;
  }
  if (project.license !== undefined) {
    facts.project.license = project.license;
  }

  if (hasRelease(release)) {
    if (release.version === undefined || release.tag === undefined || release.date === undefined) {
      throw new ShipsealError(
        "facts.incomplete-release",
        "Release facts are missing version, tag, or date.",
        "Create an annotated git tag, pass --tag, or add a matching section to CHANGELOG.md.",
      );
    }
    facts.release = {
      version: release.version,
      tag: release.tag,
      date: release.date,
      features: release.features ?? [],
      fixes: release.fixes ?? [],
      breaking: release.breaking ?? [],
    };
    if (release.previousVersion !== undefined) {
      facts.release.previousVersion = release.previousVersion;
    }
    if (release.commitCount !== undefined) {
      facts.release.commitCount = release.commitCount;
    }
    if (release.contributors !== undefined) {
      facts.release.contributors = release.contributors;
    }
    if (release.codeSnippet !== undefined) {
      facts.release.codeSnippet = release.codeSnippet;
    }
  }

  if (Object.keys(metrics).length > 0) {
    facts.metrics = metrics;
  }
  if (bench !== undefined) {
    facts.bench = bench;
  }
  return facts;
}

function mergeRelease(target: PartialRelease, overlay: PartialRelease | undefined): void {
  if (overlay === undefined) {
    return;
  }
  fillObject(target, overlay, ["features", "fixes", "breaking"]);
  replaceList(target, overlay, "features");
  replaceList(target, overlay, "fixes");
  replaceList(target, overlay, "breaking");
}

function replaceList(
  target: PartialRelease,
  overlay: PartialRelease,
  key: "features" | "fixes" | "breaking",
): void {
  const next = overlay[key];
  if (next !== undefined) {
    target[key] = next;
  }
}

function fillObject<T extends object>(target: T, overlay: T | undefined, skip: (keyof T)[] = []): void {
  if (overlay === undefined) {
    return;
  }
  const skipped = new Set(skip);
  for (const key of Object.keys(overlay) as (keyof T)[]) {
    if (skipped.has(key)) {
      continue;
    }
    const value = overlay[key];
    if (value !== undefined && target[key] === undefined) {
      target[key] = value;
    }
  }
}

function hasRelease(release: PartialRelease): boolean {
  return release.version !== undefined || release.tag !== undefined || release.date !== undefined;
}
