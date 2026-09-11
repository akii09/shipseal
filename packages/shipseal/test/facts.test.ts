import { describe, expect, it } from "vitest";
import { fact } from "../src/facts/fact.js";
import { factsSchema } from "../src/facts/schema.js";

const fetchedAt = "2026-09-11T10:00:00.000Z";

describe("fact()", () => {
  it("attaches provenance on every fact", () => {
    const name = fact("shipseal", {
      source: "package-json",
      ref: "package.json#name",
      fetchedAt,
    });
    expect(name).toEqual({
      value: "shipseal",
      provenance: {
        source: "package-json",
        ref: "package.json#name",
        fetchedAt,
      },
    });

    const stars = fact(1042, {
      source: "github-api",
      ref: "GET /repos/akii09/shipseal stargazers_count",
      fetchedAt,
    });
    expect(stars.provenance.source).toBe("github-api");
    expect(stars.value).toBe(1042);
  });

  it("fills fetchedAt when the caller omits it", () => {
    const f = fact("2.0.0", { source: "git", ref: "git tag v2.0.0" });
    expect(f.provenance.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("factsSchema", () => {
  it("accepts a valid Facts object", () => {
    const parsed = factsSchema.parse({
      project: {
        name: fact("shipseal", { source: "package-json", ref: "package.json#name", fetchedAt }),
      },
      metrics: {
        stars: fact(10, { source: "github-api", ref: "stargazers_count", fetchedAt }),
      },
    });
    expect(parsed.project.name.value).toBe("shipseal");
    expect(parsed.metrics?.stars?.provenance.source).toBe("github-api");
  });

  it("rejects a number with no provenance", () => {
    const result = factsSchema.safeParse({
      project: { name: { value: "shipseal" } },
    });
    expect(result.success).toBe(false);
  });
});
