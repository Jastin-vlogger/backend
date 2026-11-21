const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { parseCostSheetWorkbook, buildWorkbookFromSnapshot, CostSheetParseError, LIMITS } = require('./costSheetExcel');

const makeWorkbookBuffer = async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('COST-40');
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 14;
  ws.mergeCells('A1:C1');
  ws.getCell('A1').value = 'ROYAL HORIZON GENERAL TRADING';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEEFF' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.getCell('B3').value = 'Date';
  ws.getCell('C3').value = new Date('2026-07-22T00:00:00.000Z');
  ws.getCell('C3').numFmt = 'dd/mm/yyyy';
  ws.getRow(5).height = 24;
  ['SN.', 'Description', 'Cost DH'].forEach((h, i) => { ws.getCell(5, i + 1).value = h; ws.getCell(5, i + 1).font = { bold: true }; });
  ws.getCell('A6').value = 1; ws.getCell('B6').value = 'Invoice Attestation'; ws.getCell('C6').value = 302.15;
  ws.getCell('A7').value = 2; ws.getCell('B7').value = 'DO Fee'; ws.getCell('C7').value = 575;
  ws.getCell('C6').numFmt = '#,##0.00'; ws.getCell('C7').numFmt = '#,##0.00';
  ws.getCell('B8').value = 'TOTAL';
  ws.getCell('C8').value = { formula: 'SUM(C6:C7)', result: 877.15 };
  ws.getCell('C8').numFmt = '#,##0.00';
  ws.getCell('C9').value = { formula: 'C8/0', result: { error: '#DIV/0!' } };
  ws.getCell('A10').border = { top: { style: 'thin' }, bottom: { style: 'thin' } }; // styled but empty
  const hidden = wb.addWorksheet('hidden'); hidden.state = 'hidden'; hidden.getCell('A1').value = 'secret';
  const second = wb.addWorksheet('Items'); second.getCell('A1').value = 'Item'; second.getCell('B1').value = true;
  return Buffer.from(await wb.xlsx.writeBuffer());
};

test('parses values, formulas, merges, widths, styles and skips hidden sheets', async () => {
  const { snapshot, stats } = await parseCostSheetWorkbook(await makeWorkbookBuffer());
  assert.equal(snapshot.sheets.length, 2);
  assert.deepEqual(snapshot.sheets.map((s) => s.name), ['COST-40', 'Items']);
  const sheet = snapshot.sheets[0];
  assert.deepEqual(sheet.merges, ['A1:C1']);
  assert.ok(sheet.colWidths[1] > sheet.colWidths[0]);

  const cell = (r, c) => sheet.rows.find((row) => row.r === r)?.cells.find((x) => x.c === c);
  assert.equal(cell(1, 1).v, 'ROYAL HORIZON GENERAL TRADING');
  assert.equal(cell(1, 1).s.b, 1);
  assert.equal(cell(1, 1).s.bg, 'DDEEFF');
  assert.equal(cell(1, 1).s.ha, 'center');
  assert.equal(cell(3, 3).t, 'd');
  assert.equal(cell(3, 3).nf, 'dd/mm/yyyy');
  assert.equal(cell(6, 3).v, 302.15);
  assert.equal(cell(8, 3).f, 'SUM(C6:C7)');
  assert.equal(cell(8, 3).v, 877.15);
  assert.equal(cell(9, 3).t, 'e');
  assert.equal(cell(9, 3).v, '#DIV/0!');
  assert.equal(cell(10, 1).s.bd.t, 'thin'); // empty but bordered cell kept
  assert.equal(sheet.rows.find((row) => row.r === 5).h, 24);
  assert.ok(stats.cells >= 12);
  assert.equal(JSON.stringify(snapshot).includes('secret'), false);
});

test('round trip: snapshot -> workbook -> snapshot keeps cells, formulas and merges', async () => {
  const first = await parseCostSheetWorkbook(await makeWorkbookBuffer());
  const rebuilt = buildWorkbookFromSnapshot(first.snapshot);
  const second = await parseCostSheetWorkbook(Buffer.from(await rebuilt.xlsx.writeBuffer()));

  assert.equal(second.stats.cells, first.stats.cells);
  assert.deepEqual(second.snapshot.sheets.map((s) => s.merges), first.snapshot.sheets.map((s) => s.merges));
  const formulas = (snap) => snap.sheets.flatMap((s) => s.rows.flatMap((r) => r.cells.filter((c) => c.f).map((c) => `${r.r}:${c.c}=${c.f}`)));
  assert.deepEqual(formulas(second.snapshot), formulas(first.snapshot));
  const values = (snap) => snap.sheets.flatMap((s) => s.rows.flatMap((r) => r.cells.map((c) => `${r.r}:${c.c}=${c.v}`)));
  assert.deepEqual(values(second.snapshot), values(first.snapshot));
});

test('rejects files that are not Excel workbooks', async () => {
  await assert.rejects(parseCostSheetWorkbook(Buffer.from('not an excel file')), CostSheetParseError);
});

test('rejects an empty workbook', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Empty');
  await assert.rejects(parseCostSheetWorkbook(Buffer.from(await wb.xlsx.writeBuffer())), /empty/i);
});

test('rejects a workbook with too many sheets', async () => {
  const wb = new ExcelJS.Workbook();
  for (let i = 0; i <= LIMITS.maxSheets; i += 1) wb.addWorksheet(`S${i}`).getCell('A1').value = i;
  await assert.rejects(parseCostSheetWorkbook(Buffer.from(await wb.xlsx.writeBuffer())), /sheets/i);
});
