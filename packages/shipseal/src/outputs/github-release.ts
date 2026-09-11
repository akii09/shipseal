// Upload assets to a GitHub release and write the Actions job summary
// Spec: docs/PROJECT_PLAN.md §19.4
// Docs checked 2026-09-11: `gh release upload <tag> <files>... --clobber`
//   gh is preinstalled on GitHub-hosted runners.

import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";
import { ShipsealError } from "../core/errors.js";
import type { Manifest } from "./manifest.js";

const execFileAsync = promisify(execFile);

export type GhExec = (
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

export async function uploadReleaseAssets(options: {
  tag: string;
  files: string[];
  repo?: string;
  token?: string;
  exec?: GhExec;
}): Promise<void> {
  if (options.files.length === 0) {
    return;
  }
  const exec = options.exec ?? execFileAsync;
  const args = ["release", "upload", options.tag, ...options.files, "--clobber"];
  if (options.repo !== undefined) {
    args.push("--repo", options.repo);
  }
  const env = { ...process.env };
  if (options.token !== undefined) {
    env.GH_TOKEN = options.token;
    env.GITHUB_TOKEN = options.token;
  }
  try {
    await exec("gh", args, { env });
  } catch (error) {
    throw new ShipsealError(
      "github.upload",
      `Could not upload assets to GitHub release ${options.tag}.`,
      "Confirm gh is installed, GITHUB_TOKEN can write contents, and the release exists.",
      { cause: error },
    );
  }
}

export async function appendJobSummary(path: string, manifest: Manifest, dir: string): Promise<void> {
  await appendFile(path, `${jobSummaryMarkdown(manifest, dir)}\n`, "utf8");
}

export function jobSummaryMarkdown(manifest: Manifest, dir: string): string {
  const lines = [
    "## Shipseal",
    "",
    `Generated **${String(manifest.files.length)}** files in \`${dir}\`.`,
    "",
  ];
  const repo = process.env.GITHUB_REPOSITORY;
  const tag = manifest.event.kind === "release" ? manifest.event.tag : undefined;
  if (repo !== undefined && tag !== undefined) {
    for (const file of manifest.files) {
      const url = `https://github.com/${repo}/releases/download/${tag}/${file.path}`;
      lines.push(`![${file.path}](${url})`, "");
    }
  } else {
    lines.push("| File | Template | Format |", "|---|---|---|");
    for (const file of manifest.files) {
      lines.push(`| ${file.path} | ${file.template} | ${file.format} |`);
    }
    lines.push("");
  }
  lines.push("### Facts", "");
  for (const [key, entry] of Object.entries(manifest.facts)) {
    lines.push(`- \`${key}\`: ${JSON.stringify(entry.value)} (${entry.source})`);
  }
  if (Object.keys(manifest.computed).length > 0) {
    lines.push("", "### Computed", "");
    for (const [key, entry] of Object.entries(manifest.computed)) {
      lines.push(`- \`${key}\`: ${JSON.stringify(entry.value)}`);
    }
  }
  if (manifest.warnings.length > 0) {
    lines.push("", "### Warnings", "");
    for (const warning of manifest.warnings) {
      lines.push(`- ${warning.template} ${warning.format} ${warning.slot}: ${warning.action}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
