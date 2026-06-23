const {
  Shipment,
  Container,
  AuditLog,
  getShipmentReportStatus,
  getComputedShipmentStatus,
  getComputedContainerShipmentStatus,
  ensureBlRowDefinitionsSeeded,
  buildShipmentReportRows,
  selectReportColumns,
  buildShipmentReportExportRows,
  formatDateTimeValue,
  ExcelJS,
  PDFDocument,
  normalizeRole,
  hasMeaningfulActualData,
  buildDashboardRStatusMetrics,
  buildDashboardStatusPivot,
  toSignedDocument,
  createSignedGetUrl,
  toPlainObject,
  hasValues,
  slugifyKey,
  normalizeVisibleTo,
  normalizeNumericDefault,
  SHIPMENT_REPORT_COLUMNS,
  SHIPMENT_REPORT_CHILD_COLUMNS,
  REPORT_STATUS_ETD_UNCONFIRMED,
  REPORT_STATUS_ETD_DUE,
  getShipmentSplitCount,
  getDashboardStatusColumn,
  getDashboardChildQuantity,
  getDashboardChildFcl,
} = require('./shipment.helper');

const buildShipmentListQuery = ({ search = '', status = '', shipmentIds = null, commercialInvoiceShipmentIds = null }) => {
  const query = {};
  const normalizedSearch = String(search || '').trim();
  const normalizedStatus = String(status || '').trim();

  if (Array.isArray(shipmentIds)) {
    query._id = { $in: shipmentIds };
  }

  if (normalizedSearch) {
    query.$or = [
      { shipmentNo: { $regex: normalizedSearch, $options: 'i' } },
      { orderNumber: { $regex: normalizedSearch, $options: 'i' } },
      { piNo: { $regex: normalizedSearch, $options: 'i' } },
      { fpoNo: { $regex: normalizedSearch, $options: 'i' } },
      { supplierName: { $regex: normalizedSearch, $options: 'i' } },
      { itemDescription: { $regex: normalizedSearch, $options: 'i' } },
      { brandName: { $regex: normalizedSearch, $options: 'i' } },
    ];

    if (Array.isArray(commercialInvoiceShipmentIds) && commercialInvoiceShipmentIds.length) {
      query.$or.push({ _id: { $in: commercialInvoiceShipmentIds } });
    }
  }

  if (normalizedStatus) {
    query.currentStage = normalizedStatus;
  }

  return query;
};

const getCommercialInvoiceShipmentIds = async (search = '') => {
  const normalizedSearch = String(search || '').trim();
  if (!normalizedSearch) return [];

  const containers = await Container.find({
    'actual.commercialInvoiceNo': { $regex: normalizedSearch, $options: 'i' },
  })
    .select('shipmentId')
    .lean();

  return [
    ...new Set(
      containers
        .map((container) => String(container.shipmentId || ''))
        .filter(Boolean)
    ),
  ];
};

const getActualWorkflowShipmentIds = async () => {
  const containers = await Container.find({ actual: { $exists: true, $ne: null } })
    .select('shipmentId actual')
    .lean();

  return [
    ...new Set(
      containers
        .filter((container) => hasMeaningfulActualData(container))
        .map((container) => String(container.shipmentId))
        .filter(Boolean)
    ),
  ];
};

const shouldRestrictShipmentListForPendingBlRoles = (user) =>
  normalizeRole(user?.role || '') === 'Logistic';

const fetchShipmentList = async ({ page = 1, limit = 20, search = '', status = '', user = null }) => {
  const actualWorkflowShipmentIds = shouldRestrictShipmentListForPendingBlRoles(user)
    ? await getActualWorkflowShipmentIds()
    : null;
  const commercialInvoiceShipmentIds = await getCommercialInvoiceShipmentIds(search);
  const query = buildShipmentListQuery({
    search,
    status,
    shipmentIds: actualWorkflowShipmentIds,
    commercialInvoiceShipmentIds,
  });
  const total = await Shipment.countDocuments(query);

  const shipments = await Shipment.find(query)
    .populate("supplierId", "name")
    .populate("itemId", "description")
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ orderDate: -1, createdAt: -1 });

  const shipmentIds = shipments.map((shipment) => shipment._id);
  const containers = await Container.find({ shipmentId: { $in: shipmentIds } }).lean();
  const containerMap = new Map();
  containers.forEach((container) => {
    const key = String(container.shipmentId);
    if (!containerMap.has(key)) {
      containerMap.set(key, []);
    }
    containerMap.get(key).push(container);
  });

  const formatted = shipments.map(s => ({
    _id: s._id,
    year: s.year,
    shipmentNo: s.shipmentNo,
    orderNumber: s.orderNumber,
    orderDate: s.orderDate,
    supplier: s.supplierId?.name || s.supplierName || null,
    description: s.itemId?.description || s.itemDescription || null,
    buyingQty: s.plannedQtyMT || s.totalOrderedQtyMT || 0,
    fcPerUnit: s.fcPerUnit || 0,
    totalFC: s.totalFC || 0,
    noOfShipments: s.noOfShipments || s.assumedContainerCount || 0,
    status: getShipmentReportStatus(s, containerMap.get(String(s._id)) || [])
  }));

  return {
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    totalRecords: total,
    shipments: formatted
  };
};

exports.getBlRowDefinitions = async (_req, res) => {
  try {
    const rows = await ensureBlRowDefinitionsSeeded();
    return res.status(200).json({
      rows: rows.map((row) => ({
        key: row.key || slugifyKey(row.description),
        sn: Number(row.sn) || 0,
        description: row.description,
        visibleTo: normalizeVisibleTo(row.visibleTo),
        defaultQty: normalizeNumericDefault(row.defaultQty, 1),
        defaultRate: normalizeNumericDefault(row.defaultRate, 0),
        isActive: row.isActive !== false,
      })),
    });
  } catch (error) {
    console.error('Error loading BL row definitions:', error);
    return res.status(500).json({ message: 'Unable to load BL row definitions' });
  }
};

