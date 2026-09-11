// Percent change for benchmark cards. Display numbers are computed here, never by an LLM.
// Spec: docs/PROJECT_PLAN.md §12.7

export interface PercentChange {
  signed: number;
  absPercent: number;
  regression: boolean;
}

export function percentChange(before: number, after: number, better: "lower" | "higher"): PercentChange {
  if (before === 0) {
    if (after === 0) {
      return { signed: 0, absPercent: 0, regression: false };
    }
    const improved = better === "higher" ? after > 0 : after < 0;
    return { signed: improved ? 100 : -100, absPercent: 100, regression: !improved };
  }
  const raw = better === "lower" ? (before - after) / before : (after - before) / before;
  const signed = Math.round(raw * 100);
  return { signed, absPercent: Math.abs(signed), regression: signed < 0 };
}

export function changePhrase(unit: string, better: "lower" | "higher", change: PercentChange): string {
  if (change.absPercent === 0) {
    return "unchanged";
  }
  return `${String(change.absPercent)}% ${deltaWord(unit, better, change.regression)}`;
}

function deltaWord(unit: string, better: "lower" | "higher", regression: boolean): string {
  if (better === "higher") {
    return regression ? "lower" : "higher";
  }
  const normalized = unit.toLowerCase();
  if (normalized === "ms" || normalized === "s" || normalized === "sec" || normalized === "seconds") {
    return regression ? "slower" : "faster";
  }
  if (
    normalized === "kb" ||
    normalized === "mb" ||
    normalized === "b" ||
    normalized === "bytes" ||
    normalized === "gzip"
  ) {
    return regression ? "larger" : "smaller";
  }
  return regression ? "worse" : "better";
}
