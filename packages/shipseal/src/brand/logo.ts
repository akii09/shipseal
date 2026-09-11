// Logo discovery
// Spec: docs/PROJECT_PLAN.md §10.3

import { existsSync } from "node:fs";
import { join } from "node:path";

const DIRECTORIES = ["", "assets", "assets/brand", "public", "public/brand", ".github", "docs", "static", "branding"];
const ICON_NAMES = ["icon.svg", "icon.png"];
const NAMES = ["logo.svg", "logo.png", "logo-light.svg", "logo-light.png"];
const FALLBACKS = [...ICON_NAMES, "favicon.svg"];

export function findLogo(cwd: string): string | undefined {
  for (const dir of DIRECTORIES) {
    for (const name of NAMES) {
      const relative = dir === "" ? name : join(dir, name);
      if (existsSync(join(cwd, relative))) {
        return relative;
      }
    }
  }
  for (const dir of DIRECTORIES) {
    for (const name of FALLBACKS) {
      const relative = dir === "" ? name : join(dir, name);
      if (existsSync(join(cwd, relative))) {
        return relative;
      }
    }
  }
  return undefined;
}

export function findLogoPair(cwd: string): { light: string; dark?: string } | undefined {
  const light = findLogo(cwd);
  if (light === undefined) {
    return undefined;
  }
  const darkNames = ["logo-dark.svg", "logo-dark.png"];
  for (const dir of DIRECTORIES) {
    for (const name of darkNames) {
      const relative = dir === "" ? name : join(dir, name);
      if (existsSync(join(cwd, relative))) {
        return { light, dark: relative };
      }
    }
  }
  return { light };
}
