// Pure, unit-testable mapper for the "Shipment Status Summary RH" report.
// Mirrors the columns of the manually-maintained "RH" sheet in the reference workbook:
// Sl No, Shipment No., Supplier, Item description, FCL, Bag, Ton, COM IN NO, BLNo, GRN,
// Qty, WH, BATCH, P.Date, E.Date, Status.
//
// Row granularity is one row per warehouse-allocation/storage-split entry on a container
// (same "base row" concept as buildStorageArrivalReportRows in shipment.controller.js),
// with one extra case: a container that has no storage allocations or splits at all yet
// (nothing booked to any warehouse) produces a single "HOLD" row carrying only its
// FCL/Bag/Ton totals — matching the manual sheet's convention for LPO quantity that
// hasn't reached a container/warehouse booking yet.

const RH_STATUS_SUMMARY_COLUMNS = [
  { header: 'Sl No', key: 'slNo', width: 8 },
  { header: 'Shipment No.', key: 'shipmentNo', width: 18 },
  { header: 'Supplier', key: 'supplier', width: 20 },
  { header: 'Item description', key: 'itemDescription', width: 28 },
  { header: 'FCL', key: 'fcl', width: 8 },
  { header: 'Bag', key: 'bag', width: 10 },
  { header: 'Ton', key: 'ton', width: 10 },
  { header: 'COM IN NO', key: 'comInNo', width: 18 },
  { header: 'BLNo', key: 'blNo', width: 20 },
  { header: 'GRN', key: 'grn', width: 18 },
  { header: 'Qty', key: 'qty', width: 10 },
  { header: 'WH', key: 'wh', width: 12 },
  { header: 'BATCH', key: 'batch', width: 12 },
  { header: 'P.Date', key: 'pDate', width: 12 },
  { header: 'E.Date', key: 'eDate', width: 12 },
  { header: 'Status', key: 'status', width: 12 },
];

const normalizeSerial = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * @param {Array} shipments - lean Shipment docs, supplierId populated with { name }
 * @param {Map<string, Array>} containersByShipment - shipmentId (string) -> lean Container docs
 * @param {(d: any) => string} formatDate - date formatter, e.g. formatDateValue from shipment.controller.js
 */
const buildRhStatusSummaryRows = (shipments, containersByShipment, formatDate) => {
  const rows = [];
  let slNo = 0;

  shipments.forEach((shipment) => {
    const shipmentContainers = containersByShipment.get(String(shipment._id)) || [];
    const shipmentNo = shipment.shipmentNo || shipment.poNumber || '';
    const supplier = shipment.supplierId?.name || shipment.supplierName || '';
    const itemDescription = shipment.itemId?.description || shipment.itemDescription || '';

    shipmentContainers.forEach((container) => {
      const actual = container?.actual || {};
      const planned = container?.planned || {};
      const splits = Array.isArray(actual.storageSplits) ? actual.storageSplits : [];
      const allocations = Array.isArray(actual.storageAllocations) ? actual.storageAllocations : [];
      const baseRows = allocations.length ? allocations : splits;

      const common = {
        shipmentNo,
        supplier,
        itemDescription,
        fcl: actual.FCL ?? planned.FCL ?? '',
        bag: actual.bags ?? planned.bags ?? '',
        ton: actual.qtyMT ?? planned.qtyMT ?? '',
        comInNo: actual.commercialInvoiceNo || '',
        blNo: actual.BLNo || '',
      };

      if (!baseRows.length) {
        slNo += 1;
        rows.push({
          slNo,
          ...common,
          grn: '',
          qty: '',
          wh: '',
          batch: '',
          pDate: '',
          eDate: '',
          status: 'HOLD',
        });
        return;
      }

      baseRows.forEach((base, index) => {
        const key = normalizeSerial(base?.containerSerialNo);
        const split = (key && splits.find((s) => normalizeSerial(s?.containerSerialNo) === key)) || splits[index] || {};
        const received = !!(String(split.grn || '').trim() || String(split.batch || '').trim() || split.receivedOnDate);

        slNo += 1;
        rows.push({
          slNo,
          ...common,
          grn: split.grn || '',
          qty: received ? (split.bags ?? '') : '',
          wh: split.warehouse || base?.warehouse || '',
          batch: split.batch || '',
          pDate: formatDate(split.productionDate) || '',
          eDate: formatDate(split.expiryDate) || '',
          status: received ? 'Arrived' : 'Port',
        });
      });
    });
  });

  return rows;
};

module.exports = { RH_STATUS_SUMMARY_COLUMNS, buildRhStatusSummaryRows };
