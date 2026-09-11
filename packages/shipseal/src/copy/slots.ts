// Copy slots filled by the copy layer
// Spec: docs/PROJECT_PLAN.md §13.1

export const COPY_LIMITS = {
  headline: 48,
  subheadline: 90,
  highlight: 56,
  cta: 32,
  milestoneLine: 48,
} as const;

export const MAX_HIGHLIGHTS = 4;

export interface Copy {
  headline: string;
  subheadline: string;
  highlights: string[];
  cta: string;
  milestoneLine?: string;
  codeLines?: CodeLine[];
}

export type CodeLine = Array<{ text: string; color: string }>;
