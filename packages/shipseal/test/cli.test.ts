import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
import { runStory } from "../src/commands/story.js";
import { runCli } from "../src/cli.js";

describe("init and doctor", () => {
  it("writes brand.json, config.json, and a sample PNG", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-init-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo-app", description: "Demo application used in init tests" }),
    );
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "assets", "logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" fill="#ff4d4d"></svg>`);
    await writeFile(
      join(dir, "styles.css"),
      `@theme { --color-primary: #112233; --color-background: #000000; --color-foreground: #ffffff; }`,
    );

    const result = await runInit({ cwd: dir, yes: true, force: false });
    const brandRaw = await readFile(result.brandPath, "utf8");
    const brand: unknown = JSON.parse(brandRaw);
    expect(brand).toMatchObject({ name: "demo-app", version: 1 });
    const png = await readFile(result.samplePath);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);

    const doctor = await runDoctor(dir);
    const byName = Object.fromEntries(doctor.checks.map((check) => [check.name, check]));
    expect(byName.node?.status).toBe("pass");
    expect(byName.fonts?.status).toBe("pass");
    expect(byName.takumi?.status).toBe("pass");
    expect(byName["brand.json"]?.status).toBe("pass");
    expect(byName.logo?.status).toBe("pass");
  });
});

describe("cli", () => {
  it("prints help and errors when release has no brand.json", async () => {
    const help = await runCli(["node", "shipseal", "--help"]);
    expect(help).toBe(0);
    const code = await runCli(["node", "shipseal", "release", "--cwd", await emptyDir()]);
    expect(code).toBe(1);
  });

  it("skips milestone when no threshold is crossed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-ms-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo-app", description: "Demo application used in milestone tests" }),
    );
    await runInit({ cwd: dir, yes: true, force: false });
    const code = await runCli(["node", "shipseal", "milestone", "--cwd", dir, "--quiet", "--dry-run"]);
    expect(code).toBe(0);
  });
});

describe("story and preview", () => {
  it("reports a missing tag rather than rendering an empty story", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-story-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo-app", description: "Demo application used in story tests" }),
    );
    await runInit({ cwd: dir, yes: true, force: false });
    // No git tag and no --tag: the command has nothing to build a story from.
    expect(await runCli(["node", "shipseal", "story", "--cwd", dir, "--quiet"])).toBe(1);
  });

  it("errors before binding a port when --port is out of range", async () => {
    const dir = await emptyDir();
    const codes = await Promise.all(
      ["70000", "-1", "abc", "80.5"].map((port) =>
        runCli(["node", "shipseal", "preview", "--cwd", dir, "--port", port]),
      ),
    );
    expect(codes).toEqual([1, 1, 1, 1]);
  });

  it("reports a bad --format or --style as a typed error, not a zod dump", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shipseal-story-opts-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "demo-app", description: "Demo application used in story tests" }),
    );
    await runInit({ cwd: dir, yes: true, force: false });

    await expect(
      runStory({ cwd: dir, tag: "v1.0.0", format: "readme-banner" }),
    ).rejects.toMatchObject({
      code: "story.bad-options",
      message: expect.stringContaining("format"),
      fix: expect.stringContaining("--format portrait"),
    });
    await expect(runStory({ cwd: dir, tag: "v1.0.0", style: "neon" })).rejects.toMatchObject({
      code: "story.bad-options",
      message: expect.stringContaining("style"),
    });
  });

  it("errors when preview has no brand.json", async () => {
    expect(
      await runCli(["node", "shipseal", "preview", "--cwd", await emptyDir(), "--tag", "v1.0.0"]),
    ).toBe(1);
  });
});

async function emptyDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "shipseal-cli-"));
}
