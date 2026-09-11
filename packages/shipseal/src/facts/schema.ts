// zod schemas for Facts, Fact<T>, Provenance
// Spec: docs/PROJECT_PLAN.md §9

import { z } from "zod";

export const SOURCE_IDS = [
  "git",
  "package-json",
  "readme",
  "changelog",
  "github-api",
  "npm-api",
  "bench-file",
  "user-config",
  "brand",
] as const;

export const sourceIdSchema = z.enum(SOURCE_IDS);
export type SourceId = z.infer<typeof sourceIdSchema>;

export const provenanceSchema = z.object({
  source: sourceIdSchema,
  ref: z.string().min(1),
  fetchedAt: z.iso.datetime(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export function factSchema<T extends z.ZodType>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    provenance: provenanceSchema,
  });
}

export type Fact<T> = {
  value: T;
  provenance: Provenance;
};

const stringFact = factSchema(z.string());
const numberFact = factSchema(z.number());
const stringListFact = factSchema(z.array(z.string()));
const codeSnippetFact = factSchema(
  z.object({
    code: z.string(),
    lang: z.string(),
  }),
);
const betterFact = factSchema(z.enum(["lower", "higher"]));

export const factsSchema = z.object({
  project: z.object({
    name: stringFact,
    tagline: stringFact.optional(),
    url: stringFact.optional(),
    repo: stringFact.optional(),
    npmPackage: stringFact.optional(),
    cli: factSchema(z.boolean()).optional(),
    license: stringFact.optional(),
  }),
  release: z
    .object({
      version: stringFact,
      tag: stringFact,
      kind: factSchema(z.enum(["major", "minor", "patch"])).optional(),
      headline: stringFact.optional(),
      subheadline: stringFact.optional(),
      previousVersion: stringFact.optional(),
      date: stringFact,
      features: z.array(stringFact),
      fixes: z.array(stringFact),
      breaking: z.array(stringFact),
      commitCount: numberFact.optional(),
      contributors: stringListFact.optional(),
      codeSnippet: codeSnippetFact.optional(),
    })
    .optional(),
  metrics: z
    .object({
      stars: numberFact.optional(),
      weeklyDownloads: numberFact.optional(),
      contributorCount: numberFact.optional(),
    })
    .optional(),
  bench: z
    .object({
      title: stringFact,
      metrics: z.array(
        z.object({
          label: stringFact,
          before: numberFact,
          after: numberFact,
          unit: stringFact,
          better: betterFact,
        }),
      ),
      note: stringFact.optional(),
    })
    .optional(),
  milestone: z
    .object({
      metric: stringFact,
      threshold: numberFact,
    })
    .optional(),
});

export type Facts = z.infer<typeof factsSchema>;
