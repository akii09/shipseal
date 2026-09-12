import { describe, expect, it } from "vitest";
import { carouselPdf, joinBytes, zipFiles } from "../src/outputs/downloads.js";

const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

/** Smallest thing that passes the SOI check: the writers never decode the image. */
const jpeg = (size = 64): Uint8Array => {
  const bytes = new Uint8Array(size);
  bytes[0] = 255;
  bytes[1] = 216;
  bytes.fill(7, 2);
  return bytes;
};

const page = (width = 1080, height = 1350, bytes = jpeg()) => ({ width, height, bytes });

const u32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
const u16 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);

describe("joinBytes", () => {
  it("concatenates in order", () => {
    expect([...joinBytes([new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3])])]).toEqual([1, 2, 3]);
  });

  it("returns an empty array for no parts", () => {
    expect(joinBytes([]).length).toBe(0);
  });
});

describe("carouselPdf", () => {
  it("writes one page object per image", () => {
    const pdf = text(carouselPdf([page(), page(), page()]));
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.endsWith("%%EOF\n")).toBe(true);
    expect(pdf).toContain("/Type /Pages /Count 3 /Kids [3 0 R 6 0 R 9 0 R]");
    expect([...pdf.matchAll(/\/Type \/Page /g)]).toHaveLength(3);
    // 2 fixed objects plus 3 per page.
    expect(pdf).toContain("/Size 12");
  });

  it("places the page at half the pixel size so a portrait render is 540x675pt", () => {
    const pdf = text(carouselPdf([page(1080, 1350)]));
    expect(pdf).toContain("/MediaBox [0 0 540 675]");
    expect(pdf).toContain("q 540 0 0 675 0 0 cm /Image Do Q");
    expect(pdf).toContain("/Width 1080 /Height 1350");
  });

  it("declares the JPEG stream length and embeds the bytes unchanged", () => {
    const bytes = jpeg(128);
    const pdf = carouselPdf([page(1080, 1350, bytes)]);
    expect(text(pdf)).toContain("/Filter /DCTDecode /Length 128");
    expect(text(pdf)).toContain(text(bytes));
  });

  it("points every xref entry at the matching object header", () => {
    const pdf = carouselPdf([page(), page()]);
    const body = text(pdf);
    const startxref = Number(/startxref\n(\d+)\n/.exec(body)?.[1]);
    expect(body.slice(startxref, startxref + 4)).toBe("xref");

    const entries = [...body.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    expect(entries).toHaveLength(8);
    entries.forEach((offset, index) => {
      expect(body.slice(offset).startsWith(`${String(index + 1)} 0 obj\n`)).toBe(true);
    });
  });

  it("is deterministic for the same pages", () => {
    expect(text(carouselPdf([page()]))).toBe(text(carouselPdf([page()])));
  });

  it("rejects an empty carousel", () => {
    expect(() => carouselPdf([])).toThrowError(/nonempty JPEG pages/);
  });

  it("rejects a page that is not JPEG, because DCTDecode would produce a broken PDF", () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(() => carouselPdf([page(1080, 1350, png)])).toThrowError(/nonempty JPEG pages/);
    expect(() => carouselPdf([page(), page(1080, 1350, png)])).toThrowError(/nonempty JPEG pages/);
  });
});

describe("zipFiles", () => {
  const files = [
    { name: "a.png", bytes: new Uint8Array([1, 2, 3]) },
    { name: "manifest.json", bytes: new TextEncoder().encode("{}\n") },
  ];

  it("stores entries uncompressed with matching local and central records", () => {
    const zip = zipFiles(files);
    expect(u32(zip, 0)).toBe(0x04034b50);
    // Compression method 0 is STORE: PNG and JPEG are already compressed.
    expect(u16(zip, 8)).toBe(0);
    expect(u32(zip, 18)).toBe(3);
    expect(u32(zip, 22)).toBe(3);
    expect(u16(zip, 26)).toBe("a.png".length);

    const eocdOffset = zip.length - 22;
    expect(u32(zip, eocdOffset)).toBe(0x06054b50);
    expect(u16(zip, eocdOffset + 8)).toBe(2);
    expect(u16(zip, eocdOffset + 10)).toBe(2);

    const directoryOffset = u32(zip, eocdOffset + 16);
    const directorySize = u32(zip, eocdOffset + 12);
    expect(directoryOffset + directorySize).toBe(eocdOffset);
    expect(u32(zip, directoryOffset)).toBe(0x02014b50);
    // First entry's local header sits at the very start of the archive.
    expect(u32(zip, directoryOffset + 42)).toBe(0);
  });

  it("records the second entry's local header offset", () => {
    const zip = zipFiles(files);
    const eocdOffset = zip.length - 22;
    const directoryOffset = u32(zip, eocdOffset + 16);
    const secondEntry = directoryOffset + 46 + "a.png".length;
    expect(u32(zip, secondEntry)).toBe(0x02014b50);
    expect(u32(zip, secondEntry + 42)).toBe(30 + "a.png".length + 3);
  });

  it("writes a known CRC32 so the archive verifies elsewhere", () => {
    // CRC32 of the three bytes 01 02 03.
    const zip = zipFiles([{ name: "a.bin", bytes: new Uint8Array([1, 2, 3]) }]);
    expect(u32(zip, 14)).toBe(0x55bc801d);
  });

  it("uses a fixed 1980-01-01 timestamp so the same inputs give the same bytes", () => {
    const first = zipFiles(files);
    const second = zipFiles(files);
    expect([...first]).toEqual([...second]);
    expect(u16(first, 10)).toBe(0);
    expect(u16(first, 12)).toBe(33);
  });

  it("produces a valid empty archive", () => {
    const zip = zipFiles([]);
    expect(zip.length).toBe(22);
    expect(u16(zip, 10)).toBe(0);
  });

  it("rejects a name with a path separator, so an archive cannot write outside its folder", () => {
    expect(() => zipFiles([{ name: "../escape.png", bytes: jpeg() }])).toThrowError(/unsafe or duplicated/);
    expect(() => zipFiles([{ name: "nested/file.png", bytes: jpeg() }])).toThrowError(/unsafe or duplicated/);
  });

  it("rejects a duplicate name", () => {
    expect(() =>
      zipFiles([
        { name: "same.png", bytes: jpeg() },
        { name: "same.png", bytes: jpeg() },
      ]),
    ).toThrowError(/unsafe or duplicated/);
  });
});
