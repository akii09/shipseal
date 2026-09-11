#!/usr/bin/env node
// CLI entry: parse args, dispatch to commands/*
// Spec: docs/PROJECT_PLAN.md §18

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cac } from "cac";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { ShipsealError, formatError } from "./core/errors.js";
import { resolvePackageRoot } from "./render/takumi.js";

export async function runCli(argv = process.argv): Promise<number> {
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
      }
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

  cli.command("release", "Generate the release pack").action(() => {
    throw notImplemented("release");
  });
  cli.command("milestone", "Generate a milestone card").action(() => {
    throw notImplemented("milestone");
  });
  cli.command("bench", "Generate benchmark cards").action(() => {
    throw notImplemented("bench");
  });

  cli.help();
  cli.version(readVersion());

  try {
    cli.parse(argv, { run: false });
    await cli.runMatchedCommand();
    return process.exitCode === 1 ? 1 : 0;
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

function notImplemented(command: string): ShipsealError {
  return new ShipsealError(
    "cli.not-implemented",
    `shipseal ${command} is not implemented yet.`,
    "This command lands in a later phase. Use shipseal init and shipseal doctor for now.",
  );
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
