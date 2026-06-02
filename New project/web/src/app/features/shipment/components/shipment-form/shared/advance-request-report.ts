import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface AdvanceRequestReportLineItem {
  sn: number | string;
  description: string;
  qty: number | string;
  rate: number | string;
  amount: number | string;
  actualPaid?: number | string;
  difference?: number | string;
  paymentReference?: string;
}

export interface AdvanceRequestReportConfig {
  fileStem: string;
  sourceLabel: string;
  reportDate: string;
  boeDate: string;
  vendor: string;
  country: string;
  shipmentNo: string;
  shippingLine: string;
  invoiceAmountFC: string;
  blNo: string;
  exchangeRate: string;
  noOfContainers: string;
  invoiceAmountAED: string;
  loadingPort: string;
  despatchPort: string;
  incoTerms: string;
  supplierInvoiceNo: string;
  eta: string;
  item: string;
  planningToReleaseDate: string;
  noOfDaysAtPort: string;
  storage: string;
  downloadedBy: string;
  preparedBy?: string;
  approvedBy?: string;
  lines: AdvanceRequestReportLineItem[];
}

function formatNumber(value: unknown, fallback = ''): string {
  if (value === '' || value == null) return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return String(value);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalized);
}

function safe(value: unknown, fallback = '—'): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

export function downloadAdvanceRequestReportPdf(config: AdvanceRequestReportConfig): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ROYAL HORIZON GENERAL TRADING LLC', margin, 24);
  doc.setFontSize(8);
  doc.text('IMPORT SHIPPING CLEARING ADVANCE & REIMBURSEMENT', margin, 35);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text(`Source: ${safe(config.sourceLabel)}`, pageWidth - margin, 24, { align: 'right' });
  doc.text(`Generated: ${safe(config.reportDate)}`, pageWidth - margin, 35, { align: 'right' });
  doc.setTextColor(0);

  const infoRows: string[][] = [
    ['BOE Date', safe(config.boeDate), 'Vendor / Supplier', safe(config.vendor), 'Country', safe(config.country)],
    ['Shipment No.', safe(config.shipmentNo), 'Shipping Line', safe(config.shippingLine), 'BL No.', safe(config.blNo)],
    ['Invoice Amount FC', safe(config.invoiceAmountFC), 'Exchange Rate', safe(config.exchangeRate), 'No of Containers', safe(config.noOfContainers)],
    ['Invoice Amount AED', safe(config.invoiceAmountAED), 'Loading Port', safe(config.loadingPort), 'Despatch Port', safe(config.despatchPort)],
    ['Inco Terms', safe(config.incoTerms), 'Supplier Invoice No.', safe(config.supplierInvoiceNo), 'ETA', safe(config.eta)],
    ['Item', safe(config.item), 'Planning to Release Dt', safe(config.planningToReleaseDate), 'No of Days at Port', safe(config.noOfDaysAtPort)],
    ['Storage (WH)', safe(config.storage), '', '', '', ''],
  ];

  autoTable(doc, {
    startY: 44,
    body: infoRows,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
      lineWidth: 0.2,
      lineColor: [160, 160, 160],
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [247, 248, 250], cellWidth: contentWidth * 0.12 },
      1: { cellWidth: contentWidth * 0.22 },
      2: { fontStyle: 'bold', fillColor: [247, 248, 250], cellWidth: contentWidth * 0.12 },
      3: { cellWidth: contentWidth * 0.22 },
      4: { fontStyle: 'bold', fillColor: [247, 248, 250], cellWidth: contentWidth * 0.12 },
      5: { cellWidth: contentWidth * 0.20 },
    },
    margin: { left: margin, right: margin },
    tableLineWidth: 0.4,
    tableLineColor: [0, 0, 0],
  });

  const tableRows = config.lines.map((line) => [
    String(line.sn),
    safe(line.description),
    formatNumber(line.qty, ''),
    formatNumber(line.rate, ''),
    formatNumber(line.amount, ''),
    formatNumber(line.actualPaid, ''),
    formatNumber(line.difference, ''),
    safe(line.paymentReference, ''),
  ]);

  const totals = config.lines.reduce(
    (acc, line) => ({
      amount: acc.amount + (Number(line.amount) || 0),
      actualPaid: acc.actualPaid + (Number(line.actualPaid) || 0),
      difference: acc.difference + (Number(line.difference) || 0),
    }),
    { amount: 0, actualPaid: 0, difference: 0 }
  );

  tableRows.push([
    '',
    'TOTAL',
    '',
    '',
    formatNumber(totals.amount),
    formatNumber(totals.actualPaid),
    formatNumber(totals.difference),
    '',
  ]);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    head: [['S. No.', 'Description', 'Qty', 'Rate', 'Amount', 'Actual Paid', 'Different', 'Payment Ref./Remarks']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      lineWidth: 0.2,
      lineColor: [160, 160, 160],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: 0,
      fontStyle: 'bold',
      fontSize: 6.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 34, halign: 'center' },
      1: { cellWidth: 220 },
      2: { cellWidth: 52, halign: 'right' },
      3: { cellWidth: 52, halign: 'right' },
      4: { cellWidth: 72, halign: 'right' },
      5: { cellWidth: 72, halign: 'right' },
      6: { cellWidth: 72, halign: 'right' },
      7: { cellWidth: 'auto' },
    },
    didParseCell: (data: any) => {
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [244, 244, 244];
      }
    },
    margin: { left: margin, right: margin },
    tableLineWidth: 0.4,
    tableLineColor: [0, 0, 0],
  });

  let y = (doc as any).lastAutoTable.finalY + 14;
  if (y > pageHeight - 78) {
    doc.addPage();
    y = margin;
  }

  const summaryBody = [
    ['Paid by A/c.', '', 'Paid by', '', 'Other', ''],
    ['To be paid to Transporter', '', 'To be paid to Offloader', '', 'Notes', ''],
  ];

  autoTable(doc, {
    startY: y,
    body: summaryBody,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: { top: 8, bottom: 8, left: 4, right: 4 },
      lineWidth: 0.2,
      lineColor: [160, 160, 160],
      minCellHeight: 26,
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [247, 248, 250], cellWidth: 92 },
      1: { cellWidth: 150 },
      2: { fontStyle: 'bold', fillColor: [247, 248, 250], cellWidth: 68 },
      3: { cellWidth: 150 },
      4: { fontStyle: 'bold', fillColor: [247, 248, 250], cellWidth: 52 },
      5: { cellWidth: 'auto' },
    },
    margin: { left: margin, right: margin },
    tableLineWidth: 0.4,
    tableLineColor: [0, 0, 0],
  });

  y = (doc as any).lastAutoTable.finalY + 24;
  const signatureLabels = ['PREPARED BY', 'APPROVED BY', 'A/C APPROVAL'];
  const signatureWidth = contentWidth / signatureLabels.length;
  signatureLabels.forEach((label, index) => {
    const x = margin + index * signatureWidth;
    const value = index === 0 ? config.preparedBy : index === 1 ? config.approvedBy : '';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(label, x + 6, y);
    if (value) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(safe(value), x + 6, y + 17, { maxWidth: signatureWidth - 16 });
    }
    doc.setDrawColor(120);
    doc.setLineWidth(0.4);
    doc.line(x + 6, y + 24, x + signatureWidth - 10, y + 24);
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(130);
  doc.text(
    `Generated by Royal Shipment Tracker | Downloaded by: ${safe(config.downloadedBy, 'Unknown user')}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  );
  doc.setTextColor(0);
  doc.save(`${config.fileStem.replace(/[^a-z0-9_-]/gi, '_')}.pdf`);
}
