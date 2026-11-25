// Excel cost sheet <-> JSON snapshot.
//
// parseCostSheetWorkbook: reads every cell value, formula (kept as text, never evaluated), cached
//   result, number format, merge, column width, row height and basic style from an .xlsx buffer.
// buildWorkbookFromSnapshot: rebuilds an .xlsx from that snapshot (formulas and merges kept).
//
// Snapshot: { sheets: [{ name, colWidths: [px|null], merges: ['A1:C1'], rows: [{ r, h, hidden, cells: [
//   { c, v, f, t: 'n'|'s'|'d'|'b'|'e', nf, s: { b, i, fs, fc, bg, ha, va, wrap, bd:{t,r,b,l} } } ] }] }] }
// r and c are 1-based.

const ExcelJS = require('exceljs');

const LIMITS = { maxSheets: 5, maxCells: 20000, maxTextLength: 2000, maxRows: 2000, maxCols: 60 };

class CostSheetParseError extends Error {}

const clip = (text) => String(text).slice(0, LIMITS.maxTextLength);

const argbOf = (color) => {
  const argb = color && typeof color === 'object' ? color.argb : null;
  return typeof argb === 'string' && /^[0-9A-Fa-f]{6,8}$/.test(argb) ? argb.slice(-6).toUpperCase() : null;
};

const plainText = (value) => {
  if (value == null) return null;
  if (typeof value === 'object' && !(value instanceof Date)) {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if (value.text != null) return String(value.text); // hyperlink
    if (value.error) return null;
  }
  return value;
};

const errorOf = (value) => (value && typeof value === 'object' && !(value instanceof Date) && value.error ? String(value.error) : null);

const encodeValue = (raw) => {
  const err = errorOf(raw);
  if (err) return { v: err, t: 'e' };
  const value = plainText(raw);
  if (value == null || value === '') return { v: null, t: null };
  if (value instanceof Date) return { v: value.toISOString(), t: 'd' };
  if (typeof value === 'number') return { v: Number.isFinite(value) ? value : null, t: 'n' };
  if (typeof value === 'boolean') return { v: value, t: 'b' };
  return { v: clip(value), t: 's' };
};

const encodeStyle = (cell) => {
  const s = {};
  const font = cell.font || {};
  if (font.bold) s.b = 1;
  if (font.italic) s.i = 1;
  if (font.size) s.fs = font.size;
  const fc = argbOf(font.color);
  if (fc && fc !== '000000') s.fc = fc;
  const fill = cell.fill;
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const bg = argbOf(fill.fgColor);
    if (bg && bg !== 'FFFFFF') s.bg = bg;
  }
  const al = cell.alignment || {};
  if (al.horizontal) s.ha = al.horizontal;
  if (al.vertical) s.va = al.vertical;
  if (al.wrapText) s.wrap = 1;
  const b = cell.border || {};
  const bd = {};
  ['top', 'right', 'bottom', 'left'].forEach((side) => {
    if (b[side] && b[side].style) bd[side[0]] = b[side].style;
  });
  if (Object.keys(bd).length) s.bd = bd;
  return Object.keys(s).length ? s : null;
};

