// Benchmark JSON reader
// Spec: docs/PROJECT_PLAN.md §12.7

import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { ShipsealError } from "../core/errors.js";
import { fact } from "../facts/fact.js";
import type { Facts } from "../facts/schema.js";
import type { PartialFacts } from "../facts/partial.js";

const metricSchema = z.object({
  label: z.string().min(1),
  before: z.number().finite(),
  after: z.number().finite(),
  unit: z.string().min(1),
  better: z.enum(["lower", "higher"]),
});

const benchFileSchema = z.object({
  title: z.string().min(1),
  metrics: z.array(metricSchema).min(1).max(3),
  note: z.string().optional(),
});

export async function collectBenchFile(cwd: string, filePath = ".shipseal/bench.json"): Promise<PartialFacts> {
  const resolved = isAbsolute(filePath) ? filePath : join(cwd, filePath);
  let raw: string;
  try {
    raw = await readFile(resolved, "utf8");
  } catch (error) {
    throw new ShipsealError(
      "bench.missing-file",
      `Benchmark file not found: ${filePath}.`,
      "Write .shipseal/bench.json (title, metrics with before/after/unit/better), or pass --file <path>.",
      { cause: error },
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new ShipsealError(
      "bench.invalid-json",
      `Benchmark file is not valid JSON: ${filePath}.`,
      "Fix the JSON syntax, then retry.",
      { cause: error },
    );
  }
  const parsed = benchFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new ShipsealError(
      "bench.invalid-shape",
      `Benchmark file is missing required fields: ${filePath}.`,
      'Each metric needs label, before, after, unit, and better ("lower" or "higher"). At most 3 metrics.',
    );
  }
  const fetchedAt = new Date().toISOString();
  const ref = filePath;
  const bench: NonNullable<Facts["bench"]> = {
    title: fact(parsed.data.title, { source: "bench-file", ref: `${ref}#title`, fetchedAt }),
    metrics: parsed.data.metrics.map((metric, index) => ({
      label: fact(metric.label, { source: "bench-file", ref: `${ref}#metrics[${String(index)}].label`, fetchedAt }),
      before: fact(metric.before, { source: "bench-file", ref: `${ref}#metrics[${String(index)}].before`, fetchedAt }),
      after: fact(metric.after, { source: "bench-file", ref: `${ref}#metrics[${String(index)}].after`, fetchedAt }),
      unit: fact(metric.unit, { source: "bench-file", ref: `${ref}#metrics[${String(index)}].unit`, fetchedAt }),
      better: fact(metric.better, { source: "bench-file", ref: `${ref}#metrics[${String(index)}].better`, fetchedAt }),
    })),
  };
  if (parsed.data.note !== undefined) {
    bench.note = fact(parsed.data.note, { source: "bench-file", ref: `${ref}#note`, fetchedAt });
  }
  return { bench };
}
