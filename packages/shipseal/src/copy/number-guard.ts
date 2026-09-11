// Rule R1: reject any digits not from facts
// Spec: docs/PROJECT_PLAN.md §13.3

import type { Facts } from "../facts/schema.js";
import type { Copy } from "./slots.js";

export function allowedNumbers(facts: Facts): Set<string> {
  const allowed = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "number" && Number.isFinite(value)) {
      addNumber(allowed, value);
      return;
    }
    if (typeof value === "string") {
      for (const match of value.match(/\d+(?:\.\d+)*/g) ?? []) {
        allowed.add(match);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (typeof value === "object" && value !== null) {
      if ("value" in value && "provenance" in value) {
        visit(value.value);
        return;
      }
      for (const nested of Object.values(value)) {
        visit(nested);
      }
    }
  };
  visit(facts);
  return allowed;
}

export function unsourcedDigits(text: string, allowed: Set<string>): string[] {
  const found: string[] = [];
  const withoutGrouped = text.replace(/\d{1,3}(?:,\d{3})+/g, (match) => {
    const compact = match.replaceAll(",", "");
    if (!allowed.has(match) && !allowed.has(compact)) {
      found.push(match);
    }
    return " ";
  });
  for (const match of withoutGrouped.match(/\d+(?:\.\d+)*/g) ?? []) {
    if (!allowed.has(match)) {
      found.push(match);
    }
  }
  return found;
}

export function guardCopy(copy: Copy, facts: Facts): { ok: true } | { ok: false; slot: string; digits: string[] } {
  const allowed = allowedNumbers(facts);
  const slots: Array<[string, string]> = [
    ["headline", copy.headline],
    ["subheadline", copy.subheadline],
    ["cta", copy.cta],
  ];
  if (copy.milestoneLine !== undefined) {
    slots.push(["milestoneLine", copy.milestoneLine]);
  }
  copy.highlights.forEach((line, index) => {
    slots.push([`highlights[${String(index)}]`, line]);
  });
  for (const [slot, text] of slots) {
    const digits = unsourcedDigits(text, allowed);
    if (digits.length > 0) {
      return { ok: false, slot, digits };
    }
  }
  return { ok: true };
}

function addNumber(allowed: Set<string>, value: number): void {
  allowed.add(String(value));
  if (Number.isInteger(value)) {
    allowed.add(value.toLocaleString("en-US"));
  }
}
