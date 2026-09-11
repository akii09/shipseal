// CSS color parsing, oklch to sRGB hex, and contrast (no dependency)
// Spec: docs/PROJECT_PLAN.md §10.3 and §25 (S7 oklch converter)

const HEX = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;

export function parseCssColor(value: string): string | undefined {
  const trimmed = value.trim();
  const hex = normalizeHex(trimmed);
  if (hex !== undefined) {
    return hex;
  }
  const oklch = parseOklch(trimmed);
  if (oklch !== undefined) {
    return oklchToHex(oklch.l, oklch.c, oklch.h);
  }
  const rgb = parseRgb(trimmed);
  if (rgb !== undefined) {
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
  }
  const hsl = parseHsl(trimmed);
  if (hsl !== undefined) {
    return rgbToHex(...hslToRgb(hsl[0], hsl[1], hsl[2]));
  }
  return undefined;
}

export function normalizeHex(value: string): string | undefined {
  const match = HEX.exec(value.trim());
  if (match === null) {
    return undefined;
  }
  const raw = match[1];
  if (raw === undefined) {
    return undefined;
  }
  if (raw.length === 3) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
  }
  return `#${raw.slice(0, 6).toLowerCase()}`;
}

export function oklchToHex(l: number, c: number, h: number): string {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const coneL = l + 0.3963377774 * a + 0.2158037573 * b;
  const coneM = l - 0.1055613458 * a - 0.0638541728 * b;
  const coneS = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = coneL * coneL * coneL;
  const m3 = coneM * coneM * coneM;
  const s3 = coneS * coneS * coneS;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  return rgbToHex(srgbEncode(r) * 255, srgbEncode(g) * 255, srgbEncode(bLin) * 255);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export const LARGE_TEXT_CONTRAST = 3;

export function ensureForegroundContrast(
  background: string,
  foreground: string,
): { foreground: string; adjusted: boolean } {
  if (contrastRatio(background, foreground) >= LARGE_TEXT_CONTRAST) {
    return { foreground, adjusted: false };
  }
  const light = "#fafafa";
  const dark = "#0b0b0c";
  const lightRatio = contrastRatio(background, light);
  const darkRatio = contrastRatio(background, dark);
  return { foreground: lightRatio >= darkRatio ? light : dark, adjusted: true };
}

function srgbEncode(channel: number): number {
  const abs = Math.abs(channel);
  const encoded = abs <= 0.0031308 ? 12.92 * abs : 1.055 * abs ** (1 / 2.4) - 0.055;
  return Math.sign(channel) * encoded;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function toByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (rgb === undefined) {
    return 0;
  }
  const lin = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}

export function isNeutralHex(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (rgb === undefined) {
    return true;
  }
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const min = Math.min(rgb[0], rgb[1], rgb[2]);
  return max - min < 16;
}

function hexToRgb(hex: string): [number, number, number] | undefined {
  const normalized = normalizeHex(hex);
  if (normalized === undefined) {
    return undefined;
  }
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return [r, g, b];
}

function parseOklch(value: string): { l: number; c: number; h: number } | undefined {
  const match = /^oklch\(\s*([^/)]+?)(?:\s*\/\s*[^)]+)?\s*\)$/i.exec(value);
  if (match === null) {
    return undefined;
  }
  const body = match[1];
  if (body === undefined) {
    return undefined;
  }
  const parts = splitCssArgs(body);
  if (parts.length < 3) {
    return undefined;
  }
  const l = parseLightness(parts[0] ?? "");
  const c = parseNumber(parts[1] ?? "");
  const h = parseHue(parts[2] ?? "");
  if (l === undefined || c === undefined || h === undefined) {
    return undefined;
  }
  return { l, c, h };
}

function parseRgb(value: string): [number, number, number] | undefined {
  const match = /^rgba?\(\s*([^/)]+?)(?:\s*\/\s*[^)]+)?\s*\)$/i.exec(value);
  if (match === null) {
    return undefined;
  }
  const parts = splitCssArgs(match[1] ?? "");
  if (parts.length < 3) {
    return undefined;
  }
  const r = parseRgbChannel(parts[0] ?? "");
  const g = parseRgbChannel(parts[1] ?? "");
  const b = parseRgbChannel(parts[2] ?? "");
  if (r === undefined || g === undefined || b === undefined) {
    return undefined;
  }
  return [r, g, b];
}

function parseHsl(value: string): [number, number, number] | undefined {
  const match = /^hsla?\(\s*([^/)]+?)(?:\s*\/\s*[^)]+)?\s*\)$/i.exec(value);
  if (match === null) {
    return undefined;
  }
  const parts = splitCssArgs(match[1] ?? "");
  if (parts.length < 3) {
    return undefined;
  }
  const h = parseHue(parts[0] ?? "");
  const s = parsePercent(parts[1] ?? "");
  const l = parsePercent(parts[2] ?? "");
  if (h === undefined || s === undefined || l === undefined) {
    return undefined;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = light - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function splitCssArgs(body: string): string[] {
  return body
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseLightness(token: string): number | undefined {
  if (token.endsWith("%")) {
    const n = Number.parseFloat(token.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : undefined;
  }
  return parseNumber(token);
}

function parseHue(token: string): number | undefined {
  if (token === "none") {
    return 0;
  }
  if (token.endsWith("deg")) {
    return parseNumber(token.slice(0, -3));
  }
  if (token.endsWith("rad")) {
    const n = parseNumber(token.slice(0, -3));
    return n === undefined ? undefined : (n * 180) / Math.PI;
  }
  if (token.endsWith("turn")) {
    const n = parseNumber(token.slice(0, -4));
    return n === undefined ? undefined : n * 360;
  }
  if (token.endsWith("grad")) {
    const n = parseNumber(token.slice(0, -4));
    return n === undefined ? undefined : n * 0.9;
  }
  return parseNumber(token);
}

function parsePercent(token: string): number | undefined {
  if (!token.endsWith("%")) {
    return parseNumber(token);
  }
  return parseNumber(token.slice(0, -1));
}

function parseRgbChannel(token: string): number | undefined {
  if (token.endsWith("%")) {
    const n = parseNumber(token.slice(0, -1));
    return n === undefined ? undefined : (n / 100) * 255;
  }
  return parseNumber(token);
}

function parseNumber(token: string): number | undefined {
  if (token === "none") {
    return 0;
  }
  const n = Number.parseFloat(token);
  return Number.isFinite(n) ? n : undefined;
}
