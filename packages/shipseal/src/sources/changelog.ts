// Keep a Changelog + Changesets parsing
// Spec: docs/PROJECT_PLAN.md §12.4

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fact } from "../facts/fact.js";
import type { Fact } from "../facts/schema.js";
import type { PartialFacts } from "../facts/partial.js";
import { extractFirstCodeFence } from "./readme.js";

export async function collectChangelog(
  cwd: string,
  version: string | undefined,
  changelogPath = "CHANGELOG.md",
): Promise<PartialFacts> {
  if (version === undefined) {
    return {};
  }
  let markdown: string;
  try {
    markdown = await readFile(join(cwd, changelogPath), "utf8");
  } catch {
    return {};
  }
  const section = findVersionSection(markdown, version);
  if (section === undefined) {
    return {};
  }
  const fetchedAt = new Date().toISOString();
  const features: Fact<string>[] = [];
  const fixes: Fact<string>[] = [];
  const breaking: Fact<string>[] = [];

  for (const group of parseGroups(section.body)) {
    const bucket = bucketForHeading(group.heading);
    if (bucket === undefined) {
      continue;
    }
    for (const item of group.items) {
      const cleaned = cleanChangelogItem(item);
      if (cleaned.length === 0) {
        continue;
      }
      const entry = fact(cleaned, {
        source: "changelog",
        ref: `${changelogPath} ${section.heading} ${group.heading}: ${item}`,
        fetchedAt,
      });
      if (bucket === "features") {
        features.push(entry);
      } else if (bucket === "fixes") {
        fixes.push(entry);
      } else {
        breaking.push(entry);
      }
    }
  }

  const out: PartialFacts = {
    release: {
      version: fact(version.replace(/^v/, ""), {
        source: "changelog",
        ref: `${changelogPath} ${section.heading}`,
        fetchedAt,
      }),
      tag: fact(version.startsWith("v") ? version : `v${version}`, {
        source: "changelog",
        ref: `${changelogPath} ${section.heading}`,
        fetchedAt,
      }),
      features,
      fixes,
      breaking,
    },
  };
  // A snippet from the release notes is about this release. The README's first fence is
  // usually the install command, which says nothing about what changed. Sits above the README
  // in the merge order and below an explicit `release.snippet`.
  const snippet = extractFirstCodeFence(section.body);
  if (snippet !== undefined) {
    out.release = {
      ...out.release,
      codeSnippet: fact(snippet, {
        source: "changelog",
        ref: `${changelogPath} ${section.heading} first fenced code block`,
        fetchedAt,
      }),
    };
  }
  if (section.date !== undefined) {
    out.release = {
      ...out.release,
      date: fact(section.date, {
        source: "changelog",
        ref: `${changelogPath} ${section.heading}`,
        fetchedAt,
      }),
    };
  }
  return out;
}

export function findVersionSection(
  markdown: string,
  version: string,
): { heading: string; body: string; date?: string } | undefined {
  const needle = version.replace(/^v/, "");
  const headingRe = /^##\s+(.+)$/gm;
  const matches = [...markdown.matchAll(headingRe)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match === undefined) {
      continue;
    }
    const heading = match[1];
    if (heading === undefined || !headingIncludesVersion(heading, needle)) {
      continue;
    }
    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? markdown.length;
    const date = extractDate(heading);
    const body = markdown.slice(start, end);
    if (date === undefined) {
      return { heading, body };
    }
    return { heading, body, date };
  }
  return undefined;
}

export function cleanChangelogItem(item: string): string {
  return item
    .replace(/^\s*[-*]\s*/, "")
    .replace(/\[`[a-f0-9]{7,40}`]\([^)]+\)/gi, "")
    .replace(/^[a-f0-9]{7,40}:\s*/i, "")
    .replace(/\(#\d+\)/g, "")
    .replace(/\[#\d+]\([^)]+\)/g, "")
    .replace(/Thanks\s+\[@[\w-]+]\([^)]+\)!?\s*-?\s*/gi, "")
    .replace(/\[@[\w-]+]\([^)]+\)/g, "")
    .replace(/\(@[\w-]+\)/g, "")
    .replace(/\s+by\s+@[\w-]+/gi, "")
    .replace(/@[\w-]+/g, "")
    .replace(/^Thanks\s*!?\s*-?\s*/i, "")
    .replace(/^\s*[-*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");
}

function headingIncludesVersion(heading: string, version: string): boolean {
  const unwrapped = heading.replace(/[[\]]/g, " ");
  return new RegExp(`(?:^|\\s)v?${escapeRegExp(version)}(?:\\s|$)`).test(unwrapped);
}

function extractDate(heading: string): string | undefined {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(heading);
  return match?.[1];
}

function parseGroups(body: string): Array<{ heading: string; items: string[] }> {
  const groups: Array<{ heading: string; items: string[] }> = [];
  const headingRe = /^###\s+(.+)$/gm;
  const matches = [...body.matchAll(headingRe)];
  if (matches.length === 0) {
    return [{ heading: "Added", items: listItems(body) }];
  }
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match === undefined) {
      continue;
    }
    const heading = match[1];
    if (heading === undefined) {
      continue;
    }
    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? body.length;
    groups.push({ heading, items: listItems(body.slice(start, end)) });
  }
  return groups;
}

function listItems(block: string): string[] {
  const items: string[] = [];
  let current: string | undefined;
  for (const raw of block.split("\n")) {
    const trimmed = raw.trim();
    // Only an unindented bullet starts a new entry. A nested bullet belongs to the entry
    // above it: Changesets writes sub-lists inside one entry, and treating those as separate
    // highlights put a sentence fragment on a card with no context.
    const indented = /^\s+/.test(raw);
    if (!indented && (trimmed.startsWith("- ") || trimmed.startsWith("* "))) {
      if (current !== undefined) {
        items.push(current);
      }
      current = trimmed;
      continue;
    }
    if (current !== undefined && trimmed.length > 0 && !trimmed.startsWith("#")) {
      current = `${current} ${trimmed}`;
    }
  }
  if (current !== undefined) {
    items.push(current);
  }
  return items;
}

function bucketForHeading(heading: string): "features" | "fixes" | "breaking" | undefined {
  const key = heading.trim().toLowerCase();
  if (
    key === "added" ||
    key === "changed" ||
    key === "minor changes" ||
    key === "features"
  ) {
    return "features";
  }
  if (key === "fixed" || key === "patch changes" || key === "security" || key === "fixes") {
    return "fixes";
  }
  if (
    key === "removed" ||
    key === "major changes" ||
    key === "breaking" ||
    key === "breaking changes"
  ) {
    return "breaking";
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
