import 'server-only';

import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Writing rows into somebody else's workbook, and changing nothing else.
 *
 * The company's payment file is theirs: seven sheets, array formulas, dropdown
 * lists, conditional formatting, and a Checks tab that audits the figures. We
 * do not reproduce any of that — we open their own file, replace the data rows
 * on three sheets, and put everything else back byte for byte. Their Checks
 * tab then audits our numbers by their rules, which is the only reason they
 * would trust the file on the first try. When they change the form, they send
 * a new one and nothing here changes.
 *
 * Three decisions carry this module:
 *
 *   The first data row of each sheet is the pattern. Whatever styling and
 *   formulas sit on row 2 are repeated down the rows we write, with relative
 *   row references renumbered. So a column they compute stays computed, and a
 *   column they add later is carried along without a code change.
 *
 *   Strings are written inline rather than through the shared-string table.
 *   The table is shared by every sheet in the book; appending to it means
 *   renumbering indices that other sheets point at. Inline strings touch
 *   nothing outside the cell.
 *
 *   Cached formula results are removed and the book is marked for a full
 *   recalculation. A formula cell carries both the formula and the value it
 *   last produced; leaving yesterday's value above today's data is worse than
 *   an obvious error, because it looks right.
 */

/* -------------------------------------------------------------------------- */
/* zip                                                                        */
/* -------------------------------------------------------------------------- */

export type ZipEntry = { name: string; data: Buffer };

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

/** Every entry, inflated. A workbook we are going to rewrite whole. */
export function unzipAll(buf: Buffer, limits = { entries: 512, bytes: 64 * 1024 * 1024 }): ZipEntry[] {
  let end = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip file');

  const count = buf.readUInt16LE(end + 10);
  if (count > limits.entries) throw new Error('workbook has too many parts');

  let p = buf.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  let total = 0;

  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const uncompressed = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    /* An uploaded file is somebody's input: refuse one that would unpack
     * into more memory than a payment workbook could possibly need. */
    total += uncompressed;
    if (total > limits.bytes) throw new Error('workbook is too large');

    const lNameLen = buf.readUInt16LE(localAt + 26);
    const lExtraLen = buf.readUInt16LE(localAt + 28);
    const start = localAt + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressed);
    entries.push({ name, data: method === 0 ? Buffer.from(raw) : inflateRawSync(raw) });

    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Deflated, because a workbook with its styles and strings is mostly text. */
export function zipAll(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const packed = deflateRawSync(entry.data, { level: 6 });
    const useDeflate = packed.length < entry.data.length;
    const body = useDeflate ? packed : entry.data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }

  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/* -------------------------------------------------------------------------- */
/* cells                                                                      */
/* -------------------------------------------------------------------------- */

export type CellValue = string | number | null;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** Excel's day count, which starts at 1899-12-30 for reasons of its own. */
export function excelDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const ms = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  return Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000);
}

function colName(index: number): string {
  let name = '';
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * One cell of the pattern row: how that column is styled, and the formula it
 * carries if it is computed rather than typed.
 */
type Pattern = { style: string | null; formula: string | null };

/** Renumbers a formula's relative row references from the pattern row to `row`. */
function renumber(formula: string, from: number, to: number): string {
  const pattern = new RegExp(`(\\$?[A-Z]{1,3})(\\$?)${from}(?![0-9])`, 'g');
  return formula.replace(pattern, (whole, col: string, dollar: string) =>
    dollar === '$' ? whole : `${col}${to}`,
  );
}

/** Reads row `n` of a sheet as the pattern for every row we write under it. */
function readPattern(sheetXml: string, n: number): Map<number, Pattern> {
  const out = new Map<number, Pattern>();
  const rowMatch = new RegExp(`<row[^>]*\\br="${n}"[^>]*>([\\s\\S]*?)</row>`).exec(sheetXml);
  if (!rowMatch) return out;

  /*
   * The attribute run is lazy on purpose. Greedy, it swallows the slash of a
   * self-closing `<c r="G2" s="47"/>`, the alternation then matches the `>`
   * as if the cell were open, and the cell reads as holding everything up to
   * the next `</c>` — which is the following cell's formula. An empty column
   * quietly took its neighbour's contents, and every column after it shifted.
   */
  const cells = rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g);
  for (const cell of cells) {
    const attrs = cell[1] ?? '';
    const body = cell[2] ?? '';
    const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
    if (!ref) continue;
    const style = /\bs="(\d+)"/.exec(attrs)?.[1] ?? null;
    const formula = /<f[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1] ?? null;
    out.set(colIndex(ref), { style, formula });
  }
  return out;
}

