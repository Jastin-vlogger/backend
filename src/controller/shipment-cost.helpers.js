// Pure, unit-testable mapper for the "Shipment Cost Report".
// One row per cost line (BL No, Description, Actual Paid) for every shipment, where
// Actual Paid = container.actual.paymentAllocations[].paidAmount (the "Clearing Advance
// Process" / Payment Allocation table, the same source as the per-shipment PDF).
//
// Cost lines are stored on every container of a BL (kept identical by sameBlSync), so
// summing all containers would count each line once per container. We therefore take ONE
// container per BL. A container with no BL No cannot be matched to others, so it counts alone.
//
// visibleTo[] (a per-row role filter used by the shipment page) is deliberately ignored:
// this report is limited to finance/management roles who may see every line.

const SHIPMENT_COST_COLUMNS = [
  { header: 'Sl No', key: 'slNo', width: 8 },
  { header: 'Shipment No.', key: 'shipmentNo', width: 20 },
  { header: 'Supplier', key: 'supplier', width: 28 },
  { header: 'BL No.', key: 'blNo', width: 22 },
  { header: 'Description', key: 'description', width: 46 },
  { header: 'Actual Paid', key: 'actualPaid', width: 16 },
];

const normalizeBlKey = (value) => String(value || '').trim().toUpperCase();
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const supplierNameOf = (shipment) =>
  String(shipment?.supplierId?.name || shipment?.supplierName || '').trim();

/**
 * @param {Array} shipments - lean Shipment docs (supplierId optionally populated with { name })
 * @param {Map<string, Array>} containersByShipment - shipmentId (string) -> lean Container docs, oldest first
 * @returns {{ rows: Array, totalActualPaid: number }}
 */
const buildShipmentCostRows = (shipments, containersByShipment) => {
  const rows = [];
  let total = 0;

  for (const shipment of shipments || []) {
    const containers = containersByShipment.get(String(shipment._id)) || [];
    const seenBlKeys = new Set();

    for (const container of containers) {
      const allocations = container?.actual?.paymentAllocations;
      if (!Array.isArray(allocations) || allocations.length === 0) continue;

      const blNo = String(container?.actual?.BLNo || '').trim();
      const blKey = blNo ? normalizeBlKey(blNo) : `container:${String(container._id)}`;
      if (seenBlKeys.has(blKey)) continue;
      seenBlKeys.add(blKey);

      const ordered = allocations
        .map((line, index) => ({ line, index }))
        .sort((a, b) => (Number(a.line?.sn) || a.index + 1) - (Number(b.line?.sn) || b.index + 1) || a.index - b.index);

      for (const { line } of ordered) {
        const paid = Number(line?.paidAmount);
        if (!Number.isFinite(paid) || paid <= 0) continue;
        const actualPaid = round2(paid);
        total += actualPaid;
        rows.push({
          slNo: rows.length + 1,
          shipmentNo: String(shipment.shipmentNo || ''),
          supplier: supplierNameOf(shipment),
          blNo,
          description: String(line?.description || '').trim(),
          actualPaid,
        });
      }
    }
  }

  return { rows, totalActualPaid: round2(total) };
};

module.exports = { SHIPMENT_COST_COLUMNS, buildShipmentCostRows };
