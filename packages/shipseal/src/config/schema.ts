// config.json zod schema
// Spec: docs/PROJECT_PLAN.md §11

import { z } from "zod";
import { FORMAT_IDS } from "../formats.js";

export const configSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  outputDir: z.string().optional(),
  formats: z.array(z.enum(FORMAT_IDS)).optional(),
  release: z
    .object({
      templates: z.array(z.string()).optional(),
      maxHighlights: z.number().int().positive().optional(),
      changelogPath: z.string().optional(),
      snippet: z.string().nullable().optional(),
      announce: z.enum(["major", "minor", "patch"]).optional(),
    })
    .optional(),
  milestones: z
    .object({
      stars: z.array(z.number().int().positive()).optional(),
      downloads: z.array(z.number().int().positive()).optional(),
      contributors: z.array(z.number().int().positive()).optional(),
    })
    .optional(),
  bench: z
    .object({
      file: z.string().optional(),
    })
    .optional(),
  copy: z
    .object({
      llm: z.boolean().optional(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      maxRetries: z.number().int().nonnegative().optional(),
    })
    .optional(),
  output: z
    .object({
      imageFormat: z.enum(["png", "webp", "jpeg"]).optional(),
    })
    .optional(),
  attribution: z.boolean().optional(),
});

export type Config = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: Config = {
  version: 1,
  outputDir: ".shipseal/output",
  formats: ["og", "github-social", "x", "linkedin"],
  release: {
    templates: ["release-hero", "release-highlights", "code-card"],
    maxHighlights: 4,
    changelogPath: "CHANGELOG.md",
    // Announce everything by default. The review proposed "minor", but a project whose release
    // script copies the rendered hero (this one does) breaks when a patch produces nothing.
    announce: "patch",
    snippet: null,
  },
  milestones: {
    stars: [100, 250, 500, 1000, 2500, 5000, 10000],
    downloads: [1000, 10000, 100000, 1000000],
    contributors: [10, 25, 50, 100],
  },
  bench: {
    file: ".shipseal/bench.json",
  },
  copy: {
    llm: false,
    provider: null,
    model: null,
    maxRetries: 2,
  },
  output: {
    imageFormat: "png",
  },
  attribution: true,
};
