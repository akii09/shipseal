// git source: tags, commits, contributors
// Spec: docs/PROJECT_PLAN.md §12.1

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fact } from "../facts/fact.js";
import type { Fact } from "../facts/schema.js";
import type { PartialFacts } from "../facts/partial.js";
import { cleanChangelogItem } from "./changelog.js";

const execFileAsync = promisify(execFile);

export async function collectGit(
  cwd: string,
  event: { tag?: string; previousTag?: string },
): Promise<PartialFacts> {
  const inside = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") {
    return {};
  }
  const fetchedAt = new Date().toISOString();
  const tag = event.tag ?? (await gitCurrentTag(cwd));
  if (tag === undefined) {
    return {};
  }
  const exists = await git(cwd, ["rev-parse", "--verify", `${tag}^{commit}`]);
  if (exists === undefined) {
    return {};
  }
  const version = versionFromTag(tag);
  const tags = await gitLines(cwd, ["tag", "--sort=-v:refname"]);
  const tagIndex = tags.indexOf(tag);
  const previousTag =
    event.previousTag ?? (tagIndex >= 0 ? tags[tagIndex + 1] : tags.find((candidate) => candidate !== tag));
  const range = previousTag === undefined ? tag : `${previousTag}..${tag}`;
  const log = await git(cwd, ["log", range, "--pretty=format:%s\t%an\t%ae\t%h\t%cI"]);
  const commits = (log ?? "").split("\n").filter((line) => line.length > 0);
  const features: Fact<string>[] = [];
  const fixes: Fact<string>[] = [];
  const breaking: Fact<string>[] = [];
  const contributors = new Map<string, string>();

  for (const line of commits) {
    const [subject, author, email, hash] = line.split("\t");
    if (subject === undefined || hash === undefined) {
      continue;
    }
    const parsed = parseConventional(subject);
    const display = parsed.display;
    const ref = `git log ${range} ${hash}`;
    const item = fact(display, { source: "git", ref, fetchedAt });
    if (parsed.breaking) {
      breaking.push(item);
    } else if (parsed.type === "feat") {
      features.push(item);
    } else if (parsed.type === "fix" || parsed.type === "perf") {
      fixes.push(item);
    }
    if (email !== undefined && author !== undefined && !isBot(author, email)) {
      contributors.set(email, author);
    }
  }

  const dateLine = await git(cwd, ["log", "-1", "--format=%cI", tag]);
  const date = (dateLine ?? fetchedAt).slice(0, 10);
  const names = [...contributors.values()];

  const release: NonNullable<PartialFacts["release"]> = {
    version: fact(version, { source: "git", ref: `git tag ${tag}`, fetchedAt }),
    tag: fact(tag, { source: "git", ref: `git tag ${tag}`, fetchedAt }),
    date: fact(date, { source: "git", ref: `git log -1 --format=%cI ${tag}`, fetchedAt }),
    features,
    fixes,
    breaking,
    commitCount: fact(commits.length, {
      source: "git",
      ref: `git rev-list --count ${range}`,
      fetchedAt,
    }),
  };
  if (previousTag !== undefined) {
    release.previousVersion = fact(versionFromTag(previousTag), {
      source: "git",
      ref: `git tag ${previousTag}`,
      fetchedAt,
    });
  }
  if (names.length > 0) {
    release.contributors = fact(names, {
      source: "git",
      ref: `git log ${range} unique authors`,
      fetchedAt,
    });
  }
  return { release };
}

export function parseConventional(subject: string): {
  type: string | undefined;
  display: string;
  breaking: boolean;
} {
  const match = /^(?<type>\w+)(?<scope>\([^)]+\))?(?<bang>!)?:\s*(?<rest>.+)$/.exec(subject);
  if (match === null || match.groups === undefined) {
    return { type: undefined, display: displaySubject(subject), breaking: false };
  }
  const type = match.groups.type;
  const rest = match.groups.rest ?? subject;
  const breaking = match.groups.bang === "!" || /BREAKING CHANGE:/.test(subject);
  return { type, display: displaySubject(rest), breaking };
}

export function versionFromTag(tag: string): string {
  const at = tag.lastIndexOf("@");
  if (at >= 0 && at < tag.length - 1) {
    return tag.slice(at + 1).replace(/^v/, "");
  }
  return tag.replace(/^v/, "");
}

export async function gitCurrentTag(cwd: string): Promise<string | undefined> {
  return git(cwd, ["describe", "--tags", "--abbrev=0"]);
}

async function git(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    const trimmed = stdout.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  } catch {
    return undefined;
  }
}

async function gitLines(cwd: string, args: string[]): Promise<string[]> {
  const out = await git(cwd, args);
  return out === undefined ? [] : out.split("\n").filter((line) => line.length > 0);
}

function isBot(author: string, email: string): boolean {
  const haystack = `${author} ${email}`.toLowerCase();
  return (
    author.endsWith("[bot]") ||
    haystack.includes("dependabot") ||
    haystack.includes("renovate") ||
    haystack.includes("github-actions")
  );
}

function displaySubject(text: string): string {
  const cleaned = cleanChangelogItem(text);
  const first = cleaned.at(0);
  if (first === undefined) {
    return cleaned;
  }
  return first.toUpperCase() + cleaned.slice(1);
}
