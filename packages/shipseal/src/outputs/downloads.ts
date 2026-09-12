// Carousel PDF and ZIP writers. Both are hand-rolled rather than pulled in as dependencies:
// the output is image streams and stored entries, which needs no compression library
// (AGENTS.md rule 6). Spec: docs/PROJECT_PLAN.md 25 (2026-09-13 decisions).

import { ShipsealError } from "../core/errors.js";
import type { GeneratedFile } from "../core/generate.js";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

const isJpeg = (bytes: Uint8Array): boolean => bytes[0] === 255 && bytes[1] === 216;

export function joinBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Image-only PDF: each JPEG becomes one page as a DCTDecode stream, so the page is the exact
 * rendered layout rather than a reflow of it. Pages are placed at half the pixel size, which
 * puts a 1080x1350 render on a 540x675pt page at 144dpi.
 *
 * Object numbering: 1 is the catalog, 2 the page tree, then each page contributes three
 * objects (page, image, content stream) at 3 + index * 3.
 */
export function carouselPdf(
  pages: Pick<GeneratedFile, "bytes" | "width" | "height">[],
): Uint8Array {
  if (pages.length === 0 || pages.some((page) => !isJpeg(page.bytes))) {
    throw new ShipsealError(
      "pdf.invalid-pages",
      "A carousel requires nonempty JPEG pages.",
      "Render the story as JPEG before building the PDF.",
    );
  }
  const objects: Uint8Array[] = [
    encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encode(
      `<< /Type /Pages /Count ${String(pages.length)} /Kids [${pages
        .map((_, index) => `${String(3 + index * 3)} 0 R`)
        .join(" ")}] >>`,
    ),
  ];
  for (const [index, page] of pages.entries()) {
    const id = 3 + index * 3;
    const width = page.width / 2;
    const height = page.height / 2;
    objects.push(
      encode(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(width)} ${String(height)}] ` +
          `/Resources << /XObject << /Image ${String(id + 1)} 0 R >> >> ` +
          `/Contents ${String(id + 2)} 0 R >>`,
      ),
    );
    // Takumi renders RGB, so DeviceRGB matches every JPEG it produces.
    objects.push(
      joinBytes([
        encode(
          `<< /Type /XObject /Subtype /Image /Width ${String(page.width)} ` +
            `/Height ${String(page.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
            `/Filter /DCTDecode /Length ${String(page.bytes.length)} >>\nstream\n`,
        ),
        page.bytes,
        encode("\nendstream"),
      ]),
    );
    const content = `q ${String(width)} 0 0 ${String(height)} 0 0 cm /Image Do Q`;
    objects.push(
      encode(`<< /Length ${String(encode(content).length)} >>\nstream\n${content}\nendstream`),
    );
  }

  const header = encode("%PDF-1.4\n%Shipseal\n");
  const parts: Uint8Array[] = [header];
  const offsets: number[] = [];
  let position = header.length;
  for (const [index, object] of objects.entries()) {
    offsets.push(position);
    const bytes = joinBytes([encode(`${String(index + 1)} 0 obj\n`), object, encode("\nendobj\n")]);
    parts.push(bytes);
    position += bytes.length;
  }
  const size = objects.length + 1;
  parts.push(
    encode(
      `xref\n0 ${String(size)}\n0000000000 65535 f \n` +
        offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
        `trailer\n<< /Size ${String(size)} /Root 1 0 R >>\n` +
        `startxref\n${String(position)}\n%%EOF\n`,
    ),
  );
  return joinBytes(parts);
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

/**
 * ZIP with STORE and no compression: PNG and JPEG are already compressed, so deflating them
 * costs time and saves nothing. Every timestamp is the fixed DOS date 1980-01-01 (0x0021) so
 * the same inputs always produce the same archive bytes.
 */
export function zipFiles(files: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const FIXED_DOS_DATE = 33;
  const names = new Set<string>();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(file.name) || names.has(file.name)) {
      throw new ShipsealError(
        "zip.bad-name",
        "An archive file name is unsafe or duplicated.",
        "Use unique file names without path separators.",
      );
    }
    names.add(file.name);
    const name = encode(file.name);
    const checksum = crc32(file.bytes);

    // Local file header: signature, version needed, flags, method, time, date, crc,
    // compressed size, uncompressed size, name length, extra length.
    const header = new Uint8Array(30);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x04034b50, true);
    headerView.setUint16(4, 20, true);
    headerView.setUint16(12, FIXED_DOS_DATE, true);
    headerView.setUint32(14, checksum, true);
    headerView.setUint32(18, file.bytes.length, true);
    headerView.setUint32(22, file.bytes.length, true);
    headerView.setUint16(26, name.length, true);
    local.push(header, name, file.bytes);

    // Central directory entry: as above, plus version made by and the local header offset.
    const entry = new Uint8Array(46);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(14, FIXED_DOS_DATE, true);
    entryView.setUint32(16, checksum, true);
    entryView.setUint32(20, file.bytes.length, true);
    entryView.setUint32(24, file.bytes.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint32(42, offset, true);
    central.push(entry, name);
    offset += header.length + name.length + file.bytes.length;
  }

  // End of central directory: entry counts, directory size, directory offset.
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, central.reduce((sum, part) => sum + part.length, 0), true);
  endView.setUint32(16, offset, true);
  return joinBytes([...local, ...central, end]);
}
