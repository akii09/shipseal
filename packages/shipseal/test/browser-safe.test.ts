/**
 * The browser demo at /try imports part of this package directly and renders with the Takumi
 * WASM build. Anything it can reach therefore has to run without Node.
 *
 * This is not hypothetical. `src/render/takumi.ts` imported `node:fs` for its font lookup, Vite
 * externalized it, the module threw on load, and /try served a blank page with no error at all.
 * Lint, typecheck and 228 tests stayed green throughout, because nothing checked the one thing
 * that mattered: which files the browser can reach.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "../src");

/** What apps/docs/src/scripts/demo.ts pulls out of this package. */
const BROWSER_ENTRIES = [
  "studio/client.ts",
  "studio/pack.ts",
  "sources/public-repo.ts",
  "render/takumi.ts",
  "config/schema.ts",
  "copy/deterministic.ts",
  "core/errors.ts",
];

/** Matches `from "x"`, `import "x"` and `import("x")`. */
const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function specifiers(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(IMPORT_PATTERN)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

function sourceFor(specifier: string, fromFile: string): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ""));
  return [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((candidate) =>
    existsSync(candidate),
  );
}

/** Every file the browser can reach, following relative imports only. */
function reachable(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = entries.map((entry) => join(srcRoot, entry));
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const specifier of specifiers(file)) {
      const next = sourceFor(specifier, file);
      if (next !== undefined && !seen.has(next)) {
        queue.push(next);
      }
    }
  }
  return [...seen];
}

function allSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return allSources(full);
    }
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("browser reachable modules", () => {
  const files = reachable(BROWSER_ENTRIES);
  const names = files.map((file) => relative(srcRoot, file));

  it("walks the real graph, not just the entry files", () => {
    // A walk that silently resolved nothing would pass every assertion below.
    expect(files.length).toBeGreaterThan(BROWSER_ENTRIES.length);
    expect(names).toContain("core/generate.ts");
    expect(names).toContain("outputs/downloads.ts");
    expect(names).toContain("templates/story-page.tsx");
  });

  it("import no Node builtin, or /try serves a blank page", () => {
    const offenders = files.flatMap((file) =>
      specifiers(file)
        .filter((specifier) => specifier.startsWith("node:"))
        .map((specifier) => `${relative(srcRoot, file)} imports ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the Node-only renderer out of the browser graph", () => {
    expect(names).not.toContain("render/takumi-node.ts");
  });
});

describe("rule 3: only one file imports Takumi", () => {
  it("is src/render/takumi.ts and nothing else", () => {
    const importers = allSources(srcRoot)
      .filter((file) => specifiers(file).some((specifier) => specifier.startsWith("takumi-js")))
      .map((file) => relative(srcRoot, file));
    expect(importers).toEqual(["render/takumi.ts"]);
  });
});
