// Template registry
// Spec: docs/PROJECT_PLAN.md §14.3

import { ShipsealError } from "../core/errors.js";
import type { TemplateDefinition } from "./contract.js";
import { bench } from "./bench.js";
import { codeCard } from "./code-card.js";
import { milestone } from "./milestone.js";
import { releaseHero } from "./release-hero.js";
import { releaseHighlights } from "./release-highlights.js";
import { storyPage } from "./story-page.js";

const templates = [releaseHero, releaseHighlights, codeCard, milestone, bench, storyPage] as const;

export function getTemplate(id: string): TemplateDefinition {
  const found = templates.find((template) => template.id === id);
  if (found === undefined) {
    throw new ShipsealError(
      "template.unknown",
      `Unknown template "${id}".`,
      `Use one of: ${templates.map((template) => template.id).join(", ")}.`,
    );
  }
  return found;
}

export function templatesForEvent(kind: "release" | "milestone" | "bench"): TemplateDefinition[] {
  return templates.filter((template) => template.events.includes(kind));
}

export const RELEASE_TEMPLATE_IDS = ["release-hero", "release-highlights", "code-card"] as const;
