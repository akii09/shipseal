// Build manifest.json with facts, computed values, warnings
// Spec: docs/PROJECT_PLAN.md §17.2

import type { Brand } from "../brand/schema.js";
import type { ShipsealEvent } from "../core/events.js";
import type { Facts } from "../facts/schema.js";
import type { GenerateResult } from "../core/generate.js";

export interface ManifestFile {
  path: string;
  template: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  shipseal: string;
  event: ShipsealEvent;
  generatedAt: string;
  brand: { name: string; theme: Brand["theme"]; source: string };
  copy: { mode: "deterministic" | "llm" };
  files: ManifestFile[];
  facts: Record<string, { value: unknown; source: string; ref: string; fetchedAt: string }>;
  computed: Record<string, { value: unknown; computedFrom: string[] }>;
  warnings: GenerateResult["warnings"];
  missing: GenerateResult["missing"];
}

export function buildManifest(input: {
  result: GenerateResult;
  event: ShipsealEvent;
  brand: Brand;
  shipsealVersion: string;
}): Manifest {
  return {
    shipseal: input.shipsealVersion,
    event: input.event,
    generatedAt: input.result.generatedAt,
    brand: {
      name: input.brand.name,
      theme: input.brand.theme,
      source: ".shipseal/brand.json",
    },
    copy: { mode: input.result.copyMode },
    files: input.result.files.map((file) => ({
      path: file.fileName,
      template: file.template,
      format: file.format,
      width: file.width,
      height: file.height,
      bytes: file.bytes.byteLength,
      sha256: file.sha256,
    })),
    facts: flattenFacts(input.result.facts),
    computed: {},
    warnings: input.result.warnings,
    missing: input.result.missing,
  };
}

export function flattenFacts(
  facts: Facts,
): Record<string, { value: unknown; source: string; ref: string; fetchedAt: string }> {
  const out: Record<string, { value: unknown; source: string; ref: string; fetchedAt: string }> = {};
  const walk = (prefix: string, value: unknown): void => {
    if (isFact(value)) {
      out[prefix] = {
        value: value.value,
        source: value.provenance.source,
        ref: value.provenance.ref,
        fetchedAt: value.provenance.fetchedAt,
      };
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        walk(`${prefix}[${String(index)}]`, item);
      });
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, nested] of Object.entries(value)) {
        walk(prefix.length === 0 ? key : `${prefix}.${key}`, nested);
      }
    }
  };
  walk("project", facts.project);
  if (facts.release !== undefined) {
    walk("release", facts.release);
  }
  if (facts.metrics !== undefined) {
    walk("metrics", facts.metrics);
  }
  if (facts.bench !== undefined) {
    walk("bench", facts.bench);
  }
  return out;
}

function isFact(
  value: unknown,
): value is { value: unknown; provenance: { source: string; ref: string; fetchedAt: string } } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("value" in value) || !("provenance" in value)) {
    return false;
  }
  const provenance = value.provenance;
  return (
    typeof provenance === "object" &&
    provenance !== null &&
    "source" in provenance &&
    "ref" in provenance &&
    "fetchedAt" in provenance
  );
}
