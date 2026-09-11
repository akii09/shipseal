// Load .shipseal/brand.json
// Spec: docs/PROJECT_PLAN.md §10.1

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ShipsealError } from "../core/errors.js";
import { brandSchema, type Brand } from "./schema.js";

export async function loadBrand(cwd: string): Promise<Brand> {
  const path = join(cwd, ".shipseal", "brand.json");
  try {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    return brandSchema.parse(raw);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new ShipsealError(
        "brand.missing",
        "No .shipseal/brand.json found.",
        "Run shipseal init to detect brand colors and write brand.json.",
      );
    }
    throw error;
  }
}
