// init: detect brand, write .shipseal/brand.json + config.json, render sample
// Spec: docs/PROJECT_PLAN.md §18.1

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join } from "node:path";
import type { BrandDetection } from "../brand/detect.js";
import { detectBrand } from "../brand/detect-node.js";
import { brandSchema } from "../brand/schema.js";
import { DEFAULT_CONFIG, configSchema } from "../config/schema.js";
import { ShipsealError } from "../core/errors.js";
import { generate } from "../core/generate.js";
import { deterministicCopy } from "../copy/deterministic.js";
import { fact } from "../facts/fact.js";
import type { Facts } from "../facts/schema.js";
import { createTakumiRenderer } from "../render/takumi-node.js";

export interface InitOptions {
  cwd: string;
  yes: boolean;
  force: boolean;
}

export interface InitResult {
  brandPath: string;
  configPath: string;
  samplePath: string;
  detection: BrandDetection;
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const detection = await detectBrand(options.cwd);
  const brandDir = join(options.cwd, ".shipseal");
  const brandPath = join(brandDir, "brand.json");
  const configPath = join(brandDir, "config.json");

  if (!options.force && (existsSync(brandPath) || existsSync(configPath))) {
    throw new ShipsealError(
      "init.exists",
      ".shipseal/brand.json or config.json already exists.",
      "Re-run with --force to overwrite, or edit the files by hand.",
    );
  }

  if (!options.yes) {
    const accepted = await confirmInit(detection);
    if (!accepted) {
      throw new ShipsealError(
        "init.cancelled",
        "Init cancelled; no files were written.",
        "Re-run shipseal init and confirm, or pass --yes to accept detections.",
      );
    }
  }

  const brand = brandSchema.parse(detection.brand);
  const config = configSchema.parse(DEFAULT_CONFIG);
  await mkdir(brandDir, { recursive: true });
  await writeFile(brandPath, `${JSON.stringify(brand, null, 2)}\n`, "utf8");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await ensureGitignore(options.cwd);

  const sampleDir = join(brandDir, "output", "sample");
  await mkdir(sampleDir, { recursive: true });
  const samplePath = join(sampleDir, "release-hero-og.png");
  const renderer = await createTakumiRenderer();
  // Render the real release-hero template with the brand just detected. This used to be a
  // hard-coded card that said "Shipseal" for every user, which made the tool look like it had
  // ignored their project. The point of the sample is to show them their own brand.
  const fetchedAt = new Date().toISOString();
  const provenance = { source: "brand" as const, ref: ".shipseal/brand.json", fetchedAt };
  const sampleFacts: Facts = {
    project: { name: fact(brand.name, provenance) },
  };
  if (brand.tagline !== undefined) {
    sampleFacts.project.tagline = fact(brand.tagline, provenance);
  }
  if (brand.url !== undefined) {
    sampleFacts.project.url = fact(brand.url, provenance);
  }
  const sample = await generate({
    event: { kind: "release", tag: "v1.0.0" },
    facts: sampleFacts,
    brand,
    config: { ...config, formats: ["og"], release: { ...config.release, templates: ["release-hero"] } },
    copy: deterministicCopy(sampleFacts),
    copyMode: "deterministic",
    renderer,
    themes: [brand.theme],
    generatedAt: fetchedAt,
  });
  const first = sample.files[0];
  if (first === undefined) {
    throw new ShipsealError(
      "init.sample-failed",
      "Could not render the sample card.",
      "Run shipseal doctor to check fonts and the renderer.",
    );
  }
  await writeFile(samplePath, first.bytes);

  return { brandPath, configPath, samplePath, detection };
}

async function confirmInit(detection: BrandDetection): Promise<boolean> {
  if (!input.isTTY) {
    throw new ShipsealError(
      "init.unattended",
      "stdin is not a TTY, so init cannot ask for confirmation.",
      "Re-run with --yes to accept the detected brand and write files.",
    );
  }
  output.write("Detected brand:\n");
  for (const field of detection.sources) {
    output.write(`  ${field.field}: from ${field.source}\n`);
  }
  for (const note of detection.notes) {
    output.write(`  note: ${note}\n`);
  }
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Write .shipseal/brand.json and config.json? [y/N] ");
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function ensureGitignore(cwd: string): Promise<void> {
  const path = join(cwd, ".gitignore");
  const entry = ".shipseal/output/";
  if (!existsSync(path)) {
    await writeFile(path, `${entry}\n`, "utf8");
    return;
  }
  const current = await readFile(path, "utf8");
  if (current.split(/\r?\n/).some((line) => line.trim() === entry || line.trim() === ".shipseal/output")) {
    return;
  }
  const prefix = current.endsWith("\n") || current.length === 0 ? "" : "\n";
  await writeFile(path, `${current}${prefix}${entry}\n`, "utf8");
}
