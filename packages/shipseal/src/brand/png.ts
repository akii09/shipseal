// Minimal PNG reader for brand color detection.
// Spec: docs/PROJECT_PLAN.md §10.3 (logo color detection)
//
// Logos are the only PNGs this reads, so it covers what logo exporters emit: 8 and 16 bit
// depths, color types 0, 2, 3, 4 and 6, no interlacing. Anything else returns undefined and
// the caller reports the color as not found rather than guessing. Decoding is done here
// instead of with a library because `pngjs` would be a runtime dependency for one small job.

import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Channels per pixel for each PNG color type. Index is the color type. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export interface DecodedPng {
  width: number;
  height: number;
  /** Row-major RGBA, four bytes per pixel. */
  pixels: Uint8Array;
}

export function decodePng(buffer: Buffer): DecodedPng | undefined {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    return undefined;
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | undefined;
  let paletteAlpha: Buffer | undefined;
  const idat: Buffer[] = [];

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) {
      return undefined;
    }

    if (type === "IHDR") {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      bitDepth = buffer[start + 8] ?? 0;
      colorType = buffer[start + 9] ?? 0;
      interlace = buffer[start + 12] ?? 0;
    } else if (type === "PLTE") {
      palette = buffer.subarray(start, end);
    } else if (type === "tRNS") {
      paletteAlpha = buffer.subarray(start, end);
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(start, end));
    } else if (type === "IEND") {
      break;
    }

    offset = end + 4; // skip the CRC
  }

  const channels = CHANNELS[colorType];
  if (
    width === 0 ||
    height === 0 ||
    channels === undefined ||
    interlace !== 0 ||
    (bitDepth !== 8 && bitDepth !== 16) ||
    idat.length === 0 ||
    (colorType === 3 && palette === undefined)
  ) {
    return undefined;
  }

  // Guard against a malformed header claiming an enormous image.
  if (width * height > 64_000_000) {
    return undefined;
  }

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return undefined;
  }

  const bytesPerSample = bitDepth / 8;
  const bpp = channels * bytesPerSample;
  const stride = width * bpp;
  if (raw.length < height * (stride + 1)) {
    return undefined;
  }

  const unfiltered = unfilter(raw, height, stride, bpp);
  if (unfiltered === undefined) {
    return undefined;
  }

  return { width, height, pixels: toRgba(unfiltered, width, height, colorType, bytesPerSample, palette, paletteAlpha) };
}

/** Reverse the per-scanline filters defined in the PNG spec. */
function unfilter(raw: Buffer, height: number, stride: number, bpp: number): Buffer | undefined {
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos];
    pos += 1;
    if (filter === undefined || filter > 4) {
      return undefined;
    }
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[pos + x] ?? 0;
      const a = x >= bpp ? (out[rowStart + x - bpp] ?? 0) : 0;
      const b = y > 0 ? (out[prevStart + x] ?? 0) : 0;
      const c = x >= bpp && y > 0 ? (out[prevStart + x - bpp] ?? 0) : 0;
      let restored: number;
      switch (filter) {
        case 1: {
          restored = value + a;
          break;
        }
        case 2: {
          restored = value + b;
          break;
        }
        case 3: {
          restored = value + Math.floor((a + b) / 2);
          break;
        }
        case 4: {
          restored = value + paeth(a, b, c);
          break;
        }
        default: {
          restored = value;
        }
      }
      out[rowStart + x] = restored & 0xff;
    }
    pos += stride;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
}

function toRgba(
  data: Buffer,
  width: number,
  height: number,
  colorType: number,
  bytesPerSample: number,
  palette: Buffer | undefined,
  paletteAlpha: Buffer | undefined,
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  const channels = CHANNELS[colorType] ?? 4;
  const bpp = channels * bytesPerSample;

  for (let i = 0; i < width * height; i++) {
    // For 16 bit samples the high byte is a close enough approximation for color picking.
    const at = (channel: number): number => data[i * bpp + channel * bytesPerSample] ?? 0;
    const out = i * 4;
    switch (colorType) {
      case 0: {
        const g = at(0);
        pixels[out] = g;
        pixels[out + 1] = g;
        pixels[out + 2] = g;
        pixels[out + 3] = 255;
        break;
      }
      case 2: {
        pixels[out] = at(0);
        pixels[out + 1] = at(1);
        pixels[out + 2] = at(2);
        pixels[out + 3] = 255;
        break;
      }
      case 3: {
        const index = at(0);
        pixels[out] = palette?.[index * 3] ?? 0;
        pixels[out + 1] = palette?.[index * 3 + 1] ?? 0;
        pixels[out + 2] = palette?.[index * 3 + 2] ?? 0;
        pixels[out + 3] = paletteAlpha?.[index] ?? 255;
        break;
      }
      case 4: {
        const g = at(0);
        pixels[out] = g;
        pixels[out + 1] = g;
        pixels[out + 2] = g;
        pixels[out + 3] = at(1);
        break;
      }
      default: {
        pixels[out] = at(0);
        pixels[out + 1] = at(1);
        pixels[out + 2] = at(2);
        pixels[out + 3] = at(3);
      }
    }
  }
  return pixels;
}

/**
 * Most common non-neutral color in a logo, as a hex string.
 *
 * Nearly transparent pixels are ignored so a transparent background does not win, and greys
 * are ignored because a logo's black wordmark is not its brand color. Colors are bucketed
 * into 16 levels per channel so anti-aliased edges group with the solid fill they belong to,
 * then the winning bucket reports the average of the real pixels inside it rather than the
 * bucket centre, which would drift the hue.
 */
export function dominantNonNeutralColor(png: DecodedPng): string | undefined {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i < png.pixels.length; i += 4) {
    const a = png.pixels[i + 3] ?? 0;
    if (a < 128) {
      continue;
    }
    const r = png.pixels[i] ?? 0;
    const g = png.pixels[i + 1] ?? 0;
    const b = png.pixels[i + 2] ?? 0;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 16) {
      continue; // grey, including pure black and white
    }
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, { count: 1, r, g, b });
    } else {
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    }
  }

  let best: { count: number; r: number; g: number; b: number } | undefined;
  for (const bucket of buckets.values()) {
    if (best === undefined || bucket.count > best.count) {
      best = bucket;
    }
  }
  if (best === undefined) {
    return undefined;
  }

  const channel = (total: number): string =>
    Math.round(total / best.count)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(best.r)}${channel(best.g)}${channel(best.b)}`;
}