function cellXml(ref: string, value: CellValue, pattern: Pattern | undefined, row: number, patternRow: number): string {
  const style = pattern?.style ? ` s="${pattern.style}"` : '';

  /* A column they compute stays computed, renumbered onto this row. */
  if (pattern?.formula) {
    return `<c r="${ref}"${style}><f>${escapeXml(renumber(pattern.formula, patternRow, row))}</f></c>`;
  }
  if (value === null || value === '') return `<c r="${ref}"${style}/>`;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${style}><v>${value}</v></c>` : `<c r="${ref}"${style}/>`;
  }
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/* -------------------------------------------------------------------------- */
/* the workbook                                                               */
/* -------------------------------------------------------------------------- */

/** Maps a sheet's displayed name to the part that holds it. */
function sheetParts(entries: ZipEntry[]): Map<string, string> {
  const get = (name: string) => entries.find((e) => e.name === name)?.data.toString('utf8') ?? '';
  const workbook = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');

  const byRelId = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    byRelId.set(m[1], m[2].replace(/^\/?xl\//, '').replace(/^\.\//, ''));
  }

  const out = new Map<string, string>();
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = m[0];
    const name = /\bname="([^"]*)"/.exec(tag)?.[1];
    const rid = /r:id="([^"]+)"/.exec(tag)?.[1];
    if (!name || !rid) continue;
    const target = byRelId.get(rid);
    if (target) out.set(decodeXml(name), `xl/${target}`);
  }
  return out;
}

const decodeXml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

export type SheetRows = {
  /** The sheet as the company named it. */
  sheet: string;
  /** Rows of values, written from row 2 down. Headers are never touched. */
  rows: CellValue[][];
  /**
   * One column, painted where a test says so.
   *
   * This is the leader's own highlighter, moved into the export. He shades
   * every raised fee by hand after each file so the office can see at a
   * glance which nights were paid above the standing rate — a hundred and
   * seventy rows, every week, looking for one number.
   */
  emphasis?: {
    /** Zero-based column index, the same frame the rows use. */
    column: number;
    test: (value: CellValue) => boolean;
    /** ARGB, e.g. FFB4C6E7. */
    rgb: string;
  };
};

/**
 * Adds a cell format that is some existing one plus a background colour, and
 * returns its index.
 *
 * Cloning the neighbouring cell's format rather than writing a fresh one is
 * what keeps the number format, the borders and the font: a cell painted from
 * nothing comes back as unformatted text in the middle of a money column.
 */
function styleWithFill(entries: ZipEntry[], baseStyle: string | null, rgb: string): string | null {
  const entry = entries.find((e) => e.name === 'xl/styles.xml');
  if (!entry) return null;
  let xml = entry.data.toString('utf8');

  const fills = /<fills[^>]*count="(\d+)"[^>]*>([\s\S]*?)<\/fills>/.exec(xml);
  const xfs = /<cellXfs[^>]*count="(\d+)"[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!fills || !xfs) return null;

  const fillId = Number(fills[1]);
  const newFill =
    `<fill><patternFill patternType="solid">` +
    `<fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  xml = xml.replace(
    fills[0],
    `<fills count="${fillId + 1}">${fills[2]}${newFill}</fills>`,
  );

  /* The format being cloned, found by counting <xf> elements. */
  const list = [...xfs[2].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  const index = baseStyle === null ? 0 : Number(baseStyle);
  const base = list[index] ?? '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>';
  const cloned = base
    .replace(/\sfillId="\d+"/, '')
    .replace(/\sapplyFill="[^"]*"/, '')
    .replace(/^<xf\b/, `<xf fillId="${fillId}" applyFill="1"`);

  const xfId = Number(xfs[1]);
  xml = xml.replace(xfs[0], `<cellXfs count="${xfId + 1}">${xfs[2]}${cloned}</cellXfs>`);

  entry.data = Buffer.from(xml, 'utf8');
  return String(xfId);
}

/**
 * Fills the named sheets of a workbook and returns the new file.
 *
 * Only `<sheetData>` is replaced, so column widths, dropdowns, conditional
 * formats and every other sheet in the book survive untouched.
 */
export function fillTemplate(template: Buffer, sheets: SheetRows[]): Buffer {
  const entries = unzipAll(template);
  const parts = sheetParts(entries);

  for (const { sheet, rows, emphasis } of sheets) {
    const part = parts.get(sheet);
    if (!part) throw new Error(`القالب ما بيه تبويب اسمه "${sheet}"`);
    const entry = entries.find((e) => e.name === part);
    if (!entry) throw new Error(`القالب ناقص ورقة "${sheet}"`);

    let xml = entry.data.toString('utf8');
    const patternRow = 2;
    const pattern = readPattern(xml, patternRow);
      const header =
      new RegExp(`<row[^>]*?\\br="1"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/row>)`).exec(xml)?.[0] ?? '';

    const width = Math.max(
      ...rows.map((r) => r.length),
      pattern.size > 0 ? Math.max(...pattern.keys()) + 1 : 0,
    );

    /*
     * The painted format is made once, and only if some row actually asks
     * for it: a workbook that gains a fill and a cell format every week ends
     * up carrying fifty of them, none of which anything uses.
     */
    let painted: string | null | undefined;

    const body: string[] = [header];
    rows.forEach((values, i) => {
      const row = i + 2;
      const cells: string[] = [];
      for (let c = 0; c < width; c += 1) {
        const p = pattern.get(c);
        const v = values[c] ?? null;
        /* A trailing column that is neither given nor computed is left out. */
        if (v === null && !p?.formula) continue;
        let style = p;
        if (emphasis && c === emphasis.column && emphasis.test(v)) {
          if (painted === undefined) {
            painted = styleWithFill(entries, p?.style ?? null, emphasis.rgb);
          }
          if (painted !== null) style = { style: painted, formula: p?.formula ?? null };
        }
        cells.push(cellXml(`${colName(c)}${row}`, v, style, row, patternRow));
      }
      body.push(`<row r="${row}">${cells.join('')}</row>`);
    });

    const data = `<sheetData>${body.join('')}</sheetData>`;
    xml = /<sheetData\s*\/>/.test(xml)
      ? xml.replace(/<sheetData\s*\/>/, data)
      : xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, data);

    /* The stated extent of the sheet, so Excel does not keep the old one. */
    xml = xml.replace(
      /<dimension[^>]*\/>/,
      `<dimension ref="A1:${colName(Math.max(width - 1, 0))}${rows.length + 1}"/>`,
    );

    entry.data = Buffer.from(xml, 'utf8');
  }

  return Buffer.from(zipAll(recalculate(entries)));
}

