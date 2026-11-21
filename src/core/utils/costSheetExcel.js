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

module.exports = { parseCostSheetWorkbook, buildWorkbookFromSnapshot, CostSheetParseError, LIMITS };
