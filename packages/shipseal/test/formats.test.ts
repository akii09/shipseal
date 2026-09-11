import { describe, expect, it } from "vitest";
import { FORMAT_IDS, FORMATS, V1_FORMAT_IDS } from "../src/formats.js";

describe("formats", () => {
  it("has the eight sizes from §14.2", () => {
    expect(FORMAT_IDS).toEqual([
      "og",
      "github-social",
      "x",
      "linkedin",
      "square",
      "portrait",
      "producthunt",
      "readme-banner",
    ]);
    expect(FORMATS.og).toEqual({ id: "og", width: 1200, height: 630, safeZone: 64 });
    expect(FORMATS["github-social"]).toMatchObject({ width: 1280, height: 640 });
    expect(FORMATS.x).toMatchObject({ width: 1200, height: 675 });
    expect(FORMATS.linkedin).toMatchObject({ width: 1200, height: 627 });
    expect(FORMATS.square).toMatchObject({ width: 1080, height: 1080 });
    expect(FORMATS.portrait).toMatchObject({ width: 1080, height: 1350 });
    expect(FORMATS.producthunt).toMatchObject({ width: 1270, height: 760 });
    expect(FORMATS["readme-banner"]).toMatchObject({ width: 1280, height: 400 });
    expect(V1_FORMAT_IDS).toEqual(["og", "github-social", "x", "linkedin"]);
  });
});
