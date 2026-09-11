// Single table of platform sizes
// Spec: docs/PROJECT_PLAN.md §14.2

export const FORMAT_IDS = [
  "og",
  "github-social",
  "x",
  "linkedin",
  "square",
  "portrait",
  "producthunt",
  "readme-banner",
] as const;

export type FormatId = (typeof FORMAT_IDS)[number];

export interface Format {
  id: FormatId;
  width: number;
  height: number;
  /** Minimum inset for critical text on landscape formats, in px. */
  safeZone: number;
}

const LANDSCAPE_SAFE_ZONE = 64;

export const FORMATS: Record<FormatId, Format> = {
  og: { id: "og", width: 1200, height: 630, safeZone: LANDSCAPE_SAFE_ZONE },
  "github-social": {
    id: "github-social",
    width: 1280,
    height: 640,
    safeZone: LANDSCAPE_SAFE_ZONE,
  },
  x: { id: "x", width: 1200, height: 675, safeZone: LANDSCAPE_SAFE_ZONE },
  linkedin: { id: "linkedin", width: 1200, height: 627, safeZone: LANDSCAPE_SAFE_ZONE },
  square: { id: "square", width: 1080, height: 1080, safeZone: LANDSCAPE_SAFE_ZONE },
  portrait: { id: "portrait", width: 1080, height: 1350, safeZone: LANDSCAPE_SAFE_ZONE },
  producthunt: {
    id: "producthunt",
    width: 1270,
    height: 760,
    safeZone: LANDSCAPE_SAFE_ZONE,
  },
  "readme-banner": {
    id: "readme-banner",
    width: 1280,
    height: 400,
    safeZone: LANDSCAPE_SAFE_ZONE,
  },
};

export const V1_FORMAT_IDS = ["og", "github-social", "x", "linkedin"] as const satisfies readonly FormatId[];
