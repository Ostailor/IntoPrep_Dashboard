export type XlsxCell = string | number | boolean | Date | null;

export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: XlsxCell[][];
  columnWidths?: number[];
}

interface ZipEntry {
  name: Buffer;
  contents: Buffer;
  crc32: number;
  offset: number;
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const UTF8_ZIP_FLAG = 0x0800;
const ZIP_VERSION = 20;
const ZIP_DOS_DATE_1980_01_01 = 0x0021;
const EXCEL_UNIX_EPOCH_OFFSET_DAYS = 25569;
const MILLISECONDS_PER_DAY = 86_400_000;
const MAX_COLUMN_WIDTH = 255;

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "\uFFFD")
    .replace(/[&<>"']/g, (character) => {
      switch (character) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&apos;";
      }
    });
}

function assertValidSheets(sheets: XlsxSheet[]): void {
  if (sheets.length === 0) {
    throw new Error("An XLSX workbook must contain at least one sheet.");
  }

  const names = new Set<string>();
  for (const sheet of sheets) {
    if (
      sheet.name.length === 0 ||
      sheet.name.length > 31 ||
      /[\u0000-\u001F\\/:?*[\]]/.test(sheet.name) ||
      sheet.name.startsWith("'") ||
      sheet.name.endsWith("'")
    ) {
      throw new Error(`Invalid XLSX sheet name: ${JSON.stringify(sheet.name)}.`);
    }

    const normalizedName = sheet.name.toLocaleLowerCase("en-US");
    if (names.has(normalizedName)) {
      throw new Error(`Duplicate sheet name: ${JSON.stringify(sheet.name)}.`);
    }
    names.add(normalizedName);

    for (const width of sheet.columnWidths ?? []) {
      if (!Number.isFinite(width) || width <= 0 || width > MAX_COLUMN_WIDTH) {
        throw new Error("XLSX column widths must be finite values between 0 and 255.");
      }
    }
  }
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function safeString(value: string): string {
  return value.startsWith("=") ? `'${value}` : value;
}

function inlineStringCell(reference: string, value: string, style?: number): string {
  const safeValue = safeString(value);
  const preserveWhitespace = /^\s|\s$/u.test(safeValue) ? ' xml:space="preserve"' : "";
  const styleAttribute = style === undefined ? "" : ` s="${style}"`;
  return `<c r="${reference}" t="inlineStr"${styleAttribute}><is><t${preserveWhitespace}>${escapeXml(safeValue)}</t></is></c>`;
}

function cellXml(reference: string, value: XlsxCell): string {
  if (value === null) return "";
  if (typeof value === "string") return inlineStringCell(reference, value);
  if (typeof value === "boolean") {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (!Number.isFinite(timestamp)) {
      throw new Error(`Invalid XLSX date at ${reference}.`);
    }
    const serial = timestamp / MILLISECONDS_PER_DAY + EXCEL_UNIX_EPOCH_OFFSET_DAYS;
    return `<c r="${reference}" t="n" s="2"><v>${serial}</v></c>`;
  }
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid XLSX number at ${reference}.`);
  }
  return `<c r="${reference}" t="n"><v>${Object.is(value, -0) ? 0 : value}</v></c>`;
}

function displayLength(value: XlsxCell | string | undefined): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return 10;
  return Array.from(String(value)).length;
}

function worksheetColumnWidths(sheet: XlsxSheet, columnCount: number): number[] {
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const configuredWidth = sheet.columnWidths?.[columnIndex];
    if (configuredWidth !== undefined) return configuredWidth;

    const contentLength = Math.max(
      displayLength(sheet.headers[columnIndex]),
      ...sheet.rows.map((row) => displayLength(row[columnIndex])),
    );
    return Math.min(60, Math.max(10, contentLength + 2));
  });
}

function worksheetXml(sheet: XlsxSheet): string {
  const columnCount = Math.max(
    sheet.headers.length,
    sheet.columnWidths?.length ?? 0,
    ...sheet.rows.map((row) => row.length),
  );
  const lastColumn = columnName(Math.max(0, columnCount - 1));
  const lastRow = sheet.rows.length + 1;
  const dimension = columnCount === 0 ? "A1" : `A1:${lastColumn}${lastRow}`;
  const widths = worksheetColumnWidths(sheet, columnCount);
  const columnsXml = widths.length === 0
    ? ""
    : `<cols>${widths.map((width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
      ).join("")}</cols>`;
  const headerCells = sheet.headers
    .map((header, columnIndex) =>
      inlineStringCell(`${columnName(columnIndex)}1`, header, 1),
    )
    .join("");
  const dataRows = sheet.rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 2;
      const cells = row
        .map((value, columnIndex) => cellXml(`${columnName(columnIndex)}${rowNumber}`, value))
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");
  const autoFilter = sheet.headers.length === 0
    ? ""
    : `<autoFilter ref="A1:${columnName(sheet.headers.length - 1)}${lastRow}"/>`;

  return `${XML_DECLARATION}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${columnsXml}<sheetData><row r="1" ht="20" customHeight="1">${headerCells}</row>${dataRows}</sheetData>${autoFilter}</worksheet>`;
}

function contentTypesXml(sheetCount: number): string {
  const worksheets = Array.from(
    { length: sheetCount },
    (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${worksheets}</Types>`;
}

function rootRelationshipsXml(): string {
  return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml(sheets: XlsxSheet[]): string {
  const sheetElements = sheets
    .map((sheet, index) =>
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");
  return `${XML_DECLARATION}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheetElements}</sheets></workbook>`;
}

function workbookRelationshipsXml(sheetCount: number): string {
  const worksheets = Array.from(
    { length: sheetCount },
    (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${worksheets}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function stylesXml(): string {
  return `${XML_DECLARATION}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function localFileHeader(entry: ZipEntry): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(ZIP_VERSION, 4);
  header.writeUInt16LE(UTF8_ZIP_FLAG, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(ZIP_DOS_DATE_1980_01_01, 12);
  header.writeUInt32LE(entry.crc32, 14);
  header.writeUInt32LE(entry.contents.length, 18);
  header.writeUInt32LE(entry.contents.length, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralDirectoryHeader(entry: ZipEntry): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(ZIP_VERSION, 4);
  header.writeUInt16LE(ZIP_VERSION, 6);
  header.writeUInt16LE(UTF8_ZIP_FLAG, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(ZIP_DOS_DATE_1980_01_01, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.contents.length, 20);
  header.writeUInt32LE(entry.contents.length, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return header;
}

function zipStore(files: Array<{ name: string; contents: string }>): Buffer {
  const entries: ZipEntry[] = [];
  const localParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const contents = Buffer.from(file.contents, "utf8");
    const entry = { name, contents, crc32: crc32(contents), offset };
    const header = localFileHeader(entry);
    entries.push(entry);
    localParts.push(header, name, contents);
    offset += header.length + name.length + contents.length;
  }

  const centralParts = entries.flatMap((entry) => [centralDirectoryHeader(entry), entry.name]);
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function createXlsxWorkbook(sheets: XlsxSheet[]): Buffer {
  assertValidSheets(sheets);

  return zipStore([
    { name: "[Content_Types].xml", contents: contentTypesXml(sheets.length) },
    { name: "_rels/.rels", contents: rootRelationshipsXml() },
    { name: "xl/workbook.xml", contents: workbookXml(sheets) },
    {
      name: "xl/_rels/workbook.xml.rels",
      contents: workbookRelationshipsXml(sheets.length),
    },
    { name: "xl/styles.xml", contents: stylesXml() },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      contents: worksheetXml(sheet),
    })),
  ]);
}