exports.getAllShipments = async (req, res) => {
  try {
    let { page = 1, limit = 20, search = '', status = '' } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const result = await fetchShipmentList({ page, limit, search, status, user: req.user });
    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.searchShipments = async (req, res) => {
  try {
    let { page = 1, limit = 20, q = '', status = '' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const result = await fetchShipmentList({ page, limit, search: q, status, user: req.user });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getShipmentReportExportData = async (req, res) => {
  try {
    const rows = await buildShipmentReportRows(req.query);

    return res.status(200).json({
      rows,
      totalRecords: rows.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Unable to prepare shipment export data' });
  }
};

exports.downloadShipmentReportExcel = async (req, res) => {
  try {
    const rows = await buildShipmentReportRows(req.query);
    const parentColumns = selectReportColumns(SHIPMENT_REPORT_COLUMNS, req.query.columns);
    const childColumns = selectReportColumns(SHIPMENT_REPORT_CHILD_COLUMNS, req.query.childColumns);
    const flattenedRows = buildShipmentReportExportRows(rows, parentColumns, childColumns);
    const downloadedBy = req.user?.name || 'Royal Horizon User';
    const downloadedAt = formatDateTimeValue(new Date());
    const title = 'Royal Horizon Group';
    const subtitle = 'Shipment Master Report';
    const totalColumns = Math.max(parentColumns.length, childColumns.length + 1);
    const childExcelStartCol = 2;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Shipment Report', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    const borderDark = { style: 'thin', color: { argb: 'FF0F172A' } };
    const borderSlate = { style: 'thin', color: { argb: 'FF94A3B8' } };
    const borderLight = { style: 'thin', color: { argb: 'FFCBD5E1' } };
    const fullDarkBorder = { top: borderDark, bottom: borderDark, left: borderDark, right: borderDark };
    const fullSlateBorder = { top: borderSlate, bottom: borderSlate, left: borderSlate, right: borderSlate };
    const fullLightBorder = { top: borderLight, bottom: borderLight, left: borderLight, right: borderLight };

    const defaultCellStyle = {
      font: { name: 'Calibri', size: 11 },
      alignment: { vertical: 'middle', horizontal: 'left' },
      border: fullDarkBorder,
    };
    const headerCellStyle = {
      font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF475569' } },
      alignment: { vertical: 'middle', horizontal: 'left' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } },
      border: fullDarkBorder,
    };
    const childHeaderStyle = {
      font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
      border: fullSlateBorder,
    };
    const childHeaderHighlightStyle = {
      font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF78350F' } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } },
      border: fullSlateBorder,
    };
    const childCellStyle = {
      font: { name: 'Calibri', size: 11 },
      alignment: { vertical: 'middle', horizontal: 'center' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } },
      border: fullLightBorder,
    };
    const childHighlightCellStyle = {
      font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1F2937' } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
      border: fullLightBorder,
    };

    worksheet.columns = Array.from({ length: totalColumns }, (_, index) => {
      const column = parentColumns[index] || childColumns[index - 1] || { key: `extra_${index}`, width: 14 };
      return {
        key: column.key,
        width: Math.max(column.width, 12),
      };
    });

    worksheet.addRow([title]);
    worksheet.addRow([subtitle]);
    const metaRow = worksheet.addRow([
      `Downloaded By: ${downloadedBy}`,
      ...Array.from({ length: totalColumns - 2 }, () => ''),
      `Downloaded At: ${downloadedAt}`,
    ]);
    const headerRow = worksheet.addRow([
      ...parentColumns.map((column) => column.header),
      ...Array.from({ length: totalColumns - parentColumns.length }, () => ''),
    ]);

    const titleRowNumber = 1;
    const subtitleRowNumber = 2;
    worksheet.mergeCells(titleRowNumber, 1, titleRowNumber, totalColumns);
    worksheet.mergeCells(subtitleRowNumber, 1, subtitleRowNumber, totalColumns);

    worksheet.getRow(titleRowNumber).height = 20;
    worksheet.getRow(subtitleRowNumber).height = 18;
    metaRow.height = 18;
    headerRow.height = 22;

    worksheet.getCell(titleRowNumber, 1).font = { name: 'Calibri', size: 14, bold: true };
    worksheet.getCell(subtitleRowNumber, 1).font = { name: 'Calibri', size: 12, bold: true };
    worksheet.getCell(titleRowNumber, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getCell(subtitleRowNumber, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getCell(titleRowNumber, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    worksheet.getCell(subtitleRowNumber, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

    headerRow.eachCell((cell) => {
      cell.font = headerCellStyle.font;
      cell.alignment = headerCellStyle.alignment;
      cell.fill = headerCellStyle.fill;
      cell.border = headerCellStyle.border;
    });

    const childHighlightColumns = [childExcelStartCol, childExcelStartCol + 1];

    flattenedRows.forEach((row) => {
      const excelRow = worksheet.addRow(row.values);

      if (row?.rowType === 'spacer') {
        excelRow.height = 12;
        return;
      }

      if (row?.rowType === 'childHeader') {
        excelRow.height = 21;
      } else if (row?.rowType === 'child') {
        excelRow.height = 20;
      } else {
        excelRow.height = 18;
      }

      excelRow.eachCell((cell, colNumber) => {
        if (row?.rowType === 'childHeader') {
          if (colNumber < childExcelStartCol || colNumber >= childExcelStartCol + childColumns.length) {
            return;
          }
          const style = childHighlightColumns.includes(colNumber)
            ? childHeaderHighlightStyle
            : childHeaderStyle;
          cell.font = style.font;
          cell.alignment = style.alignment;
          cell.fill = style.fill;
          cell.border = style.border;
          return;
        }

        if (row?.rowType === 'child') {
          if (colNumber < childExcelStartCol || colNumber >= childExcelStartCol + childColumns.length) {
            return;
          }
          const style = childHighlightColumns.includes(colNumber)
            ? childHighlightCellStyle
            : childCellStyle;
          cell.font = style.font;
          cell.alignment = style.alignment;
          cell.fill = style.fill;
          cell.border = style.border;
          return;
        }

        cell.font = defaultCellStyle.font;
        cell.alignment = defaultCellStyle.alignment;
        cell.border = defaultCellStyle.border;
      });
    });

    worksheet.addRow([]);
    const footerRow = worksheet.addRow(['Printed from Royal Horizon Systems']);
    worksheet.mergeCells(footerRow.number, 1, footerRow.number, totalColumns);
    footerRow.height = 18;
    worksheet.getCell(footerRow.number, 1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF64748B' } };
    worksheet.getCell(footerRow.number, 1).alignment = { horizontal: 'left', vertical: 'middle' };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `royal-horizon-shipment-report-${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Unable to generate Excel report' });
  }
};

exports.downloadShipmentReportPdf = async (req, res) => {
  try {
    const rows = await buildShipmentReportRows(req.query);
    const parentColumns = selectReportColumns(SHIPMENT_REPORT_COLUMNS, req.query.columns);
    const childColumns = selectReportColumns(SHIPMENT_REPORT_CHILD_COLUMNS, req.query.childColumns);
    const flattenedRows = buildShipmentReportExportRows(rows, parentColumns, childColumns);
    const downloadedBy = req.user?.name || 'Royal Horizon User';
    const downloadedAt = formatDateTimeValue(new Date());
    const filename = `royal-horizon-shipment-report-${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      size: 'A3',
      layout: 'landscape',
      margin: 34,
      bufferPages: true,
    });

    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const startX = 34;
    const usableWidth = pageWidth - startX * 2;
    const tableTop = 120;
    const minRowHeight = 24;
    const footerY = pageHeight - 24;
    const exportColumnCount = Math.max(parentColumns.length, childColumns.length + 1);
    const pdfColumns = Array.from({ length: exportColumnCount }, (_, index) =>
      parentColumns[index] || childColumns[index - 1] || { header: '', key: `extra_${index}`, width: 12 }
    );
    const getCellText = (row, index) => String(row?.values?.[index] ?? '');
    const baseWeightedWidths = (() => {
      const totalWeight = pdfColumns.reduce((sum, column) => sum + column.width, 0);
      return pdfColumns.map((column) => (column.width / totalWeight) * usableWidth);
    })();

    const computeContentAwareColumnWidths = () => {
      doc.font('Helvetica').fontSize(7.5);

      const desiredWidths = pdfColumns.map((column, index) => {
        const baseWidth = baseWeightedWidths[index];
        const minWidth = Math.max(Math.min(baseWidth * 0.72, 46), 28);
        const maxWidth = column.key === 'itemDescription'
          ? Math.max(baseWidth * 1.8, 120)
          : column.key === 'shipmentNo'
            ? Math.max(baseWidth * 1.6, 90)
            : ['supplier', 'portOfLoading', 'portOfDischarge', 'paymentTerms', 'shipmentStatus'].includes(column.key)
              ? Math.max(baseWidth * 1.45, 72)
              : Math.max(baseWidth * 1.3, 64);

        const longestWidth = flattenedRows.reduce((max, row) => {
          const value = getCellText(row, index);
          if (!value) return max;
          return Math.max(max, doc.widthOfString(value));
        }, doc.widthOfString(column.header));

        return Math.min(Math.max(longestWidth + 14, minWidth), maxWidth);
      });

      const totalDesiredWidth = desiredWidths.reduce((sum, width) => sum + width, 0);
      if (totalDesiredWidth <= usableWidth) {
        const extra = usableWidth - totalDesiredWidth;
        const weights = pdfColumns.map((column) =>
          ['shipmentNo', 'supplier', 'itemDescription', 'portOfLoading', 'portOfDischarge', 'paymentTerms', 'shipmentStatus'].includes(column.key) ? 2 : 1
        );
        const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
        return desiredWidths.map((width, index) => width + ((extra * weights[index]) / weightTotal));
      }

      const minimums = desiredWidths.map((width, index) => Math.max(Math.min(baseWeightedWidths[index] * 0.6, width), 26));
      const reducible = desiredWidths.reduce((sum, width, index) => sum + Math.max(width - minimums[index], 0), 0);
      if (reducible <= 0) {
        return baseWeightedWidths;
      }

      const overflow = totalDesiredWidth - usableWidth;
      return desiredWidths.map((width, index) => {
        const availableReduction = Math.max(width - minimums[index], 0);
        const reduction = (overflow * availableReduction) / reducible;
        return width - reduction;
      });
    };

    const columnWidths = computeContentAwareColumnWidths();

    const computeHeaderHeight = () => {
      doc.font('Helvetica-Bold').fontSize(8);
      return Math.max(
        minRowHeight,
        ...pdfColumns.map((column, index) =>
          doc.heightOfString(column.header, {
            width: Math.max(columnWidths[index] - 8, 10),
            align: 'left',
          }) + 10
        )
      );
    };

    const headerHeight = computeHeaderHeight();

    const computeRowHeight = (row) => {
      if (row.rowType === 'spacer') return 14;
      doc.font('Helvetica').fontSize(7.5);
      return Math.max(
        minRowHeight,
        ...pdfColumns.map((column, index) =>
          doc.heightOfString(getCellText(row, index), {
            width: Math.max(columnWidths[index] - 8, 10),
            align: 'left',
          }) + 10
        )
      );
    };

    const drawHeader = () => {
      doc.font('Helvetica-Bold').fontSize(24).text('Royal Horizon Group', startX, 26, { align: 'center', width: usableWidth });
      doc.font('Helvetica-Bold').fontSize(18).text('Shipment Master Report', startX, 56, { align: 'center', width: usableWidth });
      doc.font('Helvetica').fontSize(12).text(`Downloaded By: ${downloadedBy}`, startX, 92, { align: 'left', width: usableWidth / 2 });
      doc.font('Helvetica').fontSize(12).text(`Downloaded At: ${downloadedAt}`, startX, 92, { align: 'right', width: usableWidth });
    };

    const drawTableHeader = (y) => {
      let x = startX;
      doc.font('Helvetica-Bold').fontSize(8);
      pdfColumns.forEach((column, index) => {
        const width = columnWidths[index];
        doc.rect(x, y, width, headerHeight).fillAndStroke('#f1f5f9', '#0f172a');
        doc.fillColor('#0f172a').text(column.header, x + 4, y + 5, {
          width: width - 8,
          align: 'left',
        });
        x += width;
      });
      doc.fillColor('#0f172a');
    };

    const drawRow = (row, y, rowHeight) => {
      if (row.rowType === 'spacer') {
        return;
      }
      let x = startX;
      doc.font(row.rowType === 'childHeader' ? 'Helvetica-Bold' : 'Helvetica').fontSize(row.rowType === 'childHeader' ? 8 : 7.5);
      if (row.rowType === 'child') {
        doc.save();
        doc.rect(startX, y, usableWidth, rowHeight).fill('#f8fafc');
        doc.restore();
      } else if (row.rowType === 'childHeader') {
        doc.save();
        doc.rect(startX, y, usableWidth, rowHeight).fill('#e2e8f0');
        doc.restore();
      }
      pdfColumns.forEach((column, index) => {
        const width = columnWidths[index];
        const isChildHighlightColumn = row.rowType !== 'parent' && (index === 1 || index === 2);
        if (row.rowType === 'childHeader') {
          if (isChildHighlightColumn) {
            doc.save();
            doc.rect(x, y, width, rowHeight).fill('#fde68a');
            doc.restore();
          }
          doc.rect(x, y, width, rowHeight).stroke('#94a3b8');
        } else if (row.rowType === 'child') {
          if (isChildHighlightColumn) {
            doc.save();
            doc.rect(x, y, width, rowHeight).fill('#fef3c7');
            doc.restore();
          }
          doc.rect(x, y, width, rowHeight).stroke('#cbd5e1');
        } else {
          doc.rect(x, y, width, rowHeight).stroke('#0f172a');
        }
        const align = row.rowType === 'child' || row.rowType === 'childHeader'
          ? 'center'
          : 'left';
        doc.text(getCellText(row, index), x + 4, y + 5, {
          width: width - 8,
          align,
        });
        x += width;
      });
    };

    drawHeader();
    let currentY = tableTop;
    drawTableHeader(currentY);
    currentY += headerHeight;

    flattenedRows.forEach((row) => {
      const rowHeight = computeRowHeight(row);
      if (currentY + rowHeight > footerY - 18) {
        doc.addPage();
        drawHeader();
        currentY = tableTop;
        drawTableHeader(currentY);
        currentY += headerHeight;
      }
      drawRow(row, currentY, rowHeight);
      currentY += rowHeight;
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica-Oblique').fontSize(12).text('Printed from Royal Horizon Systems', startX, footerY, {
        align: 'center',
        width: usableWidth,
      });
      doc.font('Helvetica').fontSize(12).text(`Page ${i + 1} of ${range.count}`, startX, footerY, {
        align: 'right',
        width: usableWidth,
      });
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Unable to generate PDF report' });
    }
  }
};

exports.getShipmentSummary = async (req, res) => {
  try {
    const shipments = await Shipment.find({})
      .populate('supplierId', 'name country')
      .populate('itemId', 'description itemCode')
      .sort({ orderDate: -1, createdAt: -1 })
      .lean();

    const shipmentIds = shipments.map((shipment) => shipment._id);
    const containers = await Container.find({ shipmentId: { $in: shipmentIds } })
      .sort({ createdAt: 1 })
      .lean();
    const containerMap = new Map();
    containers.forEach((container) => {
      const key = String(container.shipmentId);
      if (!containerMap.has(key)) {
        containerMap.set(key, []);
      }
      containerMap.get(key).push(container);
    });

    const normalizedRole = normalizeRole(req.user?.role || '');
    const logisticsPendingShipmentIds = new Set(
      containers
        .filter((container) => hasMeaningfulActualData(container))
        .map((container) => String(container.shipmentId))
        .filter(Boolean)
    );
    const logisticsPendingCount = logisticsPendingShipmentIds.size;
    const rolePending = {
      role: normalizedRole || 'Unknown',
      label: normalizedRole === 'Logistic' ? 'Logistics Documentation' : 'Pending For Your Role',
      count: normalizedRole === 'Logistic' ? logisticsPendingCount : 0,
    };

    const total = shipments.length;
    const completed = shipments.filter((s) => s.currentStage === 'GRN Completed').length;
    const inProgress = Math.max(total - completed, 0);
    const underClearance = shipments.filter((s) =>
      ['Under Clearance', 'Cleared', 'Released'].includes(s.currentStage)
    ).length;

    const stageMap = new Map();
    shipments.forEach((s) => {
      const stage = getComputedShipmentStatus(s, containerMap.get(String(s._id)) || []);
      stageMap.set(stage, (stageMap.get(stage) || 0) + 1);
    });

    const stageBreakdown = Array.from(stageMap.entries()).map(([stage, count]) => ({ stage, count }));

    const monthMap = new Map();
    shipments.forEach((s) => {
      const date = s.orderDate ? new Date(s.orderDate) : new Date(s.createdAt);
      if (!date || Number.isNaN(date.getTime())) return;
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${month}`;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    });

    const monthlyTrend = Array.from(monthMap.entries())
      .map(([key, count]) => {
        const [yearStr, monthStr] = key.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        const label = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short' });
        return { label, month, year, count };
      })
      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
      .slice(-6);

    const paymentSummary = shipments.reduce((acc, s) => {
      const totalAmount = Number(s?.payment?.totalAmount || 0);
      const paidAmount = Number(s?.payment?.paidAmount || 0);
      const balanceAmount = Number(s?.payment?.balanceAmount || Math.max(totalAmount - paidAmount, 0));
      const status = String(s?.payment?.paymentStatus || '').toLowerCase();

      acc.totalAmount += totalAmount;
      acc.paidAmount += paidAmount;
      acc.balanceAmount += balanceAmount;

      if (status === 'paid') acc.paidShipments += 1;
      else if (status === 'partially paid') acc.partiallyPaidShipments += 1;
      else acc.pendingShipments += 1;
      return acc;
    }, {
      totalAmount: 0,
      paidAmount: 0,
      balanceAmount: 0,
      pendingShipments: 0,
      partiallyPaidShipments: 0,
      paidShipments: 0
    });

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfWeek = new Date(startOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const totalContainers = shipments.reduce((sum, s) =>
      sum + Number(s.noOfShipments || s.assumedContainerCount || 1), 0
    );

    const arrivedContainers = shipments
      .filter((s) => ['Arrived', 'Cleared', 'Released', 'GRN Completed'].includes(s.currentStage))
      .reduce((sum, s) => sum + Number(s.noOfShipments || s.assumedContainerCount || 1), 0);

    const clearedContainers = shipments
      .filter((s) => ['Cleared', 'Released', 'GRN Completed'].includes(s.currentStage))
      .reduce((sum, s) => sum + Number(s.noOfShipments || s.assumedContainerCount || 1), 0);

    const dueThisWeekShipments = shipments.filter((s) => {
      if (!s.plannedETA) return false;
      const eta = new Date(s.plannedETA);
      return eta >= startOfToday && eta <= endOfWeek;
    }).length;

    const overdueShipments = shipments.filter((s) => {
      if (!s.plannedETA) return false;
      const eta = new Date(s.plannedETA);
      return eta < startOfToday && !['Cleared', 'Released', 'GRN Completed'].includes(s.currentStage);
    }).length;

    const etaScheduledShipments = shipments.filter((s) => !!s.plannedETA).length;

    const recentShipments = shipments.slice(0, 8).map((s) => ({
      _id: s._id,
      shipmentNo: s.shipmentNo,
      orderDate: s.orderDate || s.createdAt,
      plannedETA: s.plannedETA || null,
      status: getComputedShipmentStatus(s, containerMap.get(String(s._id)) || []),
      totalAmount: Number(s?.payment?.totalAmount || 0),
      supplier: s?.supplierId?.name || '',
      item: s?.itemId?.description || ''
    }));

    const regionFromCountry = (country) => {
      const c = String(country || '').toLowerCase();
      if (c.includes('uae') || c.includes('saudi') || c.includes('oman') || c.includes('qatar')) return 'NA';
      if (c.includes('india') || c.includes('pakistan') || c.includes('china') || c.includes('japan')) return 'Asia';
      if (c.includes('germany') || c.includes('france') || c.includes('italy') || c.includes('uk')) return 'EUR';
      return 'SA';
    };

    const perfRegions = ['NA', 'EUR', 'Asia', 'SA'];
    const perfMap = new Map(perfRegions.map((r) => [r, []]));
    shipments.forEach((s) => {
      const region = regionFromCountry(s?.supplierId?.country);
      perfMap.get(region).push(s);
    });

    const financialPerformance = perfRegions.map((label) => {
      const rows = perfMap.get(label) || [];
      const qtyAvg = rows.length
        ? rows.reduce((sum, r) => sum + Number(r.plannedQtyMT || 0), 0) / rows.length
        : 0;
      return {
        label,
        cashToCash: Math.round(Math.max(qtyAvg * 0.2, -10)),
        accountRec: Math.round(Math.max(qtyAvg * 0.15, 5)),
        inventoryDays: Math.round(Math.max(qtyAvg * 0.25, 8)),
        payableDays: Math.round(Math.max(qtyAvg * 0.3, 12))
      };
    });

    const inventoryMap = new Map();
    shipments.forEach((s) => {
      const key = String(s.itemId?._id || s.itemId?.itemCode || s._id);
      const existing = inventoryMap.get(key) || {
        category: 'Shipment',
        product: s?.itemId?.description || s.shipmentNo,
        sku: s?.itemId?.itemCode || String(s._id).slice(-6).toUpperCase(),
        inStock: 0
      };
      existing.inStock += Math.max(Math.round(Number(s.plannedQtyMT || 0)), 0);
      inventoryMap.set(key, existing);
    });

    const inventory = Array.from(inventoryMap.values()).slice(0, 6);

    const orders = recentShipments.map((s) => ({
      _id: s._id,
      customer: s.supplier || '-',
      orderStatus: s.status,
      orderDate: s.orderDate
    }));

    const monthlyKpis = monthlyTrend.slice(-5).map((entry, index, rows) => {
      const prev = rows[index - 1]?.count ?? entry.count ?? 1;
      const change = prev ? ((entry.count - prev) / prev) * 100 : 0;
      return {
        metric: `${entry.label} ${entry.year}`,
        thisMonth: entry.count,
        pastMonth: prev,
        change: Number(change.toFixed(1))
      };
    });

    const volumeToday = buildDashboardRStatusMetrics(shipments, containerMap);

    const mapStageToStatus = (status) => {
      if (status === 'ETD yet to due' || status === 'ETA yet to due' || status === REPORT_STATUS_ETD_DUE) return REPORT_STATUS_ETD_DUE;
      if (status === 'On Transit') return 'On Transit';
      if (status === 'At Port of Discharge') return 'At the Port';
      if (status === 'Reached WH' || status === 'Delivered WH') return 'Delivered WH';
      if (status === 'Shipment Entry' || status === REPORT_STATUS_ETD_UNCONFIRMED) return REPORT_STATUS_ETD_UNCONFIRMED;
      return String(status || REPORT_STATUS_ETD_UNCONFIRMED);
    };

    const mapStageToYearlyStatus = (status) => {
      if (status === 'Reached WH' || status === 'Delivered WH') return 'Delivered WH';
      if (status === 'At Port of Discharge') return 'At the Port';
      if (status === 'On Transit') return 'On Transit';
      if (status === 'ETD yet to due' || status === 'ETA yet to due' || status === REPORT_STATUS_ETD_DUE) return REPORT_STATUS_ETD_DUE;
      return String(status || REPORT_STATUS_ETD_UNCONFIRMED);
    };

    const qtyMappingMap = new Map();
    const valueMappingMap = new Map();
    const yearlyQtyMappingMap = new Map();
    const supplierAvgFcMap = new Map();
    const supplierYearlyQtyMap = new Map();

    shipments.forEach(s => {
      const itemDesc = s.itemId?.description || s.itemDescription || 'Unknown Item';
      const supplierName = s.supplierId?.name || s.supplierName || 'Unknown Supplier';
      const shipmentContainers = containerMap.get(String(s._id)) || [];
      const fc = Number(s.totalFC || 0);
      const fcPerUnit = Number(s.fcPerUnit || 0);
      const splitCount = getShipmentSplitCount(s, shipmentContainers);
      const dashboardChildren = shipmentContainers.length
        ? shipmentContainers.map((container) => ({
          status: getDashboardStatusColumn(s, container),
          qty: getDashboardChildQuantity(s, container, splitCount),
        }))
        : [{
          status: REPORT_STATUS_ETD_UNCONFIRMED,
          qty: Number(s.plannedQtyMT || s.totalOrderedQtyMT || 0),
        }];

      dashboardChildren.forEach(({ status: childStatus, qty }) => {
        const status = mapStageToStatus(childStatus);
        const yearlyStatus = mapStageToYearlyStatus(childStatus);
        const valueShare = Number(s.plannedQtyMT || 0) > 0 ? fc * (qty / Number(s.plannedQtyMT || 0)) : 0;

        if (!qtyMappingMap.has(itemDesc)) qtyMappingMap.set(itemDesc, { rowLabel: itemDesc });
        qtyMappingMap.get(itemDesc)[status] = (qtyMappingMap.get(itemDesc)[status] || 0) + qty;

        if (!valueMappingMap.has(itemDesc)) valueMappingMap.set(itemDesc, { rowLabel: itemDesc });
        valueMappingMap.get(itemDesc)[status] = (valueMappingMap.get(itemDesc)[status] || 0) + valueShare;

        if (!yearlyQtyMappingMap.has(itemDesc)) yearlyQtyMappingMap.set(itemDesc, { rowLabel: itemDesc });
        yearlyQtyMappingMap.get(itemDesc)[yearlyStatus] = (yearlyQtyMappingMap.get(itemDesc)[yearlyStatus] || 0) + qty;

        if (!supplierYearlyQtyMap.has(supplierName)) supplierYearlyQtyMap.set(supplierName, { rowLabel: supplierName });
        supplierYearlyQtyMap.get(supplierName)[yearlyStatus] = (supplierYearlyQtyMap.get(supplierName)[yearlyStatus] || 0) + qty;
      });

      if (!supplierAvgFcMap.has(itemDesc)) supplierAvgFcMap.set(itemDesc, { rowLabel: itemDesc });
      const supAvg = supplierAvgFcMap.get(itemDesc);
      if (!supAvg[`${supplierName}_sum`]) {
        supAvg[`${supplierName}_sum`] = 0;
        supAvg[`${supplierName}_count`] = 0;
      }
      supAvg[`${supplierName}_sum`] += fcPerUnit;
      supAvg[`${supplierName}_count`] += 1;
    });

    const formatSupplierAvgFc = Array.from(supplierAvgFcMap.values()).map(row => {
      const newRow = { rowLabel: row.rowLabel };
      Object.keys(row).forEach(k => {
        if (k.endsWith('_sum')) {
          const supplier = k.replace('_sum', '');
          newRow[supplier] = Number((row[`${supplier}_sum`] / row[`${supplier}_count`]).toFixed(2));
        }
      });
      return newRow;
    });
    const statusPivot = buildDashboardStatusPivot(shipments, containerMap, 'supplier');
    const statusPivotByItem = buildDashboardStatusPivot(shipments, containerMap, 'item');

    res.status(200).json({
      kpis: {
        totalShipments: total,
        completedShipments: completed,
        inProgressShipments: inProgress,
        underClearanceShipments: underClearance,
        totalPaymentExposure: paymentSummary.balanceAmount
      },
      stageBreakdown,
      monthlyTrend,
      arrivalSummary: {
        totalContainers,
        arrivedContainers,
        pendingArrivalContainers: Math.max(totalContainers - arrivedContainers, 0),
        clearedContainers,
        dueThisWeekShipments,
        overdueShipments,
        etaScheduledShipments
      },
      paymentSummary,
      rolePending,
      recentShipments,
      shippingStatus: {
        orders,
        volumeToday,
        inventory,
        financialPerformance,
        monthlyKpis
      },
      chartData: {
        qtyMapping: Array.from(qtyMappingMap.values()),
        valueMapping: Array.from(valueMappingMap.values()),
        yearlyQtyMapping: Array.from(yearlyQtyMappingMap.values()),
        supplierAvgFc: formatSupplierAvgFc,
        supplierYearlyQty: Array.from(supplierYearlyQtyMap.values())
      },
      statusPivot,
      statusPivotByItem
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getShipmentById = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id)
      .populate("supplierId", "name")
      .populate("itemId", "description itemCode unit riceName packing");

    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" });
    }
    const shipmentId = shipment._id;
    const containers = await Container.find({ shipmentId })
      .sort({ createdAt: 1 })
      .populate('actual.clearingAdvanceApproval.submittedBy', 'name email role')
      .populate('actual.clearingAdvanceApproval.fasApprovedBy', 'name email role')
      .populate('actual.additionalClearingAdvanceRequests.submittedBy', 'name email role')
      .populate('actual.additionalClearingAdvanceRequests.fasApprovedBy', 'name email role')
      .populate('actual.paymentAllocationApproval.submittedBy', 'name email role')
      .populate('actual.paymentAllocationApproval.fasManagerApprovedBy', 'name email role')
      .populate('actual.paymentCostingApproval.submittedBy', 'name email role')
      .populate('actual.paymentCostingApproval.fasManagerApprovedBy', 'name email role');
    
    // DEBUG: Log additionalDocuments for each container
    containers.forEach((container, index) => {
      const docs = container.actual?.additionalDocuments || [];
      console.log(`[DEBUG] Container ${index} (${container._id}) - additionalDocuments count: ${docs.length}`);
      if (docs.length > 0) {
        console.log(`[DEBUG] Container ${index} - First document:`, JSON.stringify(docs[0]));
      }
    });
    const containerIds = containers.map((container) => container._id);
    const scheduledHistoryLogs = await AuditLog
      .find({
        module: "Purchase",
        entity: "Shipment",
        entityId: shipmentId,
        action: { $in: ["ScheduledBaselineCreated", "ScheduledBaselineUpdated"] },
      })
      .sort({ createdAt: -1 })
      .populate("userId", "name email");
    const clearingAdvanceSubmissionLogs = await AuditLog
      .find({
        module: 'Logistics',
        entity: 'Container',
        entityId: { $in: containerIds },
        action: 'SubmitClearingAdvance',
      })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email role')
      .lean();
    const clearingAdvanceSubmitterByContainer = new Map();
    clearingAdvanceSubmissionLogs.forEach((entry) => {
      const key = String(entry.entityId || '');
      if (!key || clearingAdvanceSubmitterByContainer.has(key)) return;
      const user = entry.userId || null;
      const name = user?.name || user?.email || '';
      const role = user?.role || '';
      clearingAdvanceSubmitterByContainer.set(key, {
        name,
        role,
        label: name ? `${name}${role ? ` (${role})` : ''}` : '',
        submittedAt: entry.createdAt || null,
      });
    });

    const planned = containers.map(c => ({
      containerId: c._id,
      size: c.planned?.size,
      FCL: c.planned?.FCL,
      qtyMT: c.planned?.qtyMT,
      bags: c.planned?.bags,
      etd: c.planned?.etd,
      eta: c.planned?.eta,
      weekWiseShipment: c.planned?.weekWiseShipment,
      buyingUnit: c.planned?.buyingUnit,
      status: c.status,
      shipmentStatus: getComputedContainerShipmentStatus(shipment, c),
    }));

    const actual = [];
    containers.forEach(c => {
      if (c.actual) {
        const actualArr = Array.isArray(c.actual) ? c.actual : [c.actual];
        actualArr.forEach(a => {
          const clearingAdvanceSubmittedBy = a.clearingAdvanceApproval?.submittedBy || null;
          const clearingAdvanceSubmittedByLabel = clearingAdvanceSubmittedBy?.name || clearingAdvanceSubmittedBy?.email || '';
          const clearingAdvanceSubmitter = clearingAdvanceSubmittedByLabel
            ? {
                name: clearingAdvanceSubmittedByLabel,
                role: clearingAdvanceSubmittedBy?.role || '',
                label: `${clearingAdvanceSubmittedByLabel}${clearingAdvanceSubmittedBy?.role ? ` (${clearingAdvanceSubmittedBy.role})` : ''}`,
                submittedAt: a.clearingAdvanceApproval?.submittedAt || null,
              }
            : clearingAdvanceSubmitterByContainer.get(String(c._id)) || null;

          const actualData = {
            containerId: c._id,
            logisticPreparedBy: clearingAdvanceSubmitter?.label || '',
            logisticPreparedByUser: clearingAdvanceSubmitter,
            shipmentStatus: getComputedContainerShipmentStatus(shipment, c),
            actualSerialNo: a.actualSerialNo,
            commercialInvoiceNo: a.commercialInvoiceNo,
            blDetailsRemarks: a.blDetailsRemarks,
            shipOnBoardDate: a.shipOnBoardDate,
            size: a.size,
            FCL: a.FCL,
            qtyMT: a.qtyMT,
            bags: a.bags,
            pallet: a.pallet,
            buyingUnit: a.buyingUnit,
            receivedOn: a.receivedOn,
            updatedETD: a.updatedETD,
            updatedETA: a.updatedETA,
            CLNo: a.CLNo,
            BLNo: a.BLNo,
            blFirstSavedAt: a.blFirstSavedAt,
            portOfLoading: a.portOfLoading,
            portOfDischarge: a.portOfDischarge,
            shipmentArrived: a.shipmentArrived || 'No',
            noOfContainers: a.noOfContainers,
            noOfBags: a.noOfBags,
            quantityByMt: a.quantityByMt,
            shippingLine: a.shippingLine,
            freeDetentionDays: a.freeDetentionDays,
            maximumDetentionDays: a.maximumDetentionDays,
            freightPrepared: a.freightPrepared,
            billExtractionData: a.billExtractionData || null,
            blDocumentUrl: a.blDocumentUrl,
            blDocumentName: a.blDocumentName,
            commercialInvoiceDocumentUrl: a.commercialInvoiceDocumentUrl,
            commercialInvoiceDocumentName: a.commercialInvoiceDocumentName,
            packagingList: a.packagingList || null,
            packagingListDocumentUrl: a.packagingListDocumentUrl,
            packagingListDocumentName: a.packagingListDocumentName,
            actualBags: a.actualBags,
            expiryDate: a.expiryDate,
            hsCode: a.hsCode,
            packagingDate: a.packagingDate,
            grossWeight: a.grossWeight,
            netWeight: a.netWeight,
            extractedContainers: a.extractedContainers || [],
            costSheetBookingDocumentUrl: a.costSheetBookingDocumentUrl,
            costSheetBookingDocumentName: a.costSheetBookingDocumentName,
            costSheetBookings: a.costSheetBookings || [],
            clearingAdvancePaymentDetails: a.clearingAdvancePaymentDetails || null,
            clearingAdvanceApproval: a.clearingAdvanceApproval || null,
            additionalClearingAdvanceRequests: a.additionalClearingAdvanceRequests || [],
            storageAllocations: a.storageAllocations || [],
            storageAllocationDecision: a.storageAllocationDecision || null,
            storageAllocationSplits: a.storageAllocationSplits || [],
            storageAllocationApproval: a.storageAllocationApproval || null,
            storageArrivalApproval: a.storageArrivalApproval || null,
            maximumRetentionDate: a.maximumRetentionDate,
            DHL: a.DHL,
            courierTrackNo: a.courierTrackNo,
            courierServiceProvider: a.courierServiceProvider,
            docArrivalNotes: a.docArrivalNotes,
            expectedDocDate: a.expectedDocDate,
            receiver: a.receiver,
            bankName: a.bankName,
            inwardCollectionAdviceDate: a.inwardCollectionAdviceDate,
            inwardCollectionAdviceReceivedAt: a.inwardCollectionAdviceReceivedAt,
            inwardCollectionAdviceSubmittedAt: a.inwardCollectionAdviceSubmittedAt,
            inwardCollectionAdviceDocumentUrl: a.inwardCollectionAdviceDocumentUrl,
            inwardCollectionAdviceDocumentName: a.inwardCollectionAdviceDocumentName,
            murabahaContractReleasedDate: a.murabahaContractReleasedDate,
            murabahaContractApprovedDate: a.murabahaContractApprovedDate,
            murabahaContractSubmittedDate: a.murabahaContractSubmittedDate,
            murabahaContractSubmittedDocumentUrl: a.murabahaContractSubmittedDocumentUrl,
            murabahaContractSubmittedDocumentName: a.murabahaContractSubmittedDocumentName,
            documentsReleasedDate: a.documentsReleasedDate,
            documentsReleasedDocumentUrl: a.documentsReleasedDocumentUrl,
            documentsReleasedDocumentName: a.documentsReleasedDocumentName,
            bankSubmittedToBank: a.bankSubmittedToBank || false,
            daSignedDocumentUrl: a.daSignedDocumentUrl,
            daSignedDocumentName: a.daSignedDocumentName,
            dnSignedDocumentUrl: a.dnSignedDocumentUrl,
            dnSignedDocumentName: a.dnSignedDocumentName,
            skipMurabaha: a.skipMurabaha || false,
            murabahaContractDocumentUrl: a.murabahaContractDocumentUrl,
            murabahaContractDocumentName: a.murabahaContractDocumentName,
            daSubmittedToBank: a.daSubmittedToBank || false,
            murabahaSubmittedToBank: a.murabahaSubmittedToBank || false,
            submissionPackageDocumentUrl: a.submissionPackageDocumentUrl,
            submissionPackageDocumentName: a.submissionPackageDocumentName,
            bankAdvanceAmountDocumentUrl: a.bankAdvanceAmountDocumentUrl,
            bankAdvanceApprovedDocumentUrl: a.bankAdvanceApprovedDocumentUrl,
            bankAdvanceSubmittedOn: a.bankAdvanceSubmittedOn,
            docToBeReleasedOn: a.docToBeReleasedOn,
            arrivalOn: a.arrivalOn,
            shipmentFreeRetentionDate: a.shipmentFreeRetentionDate,
            portRetentionWithPenaltyDate: a.portRetentionWithPenaltyDate,
            arrivalNoticeDate: a.arrivalNoticeDate,
            arrivalNoticeFreeRetentionDays: a.arrivalNoticeFreeRetentionDays,
            arrivalNoticeDocumentUrl: a.arrivalNoticeDocumentUrl,
            arrivalNoticeDocumentName: a.arrivalNoticeDocumentName,
            advanceRequestDate: a.advanceRequestDate,
            advanceRequestDocumentUrl: a.advanceRequestDocumentUrl,
            advanceRequestDocumentName: a.advanceRequestDocumentName,
            doReleasedDate: a.doReleasedDate,
            doReleasedDocumentUrl: a.doReleasedDocumentUrl,
            doReleasedDocumentName: a.doReleasedDocumentName,
            doReleasedRemarks: a.doReleasedRemarks,
            boePassingDate: a.boePassingDate,
            boePassingDocumentUrl: a.boePassingDocumentUrl,
            boePassingDocumentName: a.boePassingDocumentName,
            boePassingRemarks: a.boePassingRemarks,
            dmBarcode: a.dmBarcode,
            dpApprovalDate: a.dpApprovalDate,
            dpApprovalDocumentUrl: a.dpApprovalDocumentUrl,
            dpApprovalDocumentName: a.dpApprovalDocumentName,
            dpApprovalRemarks: a.dpApprovalRemarks,
            tokenReceivedDate: a.tokenReceivedDate,
            municipalityDate: a.municipalityDate,
            municipalityDocumentUrl: a.municipalityDocumentUrl,
            municipalityDocumentName: a.municipalityDocumentName,
            municipalityRemarks: a.municipalityRemarks,
            municipalityStatus: a.municipalityStatus || 'open',
            municipalityStatusComment: a.municipalityStatusComment || '',
            customsClearanceRemarks: a.customsClearanceRemarks,
            customsOriginalDocuments: a.customsOriginalDocuments
              ? {
                  boe: {
                    submissionDate: a.customsOriginalDocuments.boeSubmissionDate || null,
                    documentUrl: a.customsOriginalDocuments.boeDocumentUrl || '',
                    documentName: a.customsOriginalDocuments.boeDocumentName || '',
                  },
                  do: {
                    submissionDate: a.customsOriginalDocuments.doSubmissionDate || null,
                    documentUrl: a.customsOriginalDocuments.doDocumentUrl || '',
                    documentName: a.customsOriginalDocuments.doDocumentName || '',
                  },
                  blOriginal: {
                    submissionDate: a.customsOriginalDocuments.blOriginalSubmissionDate || null,
                    documentUrl: a.customsOriginalDocuments.blOriginalDocumentUrl || '',
                    documentName: a.customsOriginalDocuments.blOriginalDocumentName || '',
                  },
                  invoice: {
                    submissionDate: a.customsOriginalDocuments.invoiceSubmissionDate || null,
                    documentUrl: a.customsOriginalDocuments.invoiceDocumentUrl || '',
                    documentName: a.customsOriginalDocuments.invoiceDocumentName || '',
                  },
                  packingList: {
                    submissionDate: a.customsOriginalDocuments.packingListSubmissionDate || null,
                    documentUrl: a.customsOriginalDocuments.packingListDocumentUrl || '',
                    documentName: a.customsOriginalDocuments.packingListDocumentName || '',
                  },
                }
              : null,
            clearExpectedOn: a.clearExpectedOn,
            shipmentArrivedOn: a.shipmentArrivedOn,
            deliveryOrderDocumentUrl: a.deliveryOrderDocumentUrl,
            deliveryOrderDate: a.deliveryOrderDate,
            tokenDocumentUrl: a.tokenDocumentUrl,
            tokenDate: a.tokenDate,
            transportArrangedDocumentUrl: a.transportArrangedDocumentUrl,
            transportArrangedDate: a.transportArrangedDate,
            customsClearanceDocumentUrl: a.customsClearanceDocumentUrl,
            customsClearanceDate: a.customsClearanceDate,
            municipalityClearanceDocumentUrl: a.municipalityClearanceDocumentUrl,
            municipalityClearanceDate: a.municipalityClearanceDate,
            deliverySchedules: a.deliverySchedules || [],
            warehouseSchedules: a.warehouseSchedules || [],
            // Port & Customs Clearance (M1)
            commercialDocumentReceivedDate: a.commercialDocumentReceivedDate || null,
            commercialDocumentDocumentUrl: a.commercialDocumentDocumentUrl || '',
            commercialDocumentDocumentName: a.commercialDocumentDocumentName || '',
            freeStorageDays: a.freeStorageDays ?? 14,
            clearanceRemarks: a.clearanceRemarks || '',
            // DO section extras
            doRemarks: a.doRemarks || '',
            // Municipality extras
            municipalityReleasedDate: a.municipalityReleasedDate || null,
            municipalityResponseRemarks: a.municipalityResponseRemarks || '',
            municipalityComments: a.municipalityComments || '',
            // Customer Inspection
            customerInspectionRequired: a.customerInspectionRequired || false,
            customerInspectionDate: a.customerInspectionDate || null,
            customerInspectionStatus: a.customerInspectionStatus || '',
            customerInspectionComments: a.customerInspectionComments || '',
            customerInspectionDocumentUrl: a.customerInspectionDocumentUrl || '',
            customerInspectionDocumentName: a.customerInspectionDocumentName || '',
            // BOE
            customerInspectionDocUrl: a.customerInspectionDocUrl || '',
            // All Documents Repository (M3)
            additionalDocuments: a.additionalDocuments || [],
            // Transportation (M4)
            transportationBooked: (a.transportationBooked || []).map(tb => ({
              sn: tb.sn,
              containerSerialNo: tb.containerSerialNo,
              transportCompanyName: tb.transportCompanyName,
              warehouse: tb.warehouse || '',
              bookedDate: tb.bookedDate,
              bookingTime: tb.bookingTime,
              transportDate: tb.transportDate,
              transportTime: tb.transportTime,
              delayHours: tb.delayHours,
              storageStartDate: tb.storageStartDate,
              storageEndDate: tb.storageEndDate,
              tokenReceivedDate: tb.tokenReceivedDate,
              _id: tb._id,
            })),
            lockedLogisticsSections: a.lockedLogisticsSections || [],
            storageSplits: a.storageSplits || [],
            storageDocumentUrl: a.storageDocumentUrl || null,
            storageDocumentName: a.storageDocumentName || null,
            qualityRows: a.qualityRows || [],
            qualityReports: a.qualityReports || [],
            paymentAllocations: a.paymentAllocations || [],
            paymentAllocationApproval: a.paymentAllocationApproval || null,
            paymentCostings: a.paymentCostings || [],
            paymentCostingApproval: a.paymentCostingApproval || null,
            packagingExpenses: a.packagingExpenses || [],
            paymentCostingDocumentUrl: a.paymentCostingDocumentUrl,
            paymentCostingDocumentName: a.paymentCostingDocumentName,
            paid_amount: a.paid_amount,
            paidOn: a.paidOn,
            remarks: a.remarks
          };

          if (hasValues(a.clearance)) {
            actualData.clearance = a.clearance;
          }

          if (hasValues(a.grn)) {
            actualData.grn = a.grn;
          }

          actual.push(actualData);
        });
      }
    });

    await Promise.all(actual.map(async (row) => {
      const [
        signedStep3Doc,
        signedBlDocument,
        signedCommercialInvoiceDocument,
        signedPkgDocument,
        signedInwardAdvice,
        signedMurabaha,
        signedReleased,
        signedArrivalNotice,
        signedAdvance,
        signedDoReleased,
        signedBoePassing,
        signedDpApproval,
        signedCustoms,
        signedMunicipality,
        signedPaymentCosting,
        signedStorageDocument,
        signedCustomsBoe,
        signedCustomsDo,
        signedCustomsBl,
        signedCustomsInvoice,
        signedCustomsPackingList,
        signedDaSigned,
        signedDnSigned,
        signedMurabahaContract,
        signedSubmissionPackage,
      ] = await Promise.all([
        toSignedDocument(row.costSheetBookingDocumentUrl, row.costSheetBookingDocumentName),
        toSignedDocument(row.blDocumentUrl, row.blDocumentName),
        toSignedDocument(row.commercialInvoiceDocumentUrl, row.commercialInvoiceDocumentName),
        toSignedDocument(row.packagingListDocumentUrl, row.packagingListDocumentName),
        toSignedDocument(row.inwardCollectionAdviceDocumentUrl, row.inwardCollectionAdviceDocumentName),
        toSignedDocument(row.murabahaContractSubmittedDocumentUrl, row.murabahaContractSubmittedDocumentName),
        toSignedDocument(row.documentsReleasedDocumentUrl, row.documentsReleasedDocumentName),
        toSignedDocument(row.arrivalNoticeDocumentUrl, row.arrivalNoticeDocumentName),
        toSignedDocument(row.advanceRequestDocumentUrl, row.advanceRequestDocumentName),
        toSignedDocument(row.doReleasedDocumentUrl, row.doReleasedDocumentName),
        toSignedDocument(row.boePassingDocumentUrl, row.boePassingDocumentName),
        toSignedDocument(row.dpApprovalDocumentUrl, row.dpApprovalDocumentName),
        toSignedDocument(row.customsClearanceDocumentUrl, row.customsClearanceDocumentName),
        toSignedDocument(row.municipalityDocumentUrl, row.municipalityDocumentName),
        toSignedDocument(row.paymentCostingDocumentUrl, row.paymentCostingDocumentName),
        toSignedDocument(row.storageDocumentUrl, row.storageDocumentName),
        toSignedDocument(row.customsOriginalDocuments?.boe?.documentUrl, row.customsOriginalDocuments?.boe?.documentName),
        toSignedDocument(row.customsOriginalDocuments?.do?.documentUrl, row.customsOriginalDocuments?.do?.documentName),
        toSignedDocument(row.customsOriginalDocuments?.blOriginal?.documentUrl, row.customsOriginalDocuments?.blOriginal?.documentName),
        toSignedDocument(row.customsOriginalDocuments?.invoice?.documentUrl, row.customsOriginalDocuments?.invoice?.documentName),
        toSignedDocument(row.customsOriginalDocuments?.packingList?.documentUrl, row.customsOriginalDocuments?.packingList?.documentName),
        toSignedDocument(row.daSignedDocumentUrl, row.daSignedDocumentName),
        toSignedDocument(row.dnSignedDocumentUrl, row.dnSignedDocumentName),
        toSignedDocument(row.murabahaContractDocumentUrl, row.murabahaContractDocumentName),
        toSignedDocument(row.submissionPackageDocumentUrl, row.submissionPackageDocumentName),
      ]);

      row.costSheetBookingDocumentUrl = signedStep3Doc.url;
      row.costSheetBookingDocumentName = signedStep3Doc.name;
      row.blDocumentUrl = signedBlDocument.url;
      row.blDocumentName = signedBlDocument.name;
      row.commercialInvoiceDocumentUrl = signedCommercialInvoiceDocument.url;
      row.commercialInvoiceDocumentName = signedCommercialInvoiceDocument.name;
      row.packagingListDocumentUrl = signedPkgDocument.url;
      row.packagingListDocumentName = signedPkgDocument.name;
      row.inwardCollectionAdviceDocumentUrl = signedInwardAdvice.url;
      row.inwardCollectionAdviceDocumentName = signedInwardAdvice.name;
      row.murabahaContractSubmittedDocumentUrl = signedMurabaha.url;
      row.murabahaContractSubmittedDocumentName = signedMurabaha.name;
      row.documentsReleasedDocumentUrl = signedReleased.url;
      row.documentsReleasedDocumentName = signedReleased.name;
      row.arrivalNoticeDocumentUrl = signedArrivalNotice.url;
      row.arrivalNoticeDocumentName = signedArrivalNotice.name;
      row.advanceRequestDocumentUrl = signedAdvance.url;
      row.advanceRequestDocumentName = signedAdvance.name;
      row.doReleasedDocumentUrl = signedDoReleased.url;
      row.doReleasedDocumentName = signedDoReleased.name;
      row.boePassingDocumentUrl = signedBoePassing.url;
      row.boePassingDocumentName = signedBoePassing.name;
      row.dpApprovalDocumentUrl = signedDpApproval.url;
      row.dpApprovalDocumentName = signedDpApproval.name;
      row.customsClearanceDocumentUrl = signedCustoms.url;
      row.customsClearanceDocumentName = signedCustoms.name;
      row.municipalityDocumentUrl = signedMunicipality.url;
      row.municipalityDocumentName = signedMunicipality.name;
      row.paymentCostingDocumentUrl = signedPaymentCosting.url;
      row.paymentCostingDocumentName = signedPaymentCosting.name;
      row.storageDocumentUrl = signedStorageDocument.url;
      row.storageDocumentName = signedStorageDocument.name;
      row.daSignedDocumentUrl = signedDaSigned.url;
      row.daSignedDocumentName = signedDaSigned.name;
      row.dnSignedDocumentUrl = signedDnSigned.url;
      row.dnSignedDocumentName = signedDnSigned.name;
      row.murabahaContractDocumentUrl = signedMurabahaContract.url;
      row.murabahaContractDocumentName = signedMurabahaContract.name;
      row.submissionPackageDocumentUrl = signedSubmissionPackage.url;
      row.submissionPackageDocumentName = signedSubmissionPackage.name;
      if (row.customsOriginalDocuments) {
        row.customsOriginalDocuments.boe.documentUrl = signedCustomsBoe.url;
        row.customsOriginalDocuments.boe.documentName = signedCustomsBoe.name;
        row.customsOriginalDocuments.do.documentUrl = signedCustomsDo.url;
        row.customsOriginalDocuments.do.documentName = signedCustomsDo.name;
        row.customsOriginalDocuments.blOriginal.documentUrl = signedCustomsBl.url;
        row.customsOriginalDocuments.blOriginal.documentName = signedCustomsBl.name;
        row.customsOriginalDocuments.invoice.documentUrl = signedCustomsInvoice.url;
        row.customsOriginalDocuments.invoice.documentName = signedCustomsInvoice.name;
        row.customsOriginalDocuments.packingList.documentUrl = signedCustomsPackingList.url;
        row.customsOriginalDocuments.packingList.documentName = signedCustomsPackingList.name;
      }

      const [costSheetBookings, additionalClearingAdvanceRequests, qualityRows, qualityReports, paymentAllocations, paymentCostings, storageSplits, additionalDocuments] = await Promise.all([
        Promise.all((row.costSheetBookings || []).map(async (costRow) => {
          const plainCostRow = toPlainObject(costRow);
          const signed = await toSignedDocument(costRow.attachmentDocumentUrl, costRow.attachmentDocumentName);
          return {
            ...plainCostRow,
            attachmentDocumentUrl: signed.url,
            attachmentDocumentName: signed.name,
          };
        })),
        Promise.all((row.additionalClearingAdvanceRequests || []).map(async (requestRow) => {
          const plainRequestRow = toPlainObject(requestRow);
          const signed = await toSignedDocument(requestRow.attachmentDocumentUrl, requestRow.attachmentDocumentName);
          return {
            ...plainRequestRow,
            attachmentDocumentUrl: signed.url,
            attachmentDocumentName: signed.name,
          };
        })),
        Promise.all((row.qualityRows || []).map(async (qualityRow) => {
          const plainQualityRow = toPlainObject(qualityRow);
          const [inhouse, strategic, thirdParty, attachment] = await Promise.all([
            toSignedDocument(qualityRow.inhouseReportDocumentUrl, qualityRow.inhouseReportDocumentName),
            toSignedDocument(qualityRow.strategicReportDocumentUrl, qualityRow.strategicReportDocumentName),
            toSignedDocument(qualityRow.thirdPartyReportDocumentUrl, qualityRow.thirdPartyReportDocumentName),
            toSignedDocument(qualityRow.attachmentDocumentUrl, qualityRow.attachmentDocumentName),
          ]);
          return {
            ...plainQualityRow,
            inhouseReportDocumentUrl: inhouse.url,
            inhouseReportDocumentName: inhouse.name,
            strategicReportDocumentUrl: strategic.url,
            strategicReportDocumentName: strategic.name,
            thirdPartyReportDocumentUrl: thirdParty.url,
            thirdPartyReportDocumentName: thirdParty.name,
            attachmentDocumentUrl: attachment.url,
            attachmentDocumentName: attachment.name,
          };
        })),
        Promise.all((row.qualityReports || []).map(async (reportRow) => {
          const plainReportRow = toPlainObject(reportRow);
          const signed = await toSignedDocument(reportRow.documentUrl, reportRow.documentName);
          return {
            ...plainReportRow,
            documentUrl: signed.url,
            documentName: signed.name,
          };
        })),
        Promise.all((row.paymentAllocations || []).map(async (allocationRow) => {
          const plainAllocationRow = toPlainObject(allocationRow);
          const signed = await toSignedDocument(allocationRow.attachmentDocumentUrl, allocationRow.attachmentDocumentName);
          return {
            ...plainAllocationRow,
            attachmentDocumentUrl: signed.url,
            attachmentDocumentName: signed.name,
          };
        })),
        Promise.all((row.paymentCostings || []).map(async (costingRow) => {
          const plainCostingRow = toPlainObject(costingRow);
          const signed = await toSignedDocument(costingRow.refBillDocumentUrl, costingRow.refBillDocumentName);
          return {
            ...plainCostingRow,
            refBillDocumentUrl: signed.url,
            refBillDocumentName: signed.name,
          };
        })),
        Promise.all((row.storageSplits || []).map(async (storageRow) => {
          const plainStorageRow = toPlainObject(storageRow);
          const signed = await toSignedDocument(storageRow.documentUrl, storageRow.documentName);
          return {
            ...plainStorageRow,
            documentUrl: signed.url,
            documentName: signed.name,
          };
        })),
        Promise.all((row.additionalDocuments || []).map(async (doc) => {
          const plainDoc = toPlainObject(doc);
          const signed = await toSignedDocument(doc.fileUrl, doc.fileName);
          return {
            ...plainDoc,
            fileUrl: signed.url,
            fileName: signed.name,
          };
        })),
      ]);

      row.costSheetBookings = costSheetBookings;
      row.additionalClearingAdvanceRequests = additionalClearingAdvanceRequests;
      row.qualityRows = qualityRows;
      row.qualityReports = qualityReports;
      row.paymentAllocations = paymentAllocations;
      row.paymentCostings = paymentCostings;
      row.storageSplits = storageSplits;
      row.additionalDocuments = additionalDocuments;
    }));

    const [signedLpoUrl, signedProformaUrl, signedS1QualityUrl] = await Promise.all([
      shipment.lpoDocumentUrl
        ? createSignedGetUrl(shipment.lpoDocumentUrl, 900).catch(() => shipment.lpoDocumentUrl)
        : null,
      shipment.proformaDocumentUrl
        ? createSignedGetUrl(shipment.proformaDocumentUrl, 900).catch(() => shipment.proformaDocumentUrl)
        : null,
      shipment.s1QualityReportUrl
        ? createSignedGetUrl(shipment.s1QualityReportUrl, 900).catch(() => shipment.s1QualityReportUrl)
        : null,
    ]);

    res.status(200).json({
      shipment: {
        _id: shipment._id,
        shipmentNo: shipment.shipmentNo,
        orderNumber: shipment.poNumber,
        poNumber: shipment.poNumber,
        fpoNo: shipment.fpoNo,
        orderDate: shipment.orderDate,
        supplier: shipment.supplierName || shipment.supplierId?.name || null,
        supplierEmail: shipment.supplierEmail || null,
        itemCode: shipment.itemCode || shipment.itemId?.itemCode || null,
        commodity: shipment.commodity || null,
        countryOfOrigin: shipment.countryOfOrigin || null,
        itemDescription: shipment.itemDescription || shipment.itemId?.description || null,
        item: shipment.itemId
          ? `${shipment.itemId.itemCode} - ${shipment.itemId.description}`
          : (shipment.itemCode || shipment.itemDescription
            ? `${shipment.itemCode || ''}${shipment.itemCode && shipment.itemDescription ? ' - ' : ''}${shipment.itemDescription || ''}`.trim()
            : null),
        riceName: shipment.brandName || shipment.itemId?.riceName,
        packing: shipment.packing || shipment.itemId?.packing,
        piNo: shipment.piNo,
        piDate: shipment.piDate,
        portOfLoading: shipment.portOfLoading || null,
        portOfDischarge: shipment.portOfDischarge || null,
        fcl: shipment.fcl ?? null,
        pallet: shipment.pallet ?? null,
        bags: shipment.bags ?? null,
        totalOrderedQtyMT: shipment.totalOrderedQtyMT,
        plannedQtyMT: shipment.plannedQtyMT,
        actualQtyMT: shipment.actualQtyMT,
        assumedContainerCount: shipment.assumedContainerCount ?? shipment.totalSplitQtyMT,
        currentStage: shipment.currentStage,
        payment: shipment.payment.totalAmount,
        totalAED: (() => {
          if (Array.isArray(shipment.lineItems) && shipment.lineItems.length > 0) {
            const sum = shipment.lineItems.reduce((acc, item) => acc + (Number(item.totalAED) || 0), 0);
            if (sum > 0) return Math.round(sum * 100) / 100;
          }
          if (shipment.amountAED != null && shipment.amountAED > 0) return shipment.amountAED;
          const usd = Number(shipment.totalFC || shipment.payment?.totalAmount || 0);
          return usd > 0 ? Math.round(usd * 3.67 * 100) / 100 : null;
        })(),
        incoterms: shipment.incoterms,
        buyunit: shipment.buyunit,
        fcPerUnit: shipment.fcPerUnit,
        advanceAmount: shipment.advanceAmount,
        paymentTerms: shipment.paymentTerms,
        bankName: shipment.bankName,
        barcode: shipment.barcode,
        variant: shipment.variant,
        hsCode: shipment.hsCode,
        lineItems: Array.isArray(shipment.lineItems)
          ? shipment.lineItems.map((item) => ({
              lineNo: item.lineNo ?? null,
              itemCode: item.itemCode || null,
              itemDescription: item.itemDescription || null,
              commodity: item.commodity || null,
              countryOfOrigin: item.countryOfOrigin || null,
              brandName: item.brandName || null,
              barcode: item.barcode || null,
              dmBarcode: item.dmBarcode || null,
              variant: item.variant || null,
              hsCode: item.hsCode || null,
              packagingType: item.packagingType || null,
              containerSize: item.containerSize || null,
              plannedContainers: item.plannedContainers ?? null,
              fcl: item.fcl ?? null,
              pallet: item.pallet ?? null,
              bags: item.bags ?? null,
              buyingUnit: item.buyingUnit || null,
              fclPerUnit: item.fclPerUnit ?? null,
              fcPerUnit: item.fcPerUnit ?? null,
              totalUSD: item.totalUSD ?? null,
              totalAED: item.totalAED ?? null,
              expectedETD: item.expectedETD || null,
              expectedETA: item.expectedETA || null,
            }))
          : [],
        lpoDocumentName: shipment.lpoDocumentName || null,
        lpoDocumentUrl: signedLpoUrl,
        proformaDocumentName: shipment.proformaDocumentName || null,
        proformaDocumentUrl: signedProformaUrl,
        s1QualityReportName: shipment.s1QualityReportName || null,
        s1QualityReportUrl: signedS1QualityUrl,
        q1Report: shipment.q1Report || null,
        plannedETD: shipment.plannedETD,
        plannedETA: shipment.plannedETA,
        containerSize: shipment.containersize,
        noOfShipments: shipment.noOfShipments,
        shipmentStatus: getComputedShipmentStatus(shipment, containers),
      },
      planned,
      actual,
      scheduledHistory: scheduledHistoryLogs.map((entry) => ({
        id: entry._id,
        action: entry.action,
        remarks: entry.remarks || "",
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        user: entry.userId || entry.after?.historyActorName || entry.before?.historyActorName
          ? {
              id: entry.userId?._id || entry.userId || null,
              name:
                (entry.userId && entry.userId.name) ||
                entry.after?.historyActorName ||
                entry.before?.historyActorName ||
                "",
              email:
                (entry.userId && entry.userId.email) ||
                entry.after?.historyActorEmail ||
                entry.before?.historyActorEmail ||
                "",
            }
          : null,
        before: entry.before?.plannedContainers || [],
        after: entry.after?.plannedContainers || [],
      })),
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
