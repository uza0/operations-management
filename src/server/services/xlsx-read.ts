import 'server-only';

import { inflateRawSync } from 'node:zlib';

/**
 * A minimal .xlsx reader — the other direction of xlsx.ts, and the same deal.
 *
 * Writing a workbook here meant not taking a dependency; reading one means the
 * same, and for the same reason: this project's audit is watched, and a
 * spreadsheet parser is a large amount of other people's code to run over a
 * file a user uploaded. An .xlsx is a zip of XML, Node already has the
 * inflater, and what we need from the format is one rectangle of text.
 *
 * Deliberately narrow, and the narrowness is the point: the first worksheet,
 * cells as strings, nothing else. No formulas, no dates, no styles, no merged
 * cells, no second sheet. What comes back is rows of strings, exactly as
 * somebody typed them, which is all a roster is.
 *
 * Numbers are returned as they were stored, so "TZ-001" stays "TZ-001" and a
 * phone typed as 7701234567 comes back as its digits. A phone number a user
 * formatted as a number in Excel loses its leading zero before the file is
 * ever written — that is Excel's doing, not ours, and it is why the exporter
 * writes phones as text.
 */

type ZipEntry = { name: string; data: Buffer };

/**
 * Reads a zip's central directory and inflates the entries we name.
 *
 * It walks the central directory rather than scanning for local headers,
 * because a local header may say the sizes are in a trailer after the data
 * and the directory always knows them.
 */
function unzip(buf: Buffer, wanted: (name: string) => boolean): ZipEntry[] {
  // End of central directory: the last 22+ bytes, after an optional comment.
  let end = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip file');

  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    if (wanted(name)) {
      // The local header's own name and extra fields come before the data,
      // and its extra length may differ from the directory's.
      const lNameLen = buf.readUInt16LE(localAt + 26);
      const lExtraLen = buf.readUInt16LE(localAt + 28);
      const start = localAt + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compressed);
      entries.push({
        name,
        data: method === 0 ? raw : inflateRawSync(raw),
      });
    }

    p += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/** XML text with the five predefined entities and numeric escapes resolved. */
function unescapeXml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** "BC12" → 54. Column letters are base-26 with no zero. */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * The first worksheet of an .xlsx, as rows of trimmed strings.
 *
 * Rows are padded to the widest row so that every row has a cell at every
 * column index — a sheet where someone cleared the last cell of a row would
 * otherwise come back with that row one column short, and the column a value
 * belongs to is the whole meaning of the file.
 */
export function readXlsx(file: Buffer): string[][] {
  const parts = unzip(
    file,
    (name) =>
      name === 'xl/sharedStrings.xml' ||
      name === 'xl/worksheets/sheet1.xml' ||
      name === 'xl/workbook.xml',
  );

  const sharedXml = parts.find((e) => e.name === 'xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedXml) {
    const text = sharedXml.data.toString('utf8');
    for (const match of text.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      // A shared string may be split into several runs; they concatenate.
      const runs = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
      shared.push(unescapeXml(runs.join('')));
    }
  }

  const sheetXml = parts.find((e) => e.name === 'xl/worksheets/sheet1.xml');
  if (!sheetXml) throw new Error('no worksheet');
  const text = sheetXml.data.toString('utf8');

  const rows: string[][] = [];
  let widest = 0;

  for (const rowMatch of text.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)\/>|<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1] ?? cellMatch[2] ?? '';
      const body = cellMatch[3] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '';
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? 'n';

      let value = '';
      if (type === 's') {
        const index = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '-1');
        value = shared[index] ?? '';
      } else if (type === 'inlineStr') {
        const runs = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
        value = unescapeXml(runs.join(''));
      } else {
        value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      }

      const at = ref ? columnIndex(ref) : cells.length;
      while (cells.length < at) cells.push('');
      cells[at] = value.trim();
    }
    widest = Math.max(widest, cells.length);
    rows.push(cells);
  }

  for (const row of rows) while (row.length < widest) row.push('');
  return rows;
}

/**
 * The same rectangle out of a CSV, for the person who saved as CSV because
 * that is what the dialog offered first.
 *
 * Quoted fields, doubled quotes inside them, and newlines inside quotes all
 * behave; a leading byte-order mark is dropped, because Excel writes one and
 * it would otherwise become part of the first header.
 */
export function readCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c !== ''));
}
