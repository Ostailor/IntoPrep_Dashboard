import readXlsxFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import {
  assertClassicZipMetadata,
  createXlsxWorkbook,
  type ClassicZipMetadata,
  type XlsxCell,
  type XlsxSheet,
} from "@/lib/xlsx-workbook";

interface StoredZipEntry {
  flags: number;
  crc32: number;
  localOffset: number;
  contents: string;
}

function readStoredZipEntries(bytes: Buffer): Map<string, StoredZipEntry> {
  const entries = new Map<string, StoredZipEntry>();
  let offset = 0;

  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const localOffset = offset;
    const flags = bytes.readUInt16LE(offset + 6);
    const compression = bytes.readUInt16LE(offset + 8);
    const crc32 = bytes.readUInt32LE(offset + 14);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentsStart = nameStart + nameLength + extraLength;
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString("utf8");

    expect(compression).toBe(0);
    entries.set(name, {
      flags,
      crc32,
      localOffset,
      contents: bytes
        .subarray(contentsStart, contentsStart + compressedSize)
        .toString("utf8"),
    });
    offset = contentsStart + compressedSize;
  }

  return entries;
}

function calculateCrc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const validZipMetadata: ClassicZipMetadata = {
  entryCount: 1,
  entries: [{
    nameSize: 8,
    compressedSize: 16,
    uncompressedSize: 16,
    localOffset: 0,
  }],
  centralDirectorySize: 54,
  centralDirectoryOffset: 54,
};

