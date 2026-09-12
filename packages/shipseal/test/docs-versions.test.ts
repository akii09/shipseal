/**
 * Every version the docs site shows must be either current or deliberately pinned.
 *
 * The site accumulated `v0.0.6` in six places while the package moved on, because each was
 * hand-written and nothing checked them. Some of those were real captures that must not be
 * bumped (bumping the tag without re-running the CLI would invent the numbers beside it), and
 * some were simply stale. The difference has to be recorded in the source, not remembered.
 *
 * The rule: a version string in `apps/docs/src` matches the released version, or it sits in a
 * region wrapped in `shipseal:pinned start` and `shipseal:pinned end` saying why it does not.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const docsRoot = join(repoRoot, "apps/docs/src");
const version = (
  JSON.parse(readFileSync(join(repoRoot, "packages/shipseal/package.json"), "utf8")) as {
    version: string;
  }
).version;

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
function withoutIpv4(line: string): string {
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
    const stale: string[] = [];
    for (const file of sourceFiles(docsRoot)) {
      const lines = readFileSync(file, "utf8").split("\n");
      const exempt = pinnedLines(lines);
      lines.forEach((line, index) => {
        if (exempt.has(index)) {
          return;
        }
        for (const [match] of withoutIpv4(line).matchAll(/\bv?\d+\.\d+\.\d+\b/g)) {
          if (match.replace(/^v/, "") !== version) {
            stale.push(`${relative(repoRoot, file)}:${String(index + 1)}  ${match}`);
          }
        }
      });
    }
    expect(stale, `not the released version (${version}), and not in a shipseal:pinned region`).toEqual(
      [],
    );
  });

  it("skips an IP address but still catches a stale version on the same line", () => {
    expect(withoutIpv4("Serves on 127.0.0.1 only")).not.toMatch(/\d+\.\d+\.\d+/);
    expect(withoutIpv4("127.0.0.1 and v0.0.6")).toContain("v0.0.6");
  });
});