async function parseCostSheetWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw new CostSheetParseError('The file could not be read as an Excel (.xlsx) workbook.');
  }

  const visibleSheets = workbook.worksheets.filter((ws) => ws.state === 'visible' || !ws.state);
  if (!visibleSheets.length) throw new CostSheetParseError('The workbook has no visible sheets.');
  if (visibleSheets.length > LIMITS.maxSheets) {
    throw new CostSheetParseError(`The workbook has ${visibleSheets.length} sheets; at most ${LIMITS.maxSheets} are supported.`);
  }

  let totalCells = 0;
  const sheets = visibleSheets.map((ws) => {
    if (ws.rowCount > LIMITS.maxRows || ws.columnCount > LIMITS.maxCols) {
      throw new CostSheetParseError(`Sheet "${ws.name}" is too large (${ws.rowCount} rows x ${ws.columnCount} columns).`);
    }

    const colWidths = [];
    for (let c = 1; c <= ws.columnCount; c += 1) {
      const col = ws.getColumn(c);
      colWidths.push(col.hidden ? 0 : (col.width ? Math.round(col.width * 7 + 5) : null));
    }

    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (cell.type === ExcelJS.ValueType.Merge) {
          // Covered by a merge: the master cell carries value + style.
          return;
        }
        const formula = cell.type === ExcelJS.ValueType.Formula ? cell.formula : undefined;
        const encoded = encodeValue(cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value);
        const style = encodeStyle(cell);
        if (encoded.t == null && !formula && !style) return; // nothing to show
        totalCells += 1;
        if (totalCells > LIMITS.maxCells) {
          throw new CostSheetParseError(`The workbook has more than ${LIMITS.maxCells} used cells.`);
        }
        const out = { c: colNumber };
        if (encoded.t) { out.v = encoded.v; out.t = encoded.t; }
        if (formula) out.f = clip(formula);
        if (cell.numFmt && cell.numFmt !== 'General') out.nf = clip(cell.numFmt);
        if (style) out.s = style;
        cells.push(out);
      });
      if (cells.length || row.height) {
        rows.push({ r: rowNumber, h: row.height || null, hidden: !!row.hidden, cells });
      }
    });

    return {
      name: clip(ws.name),
      colWidths,
      merges: Array.isArray(ws.model.merges) ? ws.model.merges.slice(0, 2000).sort() : [],
      rows,
    };
  });

  if (totalCells === 0) throw new CostSheetParseError('The workbook is empty.');
  return { snapshot: { sheets }, stats: { sheets: sheets.length, cells: totalCells } };
}

const BORDER_SIDES = { t: 'top', r: 'right', b: 'bottom', l: 'left' };

