/**
 * The homepage shows the folder a release pack produces. It used to be hand-written, and had
 * drifted into fiction: six entries under names like `og.png` that the CLI never writes, in a
 * `v2.0.0` directory that never existed, on a site whose claim is that nothing is invented.
 *
 * `scripts/refresh-showcase.mjs` now generates that block from a real pack at release time.
 * This test is the guard between releases: it derives the same list from the template registry
 * and fails if the published tree stops matching what the code would actually write.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORMATS } from "../src/formats.js";
import { RELEASE_TEMPLATE_IDS, getTemplate } from "../src/templates/registry.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const homepage = join(repoRoot, "apps/docs/src/pages/index.astro");

interface Row {
  name: string;
  size: string;
}

function publishedRows(source: string): Row[] {
  const start = source.indexOf("{/* shipseal:tree start");
  const end = source.indexOf("{/* shipseal:tree end */}");
  expect(start, "index.astro is missing the shipseal:tree markers").toBeGreaterThan(-1);
  expect(end, "index.astro is missing the shipseal:tree markers").toBeGreaterThan(start);

  return source
    .slice(start, end)
    .split("\n")
    .filter((line) => line.startsWith("├── ") || line.startsWith("└── "))
    .map((line) => {
      const [, name, size = ""] = /^[├└]── (\S+)\s*(\d+x\d+)?/.exec(line) ?? [];
      return { name: name ?? "", size };
    });
}

function expectedRows(): Row[] {
  const files = RELEASE_TEMPLATE_IDS.flatMap((id) => {
    const template = getTemplate(id);
    return template.formats.map((format) => ({
      name: `${id}-${format}.png`,
      size: `${String(FORMATS[format].width)}x${String(FORMATS[format].height)}`,
    }));
  });
  return [...files, { name: "manifest.json", size: "" }];
}

describe("the homepage output tree", () => {
  const source = readFileSync(homepage, "utf8");

  it("lists exactly the files a release pack writes, with their real sizes", () => {
    expect(publishedRows(source)).toEqual(expectedRows());
  });

  it("the heading counts the images the tree actually shows", () => {
    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    const images = expectedRows().filter((row) => row.name.endsWith(".png")).length;
    const heading = /<h2>One command, one folder, (\w+) images<\/h2>/.exec(source)?.[1];
    expect(heading, "the 'one folder, N images' heading changed shape").toBeDefined();
    expect(heading).toBe(words[images]);
  });
});
