import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
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
  it("prints help and a not-implemented error for release", async () => {
    const help = await runCli(["node", "shipseal", "--help"]);
    expect(help).toBe(0);
    const code = await runCli(["node", "shipseal", "release"]);
    expect(code).toBe(1);
  });
});
