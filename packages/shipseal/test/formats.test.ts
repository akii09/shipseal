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

  it("every v1 format is reachable from at least one template", () => {
    expect(V1_FORMAT_IDS.filter((id) => !declared.has(id))).toEqual([]);
  });

  /**
   * shipseal.dev must never advertise a size no template can render. Until the story pack
   * landed, that meant nothing outside v1 was declared at all. `story-page` is now the single
   * exception, so the rule is narrower rather than gone: it is the only template allowed to
   * declare a non-v1 format, and the set it declares is pinned here.
   *
   * If another template declares one, or `story-page` gains a size, this fails and the wording
   * on the homepage, the templates page and PROJECT_PLAN §14.2 has to change with it.
   */
  it("only story-page declares a format outside v1", () => {
    const shipped = new Set<string>(V1_FORMAT_IDS);
    const extra = all
      .filter((template) => template.formats.some((id) => !shipped.has(id)))
      .map((template) => template.id);
    expect(extra).toEqual(["story-page"]);

    const storyPage = all.find((template) => template.id === "story-page");
    expect(storyPage?.formats.filter((id) => !shipped.has(id))).toEqual([
      "square",
      "portrait",
      "producthunt",
    ]);
  });

  /**
   * The README banner is still defined in the table and rendered by nothing, so the "not yet
   * rendered" claim on the site remains true for this one size only.
   */
  it("readme-banner is still unrendered", () => {
    expect(FORMAT_IDS).toContain("readme-banner");
    expect(declared.has("readme-banner")).toBe(false);
  });
});
