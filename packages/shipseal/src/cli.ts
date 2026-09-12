#!/usr/bin/env node
// CLI entry: parse args, dispatch to commands/*
// Spec: docs/PROJECT_PLAN.md §18

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cac } from "cac";
import { runBench, type BenchFlags } from "./commands/bench.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runMilestone, type MilestoneFlags } from "./commands/milestone.js";
import { runRelease, type ReleaseFlags } from "./commands/release.js";
import { runStory } from "./commands/story.js";
import { runPreview } from "./commands/preview.js";
import { ShipsealError, formatError } from "./core/errors.js";
import { resolvePackageRoot } from "./render/takumi.js";

export async function runCli(argv = process.argv): Promise<number> {
  process.exitCode = 0;
  const cli = cac("shipseal");
  cli.option("--cwd <path>", "Working directory", { default: process.cwd() });
  cli.option("--json", "Machine-readable JSON output");
  cli.option("--quiet", "Suppress non-error output");
  cli.option("--verbose", "Verbose output");

  cli
    .command("init", "Detect brand and write .shipseal/brand.json + config.json")
    .option("--yes", "Accept detections without prompting")
    .option("--force", "Overwrite existing brand.json and config.json")
    .action(async (flags: Record<string, unknown>) => {
      const result = await runInit({
        cwd: stringFlag(flags.cwd, process.cwd()),
        yes: flags.yes === true,
        force: flags.force === true,
      });
      if (flags.json === true) {
        process.stdout.write(`${JSON.stringify(result.detection.brand, null, 2)}\n`);
        return;
      }
      if (flags.quiet !== true) {
        process.stdout.write(`Wrote ${result.brandPath}\n`);
        process.stdout.write(`Wrote ${result.configPath}\n`);
        process.stdout.write(`Sample card: ${result.samplePath}\n`);
        for (const field of result.detection.sources) {
          process.stdout.write(`  ${field.field}: ${field.source}\n`);
        }
        // Notes carry the "this is a built-in default, not your brand" disclosures.
        // The interactive prompt already shows them, and --yes skips that prompt, so
        // without this the user never learns which colors were not detected.
        for (const note of result.detection.notes) {
          process.stdout.write(`  note: ${note}\n`);
        }
      }
    });

  cli.command("story", "Generate an ordered release story, PDF carousel and ZIP")
    .option("--tag <tag>", "Release tag")
    .option("--format <format>", "portrait, square, og, github-social, x, linkedin, producthunt, or all")
    .option("--style <style>", "minimal, editorial, or terminal")
    .option("--theme <theme>", "dark or light")
    .option("--headline <text>", "Override the cover headline")
    .option("--out <dir>", "Output directory")
    .option("--package <path>", "package.json path for monorepos")
    .option("--strict", "Fit warnings exit with code 2")
    .option("--no-copy", "Use source text only (stories always use deterministic copy)")
    .action(async (flags: Record<string, unknown>) => {
      const options: Parameters<typeof runStory>[0] = { cwd: stringFlag(flags.cwd, process.cwd()), strict: flags.strict === true };
      for (const key of ["tag", "format", "style", "theme", "headline", "out", "package"] as const) {
        const value = optionalString(flags[key]); if (value !== undefined) options[key] = value;
      }
      const result = await runStory(options);
      process.exitCode = result.exitCode;
      if (flags.json === true) writeJson(result);
      else if (flags.quiet !== true) writeHumanResult({ ...result, dryRun: false, facts: result.manifest.facts, warnings: result.manifest.warnings });
    });

  cli.command("preview", "Preview release and story packs locally, then save your choices")
    .option("--tag <tag>", "Release tag")
    .option("--port <port>", "Localhost port (default: 4175)")
    .option("--package <path>", "package.json path for monorepos")
    .action(async (flags: Record<string, unknown>) => {
      const options: Parameters<typeof runPreview>[0] = { cwd: stringFlag(flags.cwd, process.cwd()) };
      for (const key of ["tag", "package"] as const) { const value = optionalString(flags[key]); if (value !== undefined) options[key] = value; }
      if (flags.port !== undefined) {
        const port = Number(flags.port);
        if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ShipsealError("preview.port", "The preview port is invalid.", "Pass an integer from 0 through 65535.");
        options.port = port;
      }
      await runPreview(options);
    });

  cli.command("doctor", "Check Node, git, brand, fonts, and Takumi").action(async (flags: Record<string, unknown>) => {
    const result = await runDoctor(stringFlag(flags.cwd, process.cwd()));
    if (flags.json === true) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else if (flags.quiet !== true) {
      for (const check of result.checks) {
        const mark = check.status === "pass" ? "ok" : check.status === "fail" ? "FAIL" : "info";
        process.stdout.write(`[${mark}] ${check.name}: ${check.message}\n`);
        if (check.fix !== undefined && check.status === "fail") {
          process.stdout.write(`      Fix: ${check.fix}\n`);
        }
      }
    }
    if (!result.ok) {
      process.exitCode = 1;
    }
  });

  cli
    .command("release", "Generate the release pack")
    .option("--tag <tag>", "Release tag")
    .option("--from <tag>", "Previous tag")
    .option("--formats <list>", "Comma-separated formats")
    .option("--templates <list>", "Comma-separated templates")
    .option("--themes <dark|light|both>", "Themes to render")
    .option("--copy", "Allow optional LLM copy (default: on when config.copy.llm is true)")
    .option("--out <dir>", "Output directory")
    .option("--strict", "Fit warnings exit with code 2")
    .option("--dry-run", "Collect facts and print them; render nothing")
    .option("--package <path>", "package.json path for monorepos")
    .option("--headline <text>", "Headline for the cards, overriding the changelog")
    .option("--subheadline <text>", "Subheadline for the cards")
    .option("--upload", "Upload PNG files to the GitHub release")
    .action(async (flags: Record<string, unknown>) => {
      const releaseFlags: ReleaseFlags = {
        cwd: stringFlag(flags.cwd, process.cwd()),
        strict: flags.strict === true,
        dryRun: flags.dryRun === true,
      };
      applySharedFlags(releaseFlags, flags);
      const tag = optionalString(flags.tag);
      if (tag !== undefined) {
        releaseFlags.tag = tag;
      }
      const headline = optionalString(flags.headline);
      if (headline !== undefined) {
        releaseFlags.headline = headline;
      }
      const subheadline = optionalString(flags.subheadline);
      if (subheadline !== undefined) {
        releaseFlags.subheadline = subheadline;
      }
      const from = optionalString(flags.from);
      if (from !== undefined) {
        releaseFlags.from = from;
      }
      const templates = optionalString(flags.templates);
      if (templates !== undefined) {
        releaseFlags.templates = templates;
      }
      const result = await runRelease(releaseFlags);
      process.exitCode = result.exitCode;
      writeCommandOutput(flags, result);
    });

  cli
    .command("milestone", "Generate a milestone card for the highest crossed threshold")
    .option("--metric <stars|downloads|contributors>", "Metric to check")
    .option("--threshold <n>", "Force a specific threshold")
    .option("--formats <list>", "Comma-separated formats")
    .option("--themes <dark|light|both>", "Themes to render")
    .option("--copy", "Allow optional LLM copy (default: on when config.copy.llm is true)")
    .option("--out <dir>", "Output directory")
    .option("--strict", "Fit warnings exit with code 2")
    .option("--dry-run", "Collect facts and print them; render nothing")
    .option("--package <path>", "package.json path for monorepos")
    .action(async (flags: Record<string, unknown>) => {
      const milestoneFlags: MilestoneFlags = {
        cwd: stringFlag(flags.cwd, process.cwd()),
        strict: flags.strict === true,
        dryRun: flags.dryRun === true,
      };
      applySharedFlags(milestoneFlags, flags);
      const metric = optionalString(flags.metric);
      if (metric !== undefined) {
        milestoneFlags.metric = metric;
      }
      const threshold = optionalString(flags.threshold);
      if (threshold !== undefined) {
        milestoneFlags.threshold = threshold;
      }
      const result = await runMilestone(milestoneFlags);
      process.exitCode = result.exitCode;
      if (flags.json === true) {
        writeJson(resultToJson(result));
        return;
      }
      if (flags.quiet === true) {
        return;
      }
      if (result.skipped) {
        process.stdout.write(`${result.message ?? "No milestone threshold crossed."}\n`);
        return;
      }
      writeHumanResult(result);
    });

  cli
    .command("bench", "Generate benchmark cards from bench JSON")
    .option("--file <path>", "Path to bench JSON")
    .option("--formats <list>", "Comma-separated formats")
    .option("--themes <dark|light|both>", "Themes to render")
    .option("--copy", "Allow optional LLM copy (default: on when config.copy.llm is true)")
    .option("--out <dir>", "Output directory")
    .option("--strict", "Fit warnings exit with code 2")
    .option("--dry-run", "Collect facts and print them; render nothing")
    .option("--package <path>", "package.json path for monorepos")
    .action(async (flags: Record<string, unknown>) => {
      const benchFlags: BenchFlags = {
        cwd: stringFlag(flags.cwd, process.cwd()),
        strict: flags.strict === true,
        dryRun: flags.dryRun === true,
      };
      applySharedFlags(benchFlags, flags);
      const file = optionalString(flags.file);
      if (file !== undefined) {
        benchFlags.file = file;
      }
      const result = await runBench(benchFlags);
      process.exitCode = result.exitCode;
      writeCommandOutput(flags, result);
    });

  cli.help();
  cli.version(readVersion());

  try {
    cli.parse(argv, { run: false });
    await cli.runMatchedCommand();
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  } catch (error) {
    if (error instanceof ShipsealError) {
      process.stderr.write(`${formatError(error)}\n`);
      return 1;
    }
    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

function stringFlag(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function applySharedFlags(target: { formats?: string; themes?: string; copy?: boolean; out?: string; package?: string; upload?: boolean }, flags: Record<string, unknown>): void {
  const formats = optionalString(flags.formats);
  if (formats !== undefined) {
    target.formats = formats;
  }
  const themes = optionalString(flags.themes);
  if (themes !== undefined) {
    target.themes = themes;
  }
  if (flags.copy === false) {
    target.copy = false;
  }
  const out = optionalString(flags.out);
  if (out !== undefined) {
    target.out = out;
  }
  const pkg = optionalString(flags.package);
  if (pkg !== undefined) {
    target.package = pkg;
  }
  if (flags.upload === true) {
    target.upload = true;
  }
}

function writeCommandOutput(
  flags: Record<string, unknown>,
  result: {
    dryRun: boolean;
    facts: unknown;
    dir?: string;
    manifest?: unknown;
    copyWarning?: string;
    warnings: Array<{ template: string; format: string; slot: string; action: string }>;
    skipped?: boolean;
    message?: string;
  },
): void {
  if (flags.json === true) {
    writeJson(resultToJson(result));
    return;
  }
  if (flags.quiet === true) {
    return;
  }
  writeHumanResult(result);
}

function resultToJson(result: {
  dryRun: boolean;
  facts: unknown;
  dir?: string;
  manifest?: unknown;
  skipped?: boolean;
  message?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (result.skipped === true) {
    payload.skipped = true;
  }
  if (result.message !== undefined) {
    payload.message = result.message;
  }
  if (result.dir !== undefined) {
    payload.dir = result.dir;
  }
  if (result.manifest !== undefined) {
    payload.manifest = result.manifest;
  } else {
    payload.facts = result.facts;
  }
  return payload;
}

function writeHumanResult(result: {
  dryRun: boolean;
  facts: unknown;
  dir?: string;
  copyWarning?: string;
  warnings: Array<{ template: string; format: string; slot: string; action: string }>;
  skipped?: boolean;
  message?: string;
}): void {
  if (result.skipped === true) {
    process.stdout.write(`${result.message ?? "Nothing to generate."}\n`);
    return;
  }
  if (result.dryRun) {
    process.stdout.write(`${JSON.stringify(result.facts, null, 2)}\n`);
    return;
  }
  if (result.dir !== undefined) {
    process.stdout.write(`Wrote ${result.dir}\n`);
  }
  if (result.copyWarning !== undefined) {
    process.stdout.write(`Copy: ${result.copyWarning}\n`);
  }
  for (const warning of result.warnings) {
    process.stdout.write(`Warning: ${warning.template} ${warning.format} ${warning.slot} ${warning.action}\n`);
  }
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function readVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(join(resolvePackageRoot(), "package.json"), "utf8"));
  if (typeof raw === "object" && raw !== null && "version" in raw && typeof raw.version === "string") {
    return raw.version;
  }
  return "0.0.0";
}

if (shouldRun(process.argv[1])) {
  void runCli().then((code) => {
    process.exit(code);
  });
}

function shouldRun(invoked: string | undefined): boolean {
  if (invoked === undefined) {
    return false;
  }
  const normalized = invoked.replaceAll("\\", "/");
  return (
    normalized.endsWith("/cli.js") ||
    normalized.endsWith("/cli.ts") ||
    normalized.endsWith("/shipseal")
  );
}
