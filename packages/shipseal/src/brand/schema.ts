// brand.json zod schema
// Spec: docs/PROJECT_PLAN.md §10.2

import { z } from "zod";

export const hexColorSchema = z
  .string()
  .regex(/^#([\da-f]{6})$/i, "Expected a 6-digit hex color like #0b0b0c");

export const fontFaceSchema = z.object({
  family: z.string().min(1),
  weight: z.number().int().min(100).max(900),
  file: z.string().min(1).optional(),
});

export const brandSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  name: z.string().min(1),
  tagline: z.string().optional(),
  url: z.string().optional(),
  logo: z
    .object({
      light: z.string().min(1),
      dark: z.string().min(1).optional(),
    })
    .optional(),
  colors: z.object({
    background: hexColorSchema,
    foreground: hexColorSchema,
    muted: hexColorSchema.optional(),
    primary: hexColorSchema.optional(),
    accent: hexColorSchema.optional(),
  }),
  fonts: z.object({
    heading: fontFaceSchema,
    body: fontFaceSchema,
    mono: fontFaceSchema,
  }),
  radius: z.number().nonnegative(),
  theme: z.enum(["dark", "light"]),
  style: z.literal("minimal"),
  tokens: z.string().nullable(),
});

export type Brand = z.infer<typeof brandSchema>;

export const DEFAULT_BRAND_COLORS = {
  background: "#0b0b0c",
  foreground: "#fafafa",
  muted: "#a1a1aa",
  primary: "#ff4d4d",
  accent: "#fbbf24",
} as const;

export const DEFAULT_BRAND_FONTS = {
  heading: { family: "Geist", weight: 700 },
  body: { family: "Geist", weight: 400 },
  mono: { family: "Geist Mono", weight: 400 },
} as const;
