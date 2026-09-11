import { describe, expect, it } from "vitest";
import { FORMAT_IDS, FORMATS, V1_FORMAT_IDS } from "../src/formats.js";
import { templatesForEvent } from "../src/templates/registry.js";

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

describe("renderable formats", () => {
  const all = [
    ...templatesForEvent("release"),
    ...templatesForEvent("milestone"),
    ...templatesForEvent("bench"),
  ];
  const declared = new Set(all.flatMap((template) => template.formats));

  it("no template declares a format that is not shipped in v1", () => {
    const shipped = new Set<string>(V1_FORMAT_IDS);
    expect([...declared].filter((id) => !shipped.has(id))).toEqual([]);
  });

  it("every v1 format is reachable from at least one template", () => {
    expect(V1_FORMAT_IDS.filter((id) => !declared.has(id))).toEqual([]);
  });

  /**
   * shipseal.dev used to advertise these as available sizes. They are defined in the table but
   * no template can render them, so the claim was false. If a template ever declares one, this
   * fails and the docs wording needs to change with it.
   */
  it("square, portrait, producthunt and readme-banner are still unrendered", () => {
    const shipped = new Set<string>(V1_FORMAT_IDS);
    const defined = FORMAT_IDS.filter((id) => !shipped.has(id));
    expect(defined).toEqual(["square", "portrait", "producthunt", "readme-banner"]);
    expect(defined.filter((id) => declared.has(id))).toEqual([]);
  });
});
