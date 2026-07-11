import readXlsxFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { createXlsxWorkbook } from "@/lib/xlsx-workbook";

interface StoredZipEntry {
  flags: number;
  contents: string;
}

function readStoredZipEntries(bytes: Buffer): Map<string, StoredZipEntry> {
  const entries = new Map<string, StoredZipEntry>();
  let offset = 0;

  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const flags = bytes.readUInt16LE(offset + 6);
    const compression = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentsStart = nameStart + nameLength + extraLength;
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString("utf8");

    expect(compression).toBe(0);
    entries.set(name, {
      flags,
      contents: bytes
        .subarray(contentsStart, contentsStart + compressedSize)
        .toString("utf8"),
    });
    offset = contentsStart + compressedSize;
  }

  return entries;
}

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
});
