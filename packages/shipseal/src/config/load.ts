// Load and merge config (flags > file > defaults)
// Spec: docs/PROJECT_PLAN.md §11

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG, configSchema, type Config } from "./schema.js";

export async function loadConfig(cwd: string): Promise<Config> {
  const path = join(cwd, ".shipseal", "config.json");
  try {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    const parsed = configSchema.parse(raw);
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

export function mergeConfig(base: Config, overlay: Config): Config {
  return {
    ...base,
    ...overlay,
    release: { ...base.release, ...overlay.release },
    milestones: { ...base.milestones, ...overlay.milestones },
    bench: { ...base.bench, ...overlay.bench },
    copy: { ...base.copy, ...overlay.copy },
    output: { ...base.output, ...overlay.output },
  };
}
