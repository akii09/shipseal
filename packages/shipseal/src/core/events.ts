// ShipsealEvent types
// Spec: docs/PROJECT_PLAN.md §6.3

export type ShipsealEvent =
  | { kind: "release"; tag: string; previousTag?: string }
  | { kind: "milestone"; metric: "stars" | "downloads" | "contributors"; threshold: number }
  | { kind: "bench"; file: string };
