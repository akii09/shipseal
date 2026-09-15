// doctor: environment and config checks
// Spec: docs/PROJECT_PLAN.md §18.5

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { brandSchema } from "../brand/schema.js";
import { FORMATS } from "../formats.js";
import { createTakumiRenderer, resolvePackageRoot } from "../render/takumi-node.js";
import { testCardNode } from "../render/takumi.js";

const execFileAsync = promisify(execFile);
const MIN_NODE_MAJOR = 22;

export type CheckStatus = "pass" | "fail" | "info";

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  message: string;
  fix?: string;
}

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

export async function runDoctor(cwd: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  checks.push(checkNode());
  checks.push(await checkGit(cwd));
  checks.push(await checkShallow(cwd));
  checks.push(await checkBrand(cwd));
  checks.push(await checkFont());
  checks.push(await checkLogo(cwd));
  checks.push(checkGithubToken());
  checks.push(await checkRender());

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks,
  };
}

function checkNode(): DoctorCheck {
  const version = process.versions.node;
  const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
  if (major >= MIN_NODE_MAJOR) {
    return { name: "node", status: "pass", message: `Node.js ${version}` };
  }
  return {
    name: "node",
    status: "fail",
    message: `Node.js ${version} is below the minimum of ${MIN_NODE_MAJOR}.`,
    fix: `Install Node.js ${MIN_NODE_MAJOR} or newer.`,
  };
}

async function checkGit(cwd: string): Promise<DoctorCheck> {
  try {
    const { stdout } = await execFileAsync("git", ["--version"], { cwd });
    return { name: "git", status: "pass", message: stdout.trim() };
  } catch {
    return {
      name: "git",
      status: "fail",
      message: "git is not available on PATH.",
      fix: "Install git and ensure it is on PATH.",
    };
  }
}

async function checkShallow(cwd: string): Promise<DoctorCheck> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--is-shallow-repository"], {
      cwd,
    });
    if (stdout.trim() === "true") {
      return {
        name: "clone-depth",
        status: "fail",
        message: "This git clone is shallow, so release facts will be incomplete.",
        fix: "Re-clone with a full history, or in GitHub Actions set fetch-depth: 0.",
      };
    }
    return { name: "clone-depth", status: "pass", message: "Full git history is available." };
  } catch {
    return {
      name: "clone-depth",
      status: "info",
      message: "Could not determine whether the clone is shallow.",
    };
  }
}

async function checkBrand(cwd: string): Promise<DoctorCheck> {
  const path = join(cwd, ".shipseal", "brand.json");
  if (!existsSync(path)) {
    return {
      name: "brand.json",
      status: "fail",
      message: ".shipseal/brand.json is missing.",
      fix: "Run shipseal init to detect a brand kit.",
    };
  }
  try {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    const parsed = brandSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        name: "brand.json",
        status: "fail",
        message: "brand.json did not match the v1 schema.",
        fix: parsed.error.issues.map((issue) => issue.message).join("; "),
      };
    }
    return { name: "brand.json", status: "pass", message: `Brand ${parsed.data.name} is valid.` };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        name: "brand.json",
        status: "fail",
        message: "brand.json is not valid JSON.",
        fix: "Fix the JSON syntax, or re-run shipseal init --force.",
      };
    }
    throw error;
  }
}

async function checkFont(): Promise<DoctorCheck> {
  try {
    const root = resolvePackageRoot();
    const fontPath = join(root, "assets", "fonts", "GeistMono[wght].ttf");
    if (!existsSync(fontPath)) {
      return {
        name: "fonts",
        status: "fail",
        message: "Vendored Geist Mono file is missing.",
        fix: "Reinstall shipseal so assets/fonts/GeistMono[wght].ttf is present.",
      };
    }
    return { name: "fonts", status: "pass", message: `Geist Mono found at ${fontPath}` };
  } catch {
    return {
      name: "fonts",
      status: "fail",
      message: "Could not resolve the vendored Geist Mono font.",
      fix: "Reinstall shipseal so assets/fonts/GeistMono[wght].ttf is present.",
    };
  }
}

async function checkLogo(cwd: string): Promise<DoctorCheck> {
  const path = join(cwd, ".shipseal", "brand.json");
  if (!existsSync(path)) {
    return {
      name: "logo",
      status: "info",
      message: "Skipped; brand.json is missing.",
    };
  }
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  const parsed = brandSchema.safeParse(raw);
  if (!parsed.success || parsed.data.logo === undefined) {
    return { name: "logo", status: "info", message: "No logo path in brand.json." };
  }
  const light = join(cwd, parsed.data.logo.light);
  if (!existsSync(light)) {
    return {
      name: "logo",
      status: "fail",
      message: `Logo file ${parsed.data.logo.light} is not readable.`,
      fix: "Point brand.json logo.light at an existing SVG or PNG, or re-run init.",
    };
  }
  return { name: "logo", status: "pass", message: `Logo readable at ${parsed.data.logo.light}` };
}

function checkGithubToken(): DoctorCheck {
  if (process.env.GITHUB_TOKEN !== undefined && process.env.GITHUB_TOKEN.length > 0) {
    return { name: "GITHUB_TOKEN", status: "info", message: "GITHUB_TOKEN is set." };
  }
  return {
    name: "GITHUB_TOKEN",
    status: "info",
    message: "GITHUB_TOKEN is not set. Unauthenticated GitHub API calls have a low rate limit.",
  };
}

async function checkRender(): Promise<DoctorCheck> {
  try {
    const renderer = await createTakumiRenderer();
    const png = await renderer.render(testCardNode(), {
      width: FORMATS.og.width,
      height: FORMATS.og.height,
      format: "png",
    });
    if (png.length < 8 || png[0] !== 0x89 || png[1] !== 0x50) {
      return {
        name: "takumi",
        status: "fail",
        message: "Takumi rendered bytes that are not a PNG.",
        fix: "File an issue with the doctor output and your OS/arch.",
      };
    }
    return {
      name: "takumi",
      status: "pass",
      message: `Rendered a ${FORMATS.og.width}x${FORMATS.og.height} test card (${png.length} bytes).`,
    };
  } catch (error) {
    return {
      name: "takumi",
      status: "fail",
      message: error instanceof Error ? error.message : "Takumi failed to render a test card.",
      fix: "Check that the native Takumi binary installed for this platform.",
    };
  }
}
