// Seal stamp: the verified-facts mark shared by every template
// Spec: docs/PROJECT_PLAN.md §14.3

import type { Facts } from "../../facts/schema.js";
import { formatCount } from "../../copy/deterministic.js";

export interface SealStamp {
  segments: string[];
  missing: { fact: string; effect: string }[];
}

/**
 * The core promise, made visible on the card.
 *
 * "sealed · 7 commits · 2026-09-11" turns "every number has a source" from a claim on the
 * website into a mark in the feed. Every segment is a fact, so rule 1 holds: a missing fact
 * drops its segment and is reported, it never becomes a placeholder or an estimate.
 */
export function sealStamp(facts: Facts): SealStamp {
  const segments = ["sealed"];
  const missing: SealStamp["missing"] = [];

  const commits = facts.release?.commitCount?.value;
  if (commits === undefined) {
    missing.push({ fact: "release.commitCount", effect: "seal stamp omits the commit count" });
  } else {
    segments.push(`${formatCount(commits)} ${commits === 1 ? "commit" : "commits"}`);
  }

  const date = facts.release?.date?.value;
  if (date === undefined) {
    missing.push({ fact: "release.date", effect: "seal stamp omits the date" });
  } else {
    segments.push(date);
  }

  return { segments, missing };
}
