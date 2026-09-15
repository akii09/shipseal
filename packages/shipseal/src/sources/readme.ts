// README source: title, tagline, first fenced code block
// Spec: docs/PROJECT_PLAN.md §12.3

import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fact } from "../facts/fact.js";
import type { PartialFacts, PartialProject } from "../facts/partial.js";
import { stripEmoji } from "../copy/deterministic.js";

export async function collectReadme(cwd: string): Promise<PartialFacts> {
  let markdown: string;
  try {
    markdown = await readFile(join(cwd, "README.md"), "utf8");
  } catch {
    return {};
  }
  const fetchedAt = new Date().toISOString();
  const out: PartialFacts = {};
  const h1 = extractH1(markdown);
  const tagline = extractTagline(markdown);
  const snippet = extractFirstCodeFence(markdown);

  const project: PartialProject = {};
  if (h1 !== undefined) {
    project.name = fact(h1, { source: "readme", ref: "README.md H1", fetchedAt });
  }
  if (tagline !== undefined) {
    project.tagline = fact(stripEmoji(tagline), {
      source: "readme",
      ref: "README.md first paragraph",
      fetchedAt,
    });
  }
  if (project.name !== undefined || project.tagline !== undefined) {
    out.project = project;
  }
  if (snippet !== undefined) {
    out.release = {
      codeSnippet: fact(snippet, {
        source: "readme",
        ref: "README.md first fenced code block",
        fetchedAt,
      }),
    };
  }
  return out;
}

export async function collectConfiguredSnippet(
  cwd: string,
  spec: string,
): Promise<PartialFacts> {
  const parsed = parseSnippetSpec(spec);
  if (parsed === undefined) {
    return {};
  }
  let contents: string;
  try {
    contents = await readFile(join(cwd, parsed.path), "utf8");
  } catch {
    return {};
  }
  const lines = contents.split(/\r?\n/);
  const slice = lines.slice(parsed.start - 1, parsed.end).join("\n");
  const fetchedAt = new Date().toISOString();
  return {
    release: {
      codeSnippet: fact(
        { code: slice, lang: langFromPath(parsed.path) },
        { source: "user-config", ref: spec, fetchedAt },
      ),
    },
  };
}

/**
 * Strip fenced code and HTML before reading prose out of a README.
 *
 * Skipping blocks that merely *start* with a fence is not enough. A `#` comment inside a YAML
 * example reads as a markdown H1, and a blank line inside a fence makes its body look like a
 * paragraph. Shipseal's own README hit both: the detected name became
 * ".github/workflows/shipseal.yml" and the tagline became a chunk of workflow YAML.
 */
function stripNonProse(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/<[^>]+>/g, "");
}

export function extractH1(markdown: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(stripNonProse(markdown));
  const heading = match?.[1];
  if (heading === undefined) {
    return undefined;
  }
  return heading.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
}

export function extractTagline(markdown: string): string | undefined {
  const prose = stripNonProse(markdown);
  const h1 = /^#\s+.+$/m.exec(prose);
  const start = h1 === null ? 0 : (h1.index ?? 0) + h1[0].length;
  for (const block of prose.slice(start).split(/\n\s*\n/)) {
    const cleaned = stripBadges(block).trim();
    if (cleaned.length >= 20 && !cleaned.startsWith("#") && !cleaned.startsWith("```")) {
      return cleaned;
    }
  }
  return undefined;
}

export function extractFirstCodeFence(markdown: string): { code: string; lang: string } | undefined {
  const match = /```([a-zA-Z0-9+-]+)\n([\s\S]*?)```/.exec(markdown);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return undefined;
  }
  return { lang: match[1], code: match[2].replace(/\n$/, "") };
}

function parseSnippetSpec(spec: string): { path: string; start: number; end: number } | undefined {
  const match = /^(?<path>.+)#L(?<start>\d+)(?:-L(?<end>\d+))?$/.exec(spec);
  if (match === null || match.groups === undefined) {
    return undefined;
  }
  const path = match.groups.path;
  const start = Number.parseInt(match.groups.start ?? "0", 10);
  const end = Number.parseInt(match.groups.end ?? match.groups.start ?? "0", 10);
  if (path === undefined || start < 1 || end < start) {
    return undefined;
  }
  return { path, start, end };
}

function langFromPath(path: string): string {
  const ext = extname(path).replace(".", "");
  if (ext === "ts") {
    return "ts";
  }
  if (ext === "tsx") {
    return "tsx";
  }
  if (ext === "js" || ext === "mjs" || ext === "cjs") {
    return "js";
  }
  if (ext === "jsx") {
    return "jsx";
  }
  return ext.length > 0 ? ext : "text";
}

function stripBadges(text: string): string {
  return text
    .replace(/\[!\[[^\]]*]\([^)]+\)]\([^)]+\)/g, "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