/**
 * Drops every cached formula result and asks Excel to recompute on open.
 *
 * Also removes the calculation chain, which lists the formula cells in the
 * order they were last solved: ours are different cells now, and a stale chain
 * makes Excel announce that the file is damaged.
 */
export function recalculate(entries: ZipEntry[]): ZipEntry[] {
  const kept = entries.filter((e) => e.name !== 'xl/calcChain.xml');

  for (const entry of kept) {
    if (entry.name === '[Content_Types].xml') {
      const xml = entry.data
        .toString('utf8')
        .replace(/<Override[^>]*calcChain\.xml[^>]*\/>/g, '');
      entry.data = Buffer.from(xml, 'utf8');
      continue;
    }
    if (entry.name === 'xl/_rels/workbook.xml.rels') {
      const xml = entry.data
        .toString('utf8')
        .replace(/<Relationship\b[^>]*calcChain\.xml[^>]*\/>/g, '');
      entry.data = Buffer.from(xml, 'utf8');
      continue;
    }
    if (entry.name === 'xl/workbook.xml') {
      let xml = entry.data.toString('utf8');
      xml = /<calcPr\b[^>]*\/>/.test(xml)
        ? xml.replace(/<calcPr\b[^>]*\/>/, '<calcPr calcId="0" fullCalcOnLoad="1"/>')
        : xml.replace('</workbook>', '<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>');
      entry.data = Buffer.from(xml, 'utf8');
      continue;
    }
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name)) {
      const xml = entry.data
        .toString('utf8')
        /* A formula cell keeps its formula and loses the answer it cached. */
        .replace(/(<f\b[^>]*(?:\/>|>[\s\S]*?<\/f>))\s*<v>[\s\S]*?<\/v>/g, '$1');
      entry.data = Buffer.from(xml, 'utf8');
    }
  }
  return kept;
}

