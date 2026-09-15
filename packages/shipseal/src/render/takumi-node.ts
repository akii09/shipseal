// The Node half of the renderer: finding the vendored font on disk and loading it.
// Spec: docs/PROJECT_PLAN.md §16
//
// This file exists so that `takumi.ts` holds no `node:` import. The browser demo imports the
// renderer through `takumi.ts`, and a single top-level `node:fs` there is enough for Vite to
// externalize the module, throw on load, and leave the page blank with no error shown.
//
// Rule 3 still holds: `takumi.ts` remains the only file that imports Takumi. This one imports
// `takumi.ts`, never `takumi-js`.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ShipsealError } from "../core/errors.js";
import type { RendererAdapter } from "./adapter.js";
import { FONT_REL, createRendererWithFont } from "./takumi.js";

let shared: Promise<RendererAdapter> | undefined;

export function getTakumiRenderer(): Promise<RendererAdapter> {
  shared ??= createTakumiRenderer();
  return shared;
}

export async function createTakumiRenderer(): Promise<RendererAdapter> {
  const fontPath = join(resolvePackageRoot(), FONT_REL);
  const data = await readFile(fontPath);
  return createRendererWithFont(data);
}

export function resolvePackageRoot(from = import.meta.url): string {
  let dir = dirname(fileURLToPath(from));
  for (;;) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, FONT_REL))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new ShipsealError(
        "render.font-missing",
        `Could not find vendored font ${FONT_REL}.`,
        "Reinstall shipseal so assets/fonts/GeistMono[wght].ttf is present next to package.json.",
      );
    }
    dir = parent;
  }
}