describe("createXlsxWorkbook", () => {
  it("writes two sheets that the existing parser reads with typed dates and numbers", async () => {
    const bytes = createXlsxWorkbook([
      {
        name: "Student Information",
        headers: ["Student Name", "School"],
        rows: [["Ada Demo", "North High"]],
      },
      {
        name: "Scores",
        headers: ["Student Name", "Test Date", "RW", "Math", "Total"],
        rows: [["Ada Demo", new Date("2026-07-10T00:00:00.000Z"), 720, 760, 1480]],
      },
    ]);

    const sheets = await readXlsxFile(bytes);

    expect(sheets.map((sheet) => sheet.sheet)).toEqual(["Student Information", "Scores"]);
    expect(sheets[0]?.data).toEqual([
      ["Student Name", "School"],
      ["Ada Demo", "North High"],
    ]);
    expect(sheets[1]?.data[1]).toEqual([
      "Ada Demo",
      expect.any(Date),
      720,
      760,
      1480,
    ]);
    const parsedDate = sheets[1]?.data[1]?.[1];
    expect(parsedDate).toBeInstanceOf(Date);
    if (!(parsedDate instanceof Date)) {
      throw new Error("Expected read-excel-file to return an XLSX date as a Date.");
    }
    expect(parsedDate.toISOString()).toBe("2026-07-10T00:00:00.000Z");
  });

  it("round-trips Unicode, XML characters, blank cells, and booleans safely", async () => {
    const bytes = createXlsxWorkbook([
      {
        name: "Escaping & Unicode",
        headers: ["Unicode", "Formula", "Blank", "Active", "XML"],
        rows: [["Zażółć 😀", "=1+1", null, true, "A&B <C> \"D\" 'E'"]],
      },
    ]);

    const [sheet] = await readXlsxFile(bytes);
    const worksheetXml = readStoredZipEntries(bytes).get("xl/worksheets/sheet1.xml")?.contents;

    expect(sheet?.data[1]).toEqual([
      "Zażółć 😀",
      "'=1+1",
      null,
      true,
      "A&B <C> \"D\" 'E'",
    ]);
    expect(worksheetXml).toContain("Zażółć 😀");
    expect(worksheetXml).toContain("A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;");
    expect(worksheetXml).not.toContain("<f>");
    expect(worksheetXml).toContain("&apos;=1+1");
  });

  it("replaces every invalid XML 1.0 code point while preserving valid Unicode", async () => {
    const unsafe = `valid\u0000\uFFFE\uFFFF\uD800${String.fromCodePoint(0x1fffe)}😀`;
    const expected = `valid${"�".repeat(5)}😀`;
    const bytes = createXlsxWorkbook([{
      name: "Unicode",
      headers: ["Value"],
      rows: [[unsafe]],
    }]);

    const [sheet] = await readXlsxFile(bytes);
    const worksheetXml = readStoredZipEntries(bytes).get("xl/worksheets/sheet1.xml")?.contents ?? "";

    expect(sheet?.data[1]?.[0]).toBe(expected);
    expect(worksheetXml).toContain(expected);
    expect(worksheetXml).not.toMatch(/[\u0000\uD800\uFFFE\uFFFF]/u);
    expect(Array.from(worksheetXml, (character) => character.codePointAt(0)))
      .not.toContain(0x1fffe);
  });

  it("uses Excel's 1900 date system across the fake leap-day boundary", () => {
    const bytes = createXlsxWorkbook([{
      name: "Dates",
      headers: ["Date"],
      rows: [
        [new Date("1900-01-01T00:00:00.000Z")],
        [new Date("1900-02-28T00:00:00.000Z")],
        [new Date("1900-03-01T00:00:00.000Z")],
      ],
    }]);
    const worksheetXml = readStoredZipEntries(bytes).get("xl/worksheets/sheet1.xml")?.contents ?? "";

    expect(worksheetXml).toContain('<c r="A2" t="n" s="2"><v>1</v></c>');
    expect(worksheetXml).toContain('<c r="A3" t="n" s="2"><v>59</v></c>');
    expect(worksheetXml).toContain('<c r="A4" t="n" s="2"><v>61</v></c>');
  });

  it.each([
    ["before 1900", new Date("1899-12-31T00:00:00.000Z")],
    ["after 9999", new Date(Date.UTC(10_000, 0, 1))],
    ["non-finite", new Date(Number.NaN)],
  ])("rejects an XLSX date %s", (_label, date) => {
    expect(() => createXlsxWorkbook([{
      name: "Dates",
      headers: ["Date"],
      rows: [[date]],
    }])).toThrow(/XLSX date/i);
  });

  it("rejects worksheet dimensions beyond Excel's XFD and row limits before iterating", () => {
    const oversizedColumns = new Array<number>(16_385);
    expect(() => createXlsxWorkbook([{
      name: "Columns",
      headers: ["Name"],
      rows: [],
      columnWidths: oversizedColumns,
    }])).toThrow(/16,384 columns/i);

    const oversizedRows = new Array(1_048_576) as XlsxCell[][];
    expect(() => createXlsxWorkbook([{
      name: "Rows",
      headers: ["Name"],
      rows: oversizedRows,
    }])).toThrow(/1,048,576 rows/i);
  });

  it("rejects a sheet count that would exceed the classic ZIP entry limit", () => {
    const tooManySheets = new Array(65_531) as XlsxSheet[];
    expect(() => createXlsxWorkbook(tooManySheets)).toThrow(/65,535 ZIP entries/i);
  });

  it.each([
    ["entry count", { entryCount: 65_536 }, /ZIP entry count/i],
    ["file-name size", { entries: [{ ...validZipMetadata.entries[0]!, nameSize: 65_536 }] }, /ZIP entry name/i],
    ["compressed size", { entries: [{ ...validZipMetadata.entries[0]!, compressedSize: 0x1_0000_0000 }] }, /compressed size/i],
    ["uncompressed size", { entries: [{ ...validZipMetadata.entries[0]!, uncompressedSize: 0x1_0000_0000 }] }, /uncompressed size/i],
    ["local offset", { entries: [{ ...validZipMetadata.entries[0]!, localOffset: 0x1_0000_0000 }] }, /local offset/i],
    ["central-directory size", { centralDirectorySize: 0x1_0000_0000 }, /central directory size/i],
    ["central-directory offset", { centralDirectoryOffset: 0x1_0000_0000 }, /central directory offset/i],
  ])("rejects classic ZIP metadata beyond the %s field", (_label, patch, message) => {
    expect(() => assertClassicZipMetadata({ ...validZipMetadata, ...patch })).toThrow(message);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects the non-finite numeric cell %s",
    (value) => {
      expect(() => createXlsxWorkbook([{
        name: "Numbers",
        headers: ["Value"],
        rows: [[value]],
      }])).toThrow(/XLSX number/i);
    },
  );

  it("writes AA references after column Z", () => {
    const headers = Array.from({ length: 27 }, (_, index) => `Column ${index + 1}`);
    const bytes = createXlsxWorkbook([{
      name: "Columns",
      headers,
      rows: [Array.from({ length: 27 }, (_, index) => index + 1)],
    }]);
    const worksheetXml = readStoredZipEntries(bytes).get("xl/worksheets/sheet1.xml")?.contents ?? "";

    expect(worksheetXml).toContain('<dimension ref="A1:AA2"/>');
    expect(worksheetXml).toContain('<c r="AA1" t="inlineStr" s="1">');
    expect(worksheetXml).toContain('<c r="AA2" t="n"><v>27</v></c>');
  });

  it("builds the required OpenXML package and worksheet presentation features", () => {
    const bytes = createXlsxWorkbook([
      {
        name: "Students",
        headers: ["Student Name", "School"],
        rows: [["Ada Demo", "North High"]],
        columnWidths: [28, 18],
      },
      {
        name: "Scores",
        headers: ["Student Name", "Total"],
        rows: [["Ada Demo", 1480]],
      },
    ]);
    const entries = readStoredZipEntries(bytes);

    expect([...entries.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    expect([...entries.values()].every((entry) => (entry.flags & 0x0800) !== 0)).toBe(true);

    const worksheetXml = entries.get("xl/worksheets/sheet1.xml")?.contents ?? "";
    expect(worksheetXml).toContain(
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    );
    expect(worksheetXml).toContain('<col min="1" max="1" width="28" customWidth="1"/>');
    expect(worksheetXml).toContain('<col min="2" max="2" width="18" customWidth="1"/>');
    expect(worksheetXml).toContain('<autoFilter ref="A1:B2"/>');
    expect(worksheetXml).toMatch(/<c r="A1" t="inlineStr" s="1">/);

    const stylesXml = entries.get("xl/styles.xml")?.contents ?? "";
    expect(stylesXml).toContain('<fgColor rgb="FF17365D"/>');
    expect(stylesXml).toContain('<color rgb="FFFFFFFF"/>');
    expect(stylesXml).toContain("<b/>");
    expect(stylesXml).toContain('formatCode="yyyy-mm-dd"');
  });

  it("writes matching CRC values, central-directory offsets, and EOCD metadata", () => {
    const bytes = createXlsxWorkbook([{
      name: "Students",
      headers: ["Name"],
      rows: [["Ada Demo"]],
    }]);
    const localEntries = readStoredZipEntries(bytes);
    const eocdOffset = bytes.length - 22;

    expect(bytes.readUInt32LE(eocdOffset)).toBe(0x06054b50);
    const entryCount = bytes.readUInt16LE(eocdOffset + 10);
    const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
    expect(entryCount).toBe(localEntries.size);
    expect(centralDirectoryOffset + centralDirectorySize).toBe(eocdOffset);

    let offset = centralDirectoryOffset;
    for (let index = 0; index < entryCount; index += 1) {
      expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
      const crc32 = bytes.readUInt32LE(offset + 16);
      const compressedSize = bytes.readUInt32LE(offset + 20);
      const uncompressedSize = bytes.readUInt32LE(offset + 24);
      const nameLength = bytes.readUInt16LE(offset + 28);
      const extraLength = bytes.readUInt16LE(offset + 30);
      const commentLength = bytes.readUInt16LE(offset + 32);
      const localOffset = bytes.readUInt32LE(offset + 42);
      const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
      const localEntry = localEntries.get(name);

      expect(localEntry).toBeDefined();
      expect(compressedSize).toBe(uncompressedSize);
      expect(localOffset).toBe(localEntry?.localOffset);
      expect(crc32).toBe(localEntry?.crc32);
      expect(crc32).toBe(calculateCrc32(Buffer.from(localEntry?.contents ?? "", "utf8")));
      offset += 46 + nameLength + extraLength + commentLength;
    }
    expect(offset).toBe(eocdOffset);
  });

  it.each([
    ["empty", ""],
    ["too long", "A".repeat(32)],
    ["forbidden character", "Scores/Archive"],
    ["leading apostrophe", "'Scores"],
    ["trailing apostrophe", "Scores'"],
  ])("rejects an %s sheet name", (_label, name) => {
    expect(() => createXlsxWorkbook([{ name, headers: ["Name"], rows: [] }])).toThrow(
      /sheet name/i,
    );
  });

  it("rejects duplicate sheet names case-insensitively", () => {
    expect(() =>
      createXlsxWorkbook([
        { name: "Scores", headers: ["Name"], rows: [] },
        { name: "scores", headers: ["Name"], rows: [] },
      ]),
    ).toThrow(/duplicate sheet name/i);
  });

  it("rejects sheet names that collide after invalid XML characters are replaced", () => {
    expect(() => createXlsxWorkbook([
      { name: "Scores\uFFFE", headers: ["Name"], rows: [] },
      { name: "Scores\uFFFF", headers: ["Name"], rows: [] },
    ])).toThrow(/duplicate sheet name/i);
  });
});