/* -------------------------------------------------------------------------- */
/* repairing a workbook that has been typed over                              */
/* -------------------------------------------------------------------------- */

export type Repair = { cell: string; was: string; now: string };

/**
 * Puts back the formulas somebody typed over.
 *
 * Their Dashboard is a computed table: each row reads an event out of the
 * `Event List` tab and totals that event's rows across the other tabs. Over
 * the months it has been used, parts of it were overwritten with the numbers
 * those formulas had produced at the time — five rows carry event IDs typed
 * straight in, most of the total column is a frozen figure, and one row reads
 * the row above it by a fill-down that stopped one short.
 *
 * None of that matters while a person fills the sheet by hand and reads the
 * answers off it. It matters a great deal the moment the sheet is filled from
 * outside: the typed-in rows go on claiming events from weeks ago, their
 * totals are counted a second time, and their own `Checks` tab reports a
 * difference that is not ours.
 *
 * So the pattern row is restored down the table. It invents nothing: every
 * formula written here is row 2's own formula with its row numbers moved, and
 * every cell changed is listed so the person who uploaded the file can see
 * exactly what was put back before anybody relies on it.
 */
export function repairComputedTable(
  template: Buffer,
  sheetName: string,
  columns: string[],
): { buffer: Buffer; repairs: Repair[] } {
  const entries = unzipAll(template);
  const part = sheetParts(entries).get(sheetName);
  if (!part) return { buffer: template, repairs: [] };

  const index = entries.findIndex((e) => e.name === part);
  let xml = entries[index].data.toString('utf8');
  const pattern = readPattern(xml, 2);
  const wanted = columns.filter((c) => pattern.get(colIndex(c))?.formula);
  if (!wanted.length) return { buffer: template, repairs: [] };

  /* The table ends where its own totals begin: the row that sums a column. */
  let last = 2;
  let totalsRow: number | null = null;
  for (const row of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const r = Number(row[1]);
    if (r < 2) continue;
    const sums = wanted.some((col) =>
      new RegExp(`<c\\b[^>]*?\\br="${col}${r}"[^>]*?>\\s*<f[^>]*>SUM\\(`).test(row[2]),
    );
    if (sums) {
      totalsRow = r;
      break;
    }
    if (new RegExp(`<c\\b[^>]*?\\br="(?:${wanted.join('|')})${r}"`).test(row[2])) last = r;
  }

  const repairs: Repair[] = [];

  for (let r = 3; r <= last; r++) {
    for (const col of wanted) {
      const want = renumber(pattern.get(colIndex(col))!.formula!, 2, r);
      const cell = new RegExp(`<c\\b[^>]*?\\br="${col}${r}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(xml);
      if (!cell) continue;
      const have = /<f[^>]*>([\s\S]*?)<\/f>/.exec(cell[0])?.[1];
      if (have === escapeXml(want)) continue;
      /* Never rewrite a shared formula's definition: the rows that point at
       * it by number would be left with nothing to point at. */
      if (/<f\b[^>]*\bref="/.test(cell[0])) continue;

      const style = /\bs="(\d+)"/.exec(cell[0])?.[1];
      repairs.push({
        cell: `${sheetName}!${col}${r}`,
        was: have ? decodeXml(have) : decodeXml(/<v>([\s\S]*?)<\/v>/.exec(cell[0])?.[1] ?? ''),
        now: want,
      });
      xml =
        xml.slice(0, cell.index) +
        `<c r="${col}${r}"${style ? ` s="${style}"` : ''}><f>${escapeXml(want)}</f></c>` +
        xml.slice(cell.index + cell[0].length);
    }
  }

  /*
   * And the totals line, where a frozen figure hides a changed column.
   *
   * Only columns that measure something: a column whose formula merely reads
   * a value from another tab is a label, and the sum of fifteen labels means
   * nothing. Theirs holds a serial number, and it was being summed.
   */
  const measures = wanted.filter((col) => pattern.get(colIndex(col))!.formula!.includes('('));
  if (totalsRow) {
    for (const col of measures) {
      const cell = new RegExp(
        `<c\\b[^>]*?\\br="${col}${totalsRow}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`,
      ).exec(xml);
      if (!cell || /<f\b/.test(cell[0])) continue;
      const want = `SUM(${col}2:${col}${last})`;
      const style = /\bs="(\d+)"/.exec(cell[0])?.[1];
      repairs.push({
        cell: `${sheetName}!${col}${totalsRow}`,
        was: decodeXml(/<v>([\s\S]*?)<\/v>/.exec(cell[0])?.[1] ?? ''),
        now: want,
      });
      xml =
        xml.slice(0, cell.index) +
        `<c r="${col}${totalsRow}"${style ? ` s="${style}"` : ''}><f>${want}</f></c>` +
        xml.slice(cell.index + cell[0].length);
    }
  }

  if (!repairs.length) return { buffer: template, repairs };
  entries[index] = { name: part, data: Buffer.from(xml, 'utf8') };
  return { buffer: zipAll(recalculate(entries)), repairs };
}

