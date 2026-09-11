// Write pack files to disk
// Spec: docs/PROJECT_PLAN.md §17.1

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GenerateResult } from "../core/generate.js";
import { buildManifest, type Manifest } from "./manifest.js";
import type { Brand } from "../brand/schema.js";
import type { ShipsealEvent } from "../core/events.js";

export async function writePack(input: {
  outDir: string;
  eventId: string;
  result: GenerateResult;
  event: ShipsealEvent;
  brand: Brand;
  shipsealVersion: string;
}): Promise<{ dir: string; manifest: Manifest }> {
  const dir = join(input.outDir, input.eventId);
  await mkdir(dir, { recursive: true });
  await Promise.all(input.result.files.map((file) => writeFile(join(dir, file.fileName), file.bytes)));
  const manifest = buildManifest({
    result: input.result,
    event: input.event,
    brand: input.brand,
    shipsealVersion: input.shipsealVersion,
  });
  await writeFile(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { dir, manifest };
}

export function eventId(event: ShipsealEvent): string {
  if (event.kind === "release") {
    return event.tag;
  }
  if (event.kind === "milestone") {
    return `milestone-${event.metric}-${String(event.threshold)}`;
  }
  return `bench-${event.file}`;
}
