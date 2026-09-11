// fact() helper that attaches provenance
// Spec: docs/PROJECT_PLAN.md §9.1

import type { Fact, SourceId } from "./schema.js";

export function fact<T>(
  value: T,
  provenance: { source: SourceId; ref: string; fetchedAt?: string },
): Fact<T> {
  const fetchedAt = provenance.fetchedAt ?? new Date().toISOString();
  return {
    value,
    provenance: {
      source: provenance.source,
      ref: provenance.ref,
      fetchedAt,
    },
  };
}