/* -------------------------------------------------------------------------- */
/* correcting a check that counts our own total                               */
/* -------------------------------------------------------------------------- */

/**
 * Replaces the formula in one cell of one sheet, keeping its style.
 *
 * Used for a single cell of their `Checks` tab, and meant for nothing wider.
 * Their checks are the reason the file is trusted on the first read, so the
 * rule is that we do not touch them — with one exception, which is a check
 * that has been made wrong by something we ourselves write.
 *
 * Silent when the cell is not there. A new template that moved the check is
 * not a reason to refuse the week's payments; it is a reason to leave their
 * formula exactly as they wrote it.
 */
export function rewriteFormula(
  template: Buffer,
  sheet: string,
  ref: string,
  formula: string,
): Buffer {
  const entries = unzipAll(template);
  const part = sheetParts(entries).get(sheet);
  if (!part) return template;

  const index = entries.findIndex((e) => e.name === part);
  if (index < 0) return template;

  const xml = entries[index].data.toString('utf8');
  const cell = new RegExp(`<c\\b[^>]*?\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(xml);
  if (!cell || !/<f\b/.test(cell[0])) return template;

  const style = /\bs="(\d+)"/.exec(cell[0])?.[1];
  entries[index] = {
    name: part,
    data: Buffer.from(
      xml.slice(0, cell.index) +
        `<c r="${ref}"${style ? ` s="${style}"` : ''}><f>${escapeXml(formula)}</f></c>` +
        xml.slice(cell.index + cell[0].length),
      'utf8',
    ),
  };
  return Buffer.from(zipAll(entries));
}

/**
 * Widens one range, everywhere a formula in the book refers to it.
 *
 * Their sheets were written for a week somebody typed in by hand, and several
 * of them read a fixed block of rows — fifteen on the costs sheet. A week
 * that fills more rows than that is not refused and not warned about: the
 * rows below the block are simply not seen by the formulas that total them,
 * and two sides of their own comparison go quietly wrong together.
 *
 * Only text inside `<f>` is touched, and only this exact reference, so a
 * range that happens to look like it in a label or a defined name is left
 * alone. Both ends of a comparison must be widened in the same call, or the
 * check they feed starts reporting a difference that is ours.
 */
export function widenReference(template: Buffer, from: string, to: string): Buffer {
  const entries = unzipAll(template);
  const parts = new Set(sheetParts(entries).values());
  let touched = false;

  for (const entry of entries) {
    if (!parts.has(entry.name)) continue;
    const xml = entry.data.toString('utf8');
    const next = xml.replace(/<f\b[^>]*>[\s\S]*?<\/f>/g, (f) => f.split(from).join(to));
    if (next === xml) continue;
    entry.data = Buffer.from(next, 'utf8');
    touched = true;
  }

  return touched ? Buffer.from(zipAll(entries)) : template;
}
