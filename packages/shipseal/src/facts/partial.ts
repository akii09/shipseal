// Partial Facts returned by collectors before merge
// Spec: docs/PROJECT_PLAN.md §12

import type { Fact, Facts } from "./schema.js";

export type PartialProject = {
  name?: Fact<string>;
  tagline?: Fact<string>;
  url?: Fact<string>;
  repo?: Fact<string>;
  npmPackage?: Fact<string>;
  cli?: Fact<boolean>;
  license?: Fact<string>;
};

export type PartialRelease = {
  version?: Fact<string>;
  tag?: Fact<string>;
  kind?: Fact<"major" | "minor" | "patch">;
  headline?: Fact<string>;
  subheadline?: Fact<string>;
  previousVersion?: Fact<string>;
  date?: Fact<string>;
  features?: Fact<string>[];
  fixes?: Fact<string>[];
  breaking?: Fact<string>[];
  commitCount?: Fact<number>;
  contributors?: Fact<string[]>;
  codeSnippet?: Fact<{ code: string; lang: string }>;
};

export type PartialMetrics = {
  stars?: Fact<number>;
  weeklyDownloads?: Fact<number>;
  contributorCount?: Fact<number>;
};

export type PartialMilestone = {
  metric?: Fact<string>;
  threshold?: Fact<number>;
};

export type PartialFacts = {
  project?: PartialProject;
  release?: PartialRelease;
  metrics?: PartialMetrics;
  bench?: Facts["bench"];
  milestone?: PartialMilestone;
};
