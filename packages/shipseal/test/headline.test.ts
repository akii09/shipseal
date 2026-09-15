/**
 * Every rejection below is a real headline Shipseal rendered onto a card when fourteen public
 * repositories were run through it on 2026-09-15.
 */
import { describe, expect, it } from "vitest";
import { isHeadlineWorthy } from "../src/copy/headline.js";

describe("isHeadlineWorthy", () => {
  it("rejects a contributor's name", () => {
    // novuhq/novu rendered a card headlined "Adam Chmara".
    expect(isHeadlineWorthy("Adam Chmara")).toBe(false);
    expect(isHeadlineWorthy("Jane Q. Smith")).toBe(false);
  });

  it("rejects package fragments from monorepo release bodies", () => {
    for (const line of ["/api", "Ui", "/solid-query.0.0-rc.3", "@refinedev/core", "v1.2.3"]) {
      expect({ line, ok: isHeadlineWorthy(line) }).toEqual({ line, ok: false });
    }
  });

  it("rejects housekeeping entries", () => {
    for (const line of [
      "Chore: update the depot logo",
      "docs: fix a typo in the readme",
      "bump eslint from 9.1.0 to 9.2.0",
    ]) {
      expect({ line, ok: isHeadlineWorthy(line) }).toEqual({ line, ok: false });
    }
  });

  it("rejects a line that is mostly a link", () => {
    expect(isHeadlineWorthy("Update the logo in https://github.com/acme/demo")).toBe(false);
  });

  it("keeps real descriptions of a change", () => {
    for (const line of [
      "GET routes automatically answer HEAD requests",
      "Fixed sql.identifier, sql.as escaping issue",
      "Minimum supported Zod version is now 3.25",
      "Add option to render custom thumbnails",
      "Drop Node 18 and require Node 20",
    ]) {
      expect({ line, ok: isHeadlineWorthy(line) }).toEqual({ line, ok: true });
    }
  });
});
