// init: detect brand, write .shipseal/brand.json + config.json, render sample
// Spec: docs/PROJECT_PLAN.md §18.1

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join } from "node:path";
import { detectBrand, type BrandDetection } from "../brand/detect.js";
import { brandSchema } from "../brand/schema.js";
import { DEFAULT_CONFIG, configSchema } from "../config/schema.js";
import { ShipsealError } from "../core/errors.js";
import { FORMATS } from "../formats.js";
import { createTakumiRenderer, testCardNode } from "../render/takumi.js";

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
  const png = await renderer.render(testCardNode(), {
    width: FORMATS.og.width,
    height: FORMATS.og.height,
    format: "png",
  });
  await writeFile(samplePath, png);

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
