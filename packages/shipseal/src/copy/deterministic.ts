// No-LLM copy rules (default path)
// Spec: docs/PROJECT_PLAN.md §13.2

import type { Facts } from "../facts/schema.js";
import { MAX_HIGHLIGHTS, type Copy } from "./slots.js";

export function deterministicCopy(facts: Facts, maxHighlights = MAX_HIGHLIGHTS): Copy {
  const name = facts.project.name.value;
  const version = facts.release?.version.value;
  const features = (facts.release?.features ?? []).map((item) => item.value);
  const fixes = (facts.release?.fixes ?? []).map((item) => item.value);
  const breaking = (facts.release?.breaking ?? []).map((item) => item.value);

  const headlineSource = features[0];
  const headline =
    headlineSource !== undefined
      ? cleanLine(headlineSource)
      : version === undefined
        ? name
        : `${name} ${version}`;

  const tagline = facts.project.tagline?.value;
  const subheadline =
    tagline !== undefined && tagline.length > 0
      ? cleanLine(tagline)
      : cleanLine(features[1] ?? fixes[0] ?? `What's new in ${version ?? name}`);

  const highlights: string[] = [];
  for (const line of features) {
    if (highlights.length >= maxHighlights) {
      break;
    }
    highlights.push(cleanLine(line));
  }
  for (const line of fixes) {
    if (highlights.length >= maxHighlights) {
      break;
    }
    highlights.push(cleanLine(line));
  }
  for (const line of breaking) {
    if (highlights.length >= maxHighlights) {
      break;
    }
    highlights.push(`Breaking: ${cleanLine(line)}`);
  }

  return {
    headline,
    subheadline,
    highlights,
    cta: ctaFor(facts),
  };
}

export function cleanLine(text: string): string {
  const stripped = text.replaceAll("\u2014", ":").replaceAll("\u2013", "-").replaceAll("!", ".").trim();
  const noTrail = stripped.endsWith(".") ? stripped.slice(0, -1) : stripped;
  const first = noTrail.at(0);
  if (first === undefined) {
    return noTrail;
  }
  return first.toUpperCase() + noTrail.slice(1);
}

function ctaFor(facts: Facts): string {
  const npm = facts.project.npmPackage?.value;
  if (npm !== undefined && npm.length > 0) {
    return `npm i ${npm}`;
  }
  const url = facts.project.url?.value ?? facts.project.repo?.value;
  if (url === undefined) {
    return facts.project.name.value;
  }
  return url.replace(/^https?:\/\//, "");
}
