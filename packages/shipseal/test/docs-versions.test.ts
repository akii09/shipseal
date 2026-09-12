/**
 * Every version the docs site shows must be either current or deliberately pinned.
 *
 * The site accumulated `v0.0.6` in six places while the package moved on, because each was
 * hand-written and nothing checked them. Some of those were real captures that must not be
 * bumped (bumping the tag without re-running the CLI would invent the numbers beside it), and
 * some were simply stale. The difference has to be recorded in the source, not remembered.
 *
 * The rule: a version string in `apps/docs/src` names either the version that is released or
 * the version being prepared, or it sits in a region wrapped in `shipseal:pinned start` and
 * `shipseal:pinned end` saying why it does not.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const docsRoot = join(repoRoot, "apps/docs/src");
const packageVersion = (
  JSON.parse(readFileSync(join(repoRoot, "packages/shipseal/package.json"), "utf8")) as {
    version: string;
  }
).version;

function releaseTags(): string[] {
  try {
    return execFileSync("git", ["tag", "--list", "v*", "--sort=-v:refname"], {
      cwd: repoRoot,
      stdio: "pipe",
    })
      .toString()
      .split("\n")
      .map((tag) => tag.trim())
      .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
  } catch {
    return [];
  }
}

/**
 * Two versions are legitimate at once, and which one the docs name depends on where in the
 * release you are:
 *
 * - `package.json` holds the version being prepared. Between `pnpm release` rewriting the docs
 *   and the tag being created, the docs name a version with no tag yet.
 * - The newest tag is the version that is actually out. On the Changesets version pull request
 *   `package.json` has already moved on, but nothing has rewritten the docs and nothing should
 *   have: `refresh-showcase.mjs` runs during `pnpm release`, after that pull request merges.
 *
 * Accepting only `package.json` fails every version pull request, which blocks the merge that
 * the release needs. `scripts/check-action-ref.mjs` makes the same allowance for the same
 * reason, from the other side: it accepts the pending tag that does not resolve yet.
 *
 * Anything else is stale, which is the drift this test exists to catch.
 */
export function acceptableVersions(input: { packageVersion: string; tags: string[] }): string[] {
  const released = input.tags
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
    .map((tag) => tag.replace(/^v/, ""));
  const latestReleased = released[0];
  return latestReleased === undefined
    ? [input.packageVersion]
    : [...new Set([input.packageVersion, latestReleased])];
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(astro|ts|tsx|md)$/.test(entry) ? [full] : [];
  });
}

/**
 * An IPv4 literal is four dotted numbers, so `127.0.0.1` contains `127.0.0` and reads as a
 * version to the scanner below. The CLI docs name the preview host, so exclude the address
 * itself rather than reword around it.
 */
export function withoutIpv4(line: string): string {
  return line.replaceAll(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, " ");
}

/** Lines inside a `shipseal:pinned` region, which are archival and exempt. */
function pinnedLines(lines: string[]): Set<number> {
  const pinned = new Set<number>();
  let depth = 0;
  lines.forEach((line, index) => {
    if (line.includes("shipseal:pinned start")) {
      depth += 1;
    }
    if (depth > 0) {
      pinned.add(index);
    }
    if (line.includes("shipseal:pinned end")) {
      depth = Math.max(0, depth - 1);
    }
  });
  return pinned;
}

describe("versions shown on the docs site", () => {
  it("are current, or pinned with a reason", () => {
    const tags = releaseTags();
    const accepted = acceptableVersions({ packageVersion, tags });
    const stale: string[] = [];
    for (const file of sourceFiles(docsRoot)) {
      const lines = readFileSync(file, "utf8").split("\n");
      const exempt = pinnedLines(lines);
      lines.forEach((line, index) => {
        if (exempt.has(index)) {
          return;
        }
        for (const [match] of withoutIpv4(line).matchAll(/\bv?\d+\.\d+\.\d+\b/g)) {
          if (!accepted.includes(match.replace(/^v/, ""))) {
            stale.push(`${relative(repoRoot, file)}:${String(index + 1)}  ${match}`);
          }
        }
      });
    }
    const where = tags.length === 0 ? "no tags in this checkout" : `newest tag ${tags[0] ?? ""}`;
    expect(
      stale,
      `not ${accepted.join(" or ")} (${where}), and not in a shipseal:pinned region`,
    ).toEqual([]);
  });

  it("accepts the released version while a bump is pending, and still rejects older ones", () => {
    // The version pull request: package.json has moved on, the docs still name the release.
    const pending = acceptableVersions({ packageVersion: "0.1.0", tags: ["v0.0.8", "v0.0.7"] });
    expect(pending).toContain("0.1.0");
    expect(pending).toContain("0.0.8");
    expect(pending).not.toContain("0.0.7");

    // Settled on main: one acceptable version, so real drift is still caught.
    expect(acceptableVersions({ packageVersion: "0.1.0", tags: ["v0.1.0", "v0.0.8"] })).toEqual([
      "0.1.0",
    ]);

    // A shallow checkout has no tags, so fall back to package.json alone.
    expect(acceptableVersions({ packageVersion: "0.1.0", tags: [] })).toEqual(["0.1.0"]);
  });

  it("reads the newest tag by version order, not by tag listing order", () => {
    expect(
      acceptableVersions({ packageVersion: "0.2.0", tags: ["v0.10.0", "v0.9.0"] }),
    ).toContain("0.10.0");
  });

  it("skips an IP address but still catches a stale version on the same line", () => {
    expect(withoutIpv4("Serves on 127.0.0.1 only")).not.toMatch(/\d+\.\d+\.\d+/);
    expect(withoutIpv4("127.0.0.1 and v0.0.6")).toContain("v0.0.6");
  });
});
