import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";

async function project(name: string, tagline: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "shipseal-init-"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ name, description: tagline }), "utf8");
  await writeFile(join(dir, "README.md"), `# ${name}\n\n${tagline}\n`, "utf8");
  return dir;
}

describe("init sample card", () => {
  // Regression from real user feedback: the sample was a hard-coded card reading "Shipseal"
  // and Shipseal's own tagline, no matter whose project it ran in. It looked like the tool
  // had ignored the repository it was pointed at.
  it("renders the detected brand, not a fixed card", async () => {
    const a = await runInit({ cwd: await project("alpha", "The first test project here"), yes: true, force: false });
    const b = await runInit({ cwd: await project("beta", "A second and different project"), yes: true, force: false });

    expect(a.detection.brand.name).toBe("alpha");
    expect(b.detection.brand.name).toBe("beta");

    const [pngA, pngB] = await Promise.all([readFile(a.samplePath), readFile(b.samplePath)]);
    // Two different brands must not produce the same image.
    expect(pngA.equals(pngB)).toBe(false);
    expect(pngA.length).toBeGreaterThan(1000);
  });
});