function buildWorkbookFromSnapshot(snapshot) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Royal Shipment Tracker';
  workbook.created = new Date();

  (snapshot?.sheets || []).forEach((sheet, index) => {
    const ws = workbook.addWorksheet(String(sheet.name || `Sheet${index + 1}`).slice(0, 31).replace(/[\\/?*[\]:]/g, '_'));

    (sheet.colWidths || []).forEach((px, i) => {
      const col = ws.getColumn(i + 1);
      if (px === 0) col.hidden = true;
      else if (px) col.width = Math.max(1, (px - 5) / 7);
    });

    (sheet.rows || []).forEach((row) => {
      const wsRow = ws.getRow(row.r);
      if (row.h) wsRow.height = row.h;
      if (row.hidden) wsRow.hidden = true;
      (row.cells || []).forEach((cell) => {
        const target = ws.getCell(row.r, cell.c);
        let value = cell.v ?? null;
        if (cell.t === 'd' && value) value = new Date(value);
        if (cell.t === 'e') value = { error: value };
        if (cell.f) target.value = { formula: cell.f, result: value ?? undefined };
        else if (value !== null) target.value = value;
        if (cell.nf) target.numFmt = cell.nf;

        const s = cell.s || {};
        const font = {};
        if (s.b) font.bold = true;
        if (s.i) font.italic = true;
        if (s.fs) font.size = s.fs;
        if (s.fc) font.color = { argb: `FF${s.fc}` };
        if (Object.keys(font).length) target.font = font;
        if (s.bg) target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${s.bg}` } };
        if (s.ha || s.va || s.wrap) {
          target.alignment = { horizontal: s.ha, vertical: s.va, wrapText: !!s.wrap };
        }
        if (s.bd) {
          const border = {};
          Object.entries(s.bd).forEach(([k, style]) => { border[BORDER_SIDES[k]] = { style }; });
          target.border = border;
        }
      });
    });

    (sheet.merges || []).forEach((range) => {
      try { ws.mergeCells(range); } catch (err) { /* overlapping merge in a damaged file: skip it */ }
    });
  });

  return workbook;
}

// ---- Cost lines (the numbered cost rows) ---------------------------------------------------------

const { round2, computeTotals } = require('./costLines');

const textOf = (cell) => (cell && cell.v != null ? String(cell.v).trim() : '');
const lower = (s) => s.toLowerCase();
const isSnHeader = (s) => /^(sn|s\.?\s*no|sl\.?\s*no)\.?$/i.test(s.trim());
const normFormula = (f) => String(f || '').replace(/[\s$=]/g, '').toUpperCase();
const colLetter = (c) => { let s = ''; let n = c; while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };

const numberOf = (cell) => {
  if (!cell || cell.v == null) return null;
  if (typeof cell.v === 'number') return Number.isFinite(cell.v) ? cell.v : null;
  if (cell.t === 's') {
    const n = Number(String(cell.v).replace(/,/g, '').trim());
    return String(cell.v).trim() !== '' && Number.isFinite(n) ? n : null;
  }
  return null;
};

const stringOf = (cell) => {
  if (!cell || cell.v == null) return '';
  if (cell.t === 'd') return String(cell.v).slice(0, 10);
  return String(cell.v).trim();
};

// Finds the cost table by its header text (SN / Description / Cost) and reads every numbered row after it
// until the TOTAL row. The number of lines is whatever the sheet has. Everything after the TOTAL row
// (other streams, item/landed-cost tables, signatures) is ignored.
// Returns { found, lines, warnings, sheetName }.
function extractCostLines(snapshot) {
  const warnings = [];
  for (const sheet of snapshot?.sheets || []) {
    const rowsByNo = new Map((sheet.rows || []).map((r) => [r.r, new Map((r.cells || []).map((c) => [c.c, c]))]));
    const rowNumbers = [...rowsByNo.keys()].sort((a, b) => a - b);

    let headerRow = null;
    for (const rn of rowNumbers) {
      const cells = rowsByNo.get(rn);
      const texts = [...cells.entries()].map(([c, cell]) => [c, lower(textOf(cell))]);
      const sn = texts.find(([, t]) => isSnHeader(t));
      const desc = texts.find(([, t]) => t.startsWith('description'));
      const cost = texts.find(([, t]) => /\bcost\b/.test(t));
      if (sn && desc && cost) { headerRow = { rn, texts, sn: sn[0], desc: desc[0], cost: cost[0] }; break; }
    }
    if (!headerRow) continue;

    const { texts } = headerRow;
    const billCols = texts.filter(([, t]) => /^bill\s*ref/.test(t)).map(([c]) => c);
    const payCol = (texts.find(([, t]) => t.startsWith('payment')) || [])[0];
    const remarkCol = (texts.find(([, t]) => t.startsWith('remark')) || [])[0];
    const rhgtCol = (texts.find(([, t]) => /rhgt/.test(t)) || [])[0];
    const silalCol = (texts.find(([, t]) => /silal/.test(t)) || [])[0];
    const cols = {
      sn: headerRow.sn,
      desc: headerRow.desc,
      cost: headerRow.cost,
      billNo: billCols[0],
      billParty: billCols[1],
      pay: payCol,
      remark: remarkCol && remarkCol !== payCol ? remarkCol : undefined,
      rhgt: rhgtCol,
      silal: silalCol,
    };

    const lines = [];
    let totalRow = null;
    let prev = headerRow.rn;
    for (const rn of rowNumbers.filter((n) => n > headerRow.rn)) {
      const cells = rowsByNo.get(rn);
      const isTotal = [...cells.entries()].some(([c, cell]) => c <= Math.max(cols.desc, cols.sn) && /^total\b/i.test(textOf(cell)));
      if (isTotal) { totalRow = cells; break; }
      const sn = numberOf(cells.get(cols.sn));
      if (rn !== prev + 1 || sn == null || !Number.isInteger(sn)) break;
      prev = rn;

      const get = (c) => (c ? cells.get(c) : undefined);
      const cost = numberOf(get(cols.cost));
      const costCell = get(cols.cost);
      if (costCell?.f && cost == null) warnings.push(`Line ${sn}: Cost DH is a formula without a saved value; left blank.`);

      let rhgt = numberOf(get(cols.rhgt));
      let silal = numberOf(get(cols.silal));
      if (rhgt == null && cols.rhgt && get(cols.rhgt)?.f && cost != null && normFormula(get(cols.rhgt).f) === `${colLetter(cols.cost)}${rn}`) rhgt = cost;
      if (silal == null && cols.silal && get(cols.silal)?.f && cost != null && rhgt != null
        && normFormula(get(cols.silal).f) === `${colLetter(cols.cost)}${rn}-${colLetter(cols.rhgt)}${rn}`) silal = round2(cost - rhgt);
      if (cost != null) {
        if (rhgt == null && silal != null) rhgt = round2(cost - silal);
        else if (silal == null && rhgt != null) silal = round2(cost - rhgt);
        else if (rhgt == null && silal == null) {
          rhgt = cost; silal = 0; // sheet default: RHGT bears the cost unless Silal's share is stated
          if (cols.rhgt || cols.silal) warnings.push(`Line ${sn}: Borne by could not be read from the file; RHGT bears the full cost. Check it.`);
        }
      }

      lines.push({
        sn,
        description: stringOf(get(cols.desc)),
        costDh: cost == null ? null : round2(cost),
        billRefNo: stringOf(get(cols.billNo)),
        billRefParty: stringOf(get(cols.billParty)),
        paymentReference: stringOf(get(cols.pay)),
        remarks: stringOf(get(cols.remark)),
        borneByRhgt: rhgt == null ? null : round2(rhgt),
        borneBySilal: silal == null ? null : round2(silal),
      });
    }

    if (totalRow) {
      const totals = computeTotals(lines);
      [['cost', 'costDh', 'Cost DH'], ['rhgt', 'borneByRhgt', 'Borne By RHGT'], ['silal', 'borneBySilal', 'Borne by Silal']].forEach(([key, field, label]) => {
        const stated = numberOf(totalRow.get(cols[key]));
        if (cols[key] && stated != null && Math.abs(stated - totals[field]) > 0.01) {
          warnings.push(`${label} total in the file (${stated}) differs from the imported lines (${totals[field]}). Check the lines.`);
        }
      });
    }
    if (!lines.length) warnings.push('The cost table has no numbered lines.');
    return { found: true, lines, warnings, sheetName: sheet.name };
  }
  return { found: false, lines: [], warnings: ['Could not find the cost table (SN / Description / Cost DH) in the file. The sheet is imported and viewable, but there are no lines to edit.'], sheetName: '' };
}

const LINE_COLUMNS = [
  { header: 'SN', key: 'sn', width: 6 },
  { header: 'Description', key: 'description', width: 36 },
  { header: 'Cost DH', key: 'costDh', width: 14, numeric: true },
  { header: 'Bill Ref. (No / Date)', key: 'billRefNo', width: 26 },
  { header: 'Bill Ref. (Party)', key: 'billRefParty', width: 24 },
  { header: 'Payment Reference', key: 'paymentReference', width: 22 },
  { header: 'Remarks', key: 'remarks', width: 24 },
  { header: 'Borne By RHGT', key: 'borneByRhgt', width: 16, numeric: true },
  { header: 'Borne by Silal', key: 'borneBySilal', width: 16, numeric: true },
];

// Excel of the saved (possibly edited) lines + a TOTAL row with real SUM formulas, for any number of lines.
function buildWorkbookFromLines(lines, meta = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Royal Shipment Tracker';
  workbook.created = new Date();
  const ws = workbook.addWorksheet('Payment Costing');
  LINE_COLUMNS.forEach((col, i) => { ws.getColumn(i + 1).width = col.width; });

  ws.getCell('A1').value = 'ROYAL HORIZON GENERAL TRADING';
  ws.getCell('A1').font = { bold: true, size: 12 };
  ws.getCell('A2').value = ['Payment Costing', meta.shipmentNo, meta.blNo ? `BL ${meta.blNo}` : ''].filter(Boolean).join(' | ');
  ws.getCell('A2').font = { bold: true };

  const headerRowNo = 4;
  const header = ws.getRow(headerRowNo);
  LINE_COLUMNS.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  const first = headerRowNo + 1;
  (lines || []).forEach((line, idx) => {
    const row = ws.getRow(first + idx);
    LINE_COLUMNS.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      const value = line[col.key];
      cell.value = value === '' ? null : value;
      if (col.numeric) cell.numFmt = '#,##0.00';
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const last = Math.max(first, first + (lines || []).length - 1);
  const totals = computeTotals(lines);
  const totalRow = ws.getRow(first + (lines || []).length);
  totalRow.getCell(1).value = 'TOTAL';
  [['C', 'costDh'], ['H', 'borneByRhgt'], ['I', 'borneBySilal']].forEach(([letter, field]) => {
    const cell = totalRow.getCell(letter);
    cell.value = { formula: `SUM(${letter}${first}:${letter}${last})`, result: totals[field] };
    cell.numFmt = '#,##0.00';
  });
  for (let i = 1; i <= LINE_COLUMNS.length; i += 1) {
    const cell = totalRow.getCell(i);
    cell.font = { bold: true };
    cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  }
  ws.views = [{ state: 'frozen', ySplit: headerRowNo }];
  return workbook;
}

module.exports = { parseCostSheetWorkbook, buildWorkbookFromSnapshot, buildWorkbookFromLines, extractCostLines, CostSheetParseError, LIMITS };
