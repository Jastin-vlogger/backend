// Pure, unit-testable builder for the Warehouse Manager dashboard:
// Allocation Status, Warehouse Allocation & Receiving table, and Receiving Status.

const num = (v) => Number(v) || 0;
const round2 = (n) => Math.round(n * 100) / 100;
const pct = (n, d) => (d > 0 ? round2((n / d) * 100) : 0);
const normalizeSerial = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, ' ');

// A storage split counts as "received" once it has GRN / batch / received date.
// Guards against both `undefined` (default param only covers this) and explicit `null` —
// Mongoose persists unset array slots (from out-of-order index writes) as real `null` entries.
const isSplitReceived = (split) => {
  if (!split) return false;
  return !!(String(split.grn || '').trim() || String(split.batch || '').trim() || split.receivedOnDate);
};

// Constructs the canonical label stored in container.storageAllocations[].warehouse,
// matching the format the UI dropdown creates: "${name} - ${code}" or just "${name}".
// When the code is identical to the name (e.g. warehouse "SAJAH" with code "SAJAH"), the
// suffix is dropped instead of producing a redundant "SAJAH - SAJAH".
const warehouseLabel = (wh) => {
  const name = String(wh.name || '').trim();
  const code = String(wh.code || '').trim();
  if (!code || code.toLowerCase() === name.toLowerCase()) return name;
  return `${name} - ${code}`;
};

/**
 * Builds the warehouse dashboard aggregates from a list of (lean) containers.
 *
 * @param {object[]} containers - lean Container documents
 * @param {object[]} [dbWarehouses] - active Warehouse documents from the Warehouse collection.
 *   When supplied, ALL db warehouses appear in byWarehouse (even with 0 allocations),
 *   ensuring the table is anchored to the database rather than container string data.
 *
 * Allocation source: actual.transportationBooked[] (one row per physical container, each
 *   carrying that container's CURRENT warehouse) — this is the authoritative, live source,
 *   since a container's warehouse can change after transport is arranged (a reroute) without
 *   the original storageAllocationDecision plan ever being updated to match. Falls back to the
 *   plan (itemAllocations[].allocations[].containersAssigned, or legacy storageAllocations[]
 *   rows) only for containers that haven't reached transportation-arrangement yet.
 * Received source: actual.storageSplits[] rows with GRN/received data, grouped by warehouse.
 */
const buildWarehouseDashboard = (containers = [], dbWarehouses = []) => {
  // When dbWarehouses are supplied, only count allocations for known warehouses.
  // This prevents stale container strings (old/renamed warehouses) from appearing.
  const knownLabels = dbWarehouses.length
    ? new Set(dbWarehouses.map(warehouseLabel))
    : null; // null = no filter (legacy / no-db mode)

  const allocByWh = new Map();
  const recvByWh = new Map();
  let totalAllocated = 0;
  let totalReceived = 0;
  let totalExpected = 0;
  // A container's storageSplits (or transportationBooked) can hold more than one row for the
  // same physical container (e.g. from a historical edit-save duplicate, or a legitimate
  // re-split) — dedupe by container serial so counts reflect distinct containers, not raw rows.
  const receivedKeysSeen = new Set();
  const allocatedKeysSeen = new Set();

  const addAlloc = (wh, fcl) => {
    const key = String(wh || '').trim();
    if (!key || fcl <= 0) return;
    if (knownLabels && !knownLabels.has(key)) return;
    allocByWh.set(key, (allocByWh.get(key) || 0) + fcl);
    totalAllocated += fcl;
  };
  const addRecv = (wh, fcl) => {
    const key = String(wh || '').trim();
    if (!key || fcl <= 0) return;
    if (knownLabels && !knownLabels.has(key)) return;
    recvByWh.set(key, (recvByWh.get(key) || 0) + fcl);
    totalReceived += fcl;
  };

  containers.forEach((container) => {
    const actual = container?.actual || {};
    const planned = container?.planned || {};
    const decision = actual.storageAllocationDecision || {};
    const itemAllocations = Array.isArray(decision.itemAllocations) ? decision.itemAllocations : [];
    const allocationRows = Array.isArray(actual.storageAllocations) ? actual.storageAllocations : [];
    const transportationBooked = Array.isArray(actual.transportationBooked) ? actual.transportationBooked : [];
    const splits = Array.isArray(actual.storageSplits) ? actual.storageSplits : [];
    // Fallback for transportationBooked rows with no warehouse recorded (a real data gap seen
    // in practice — a container can be physically received and recorded at a warehouse via the
    // storage-arrival flow even though its own transport-arrangement row was left blank).
    const splitWarehouseBySerial = new Map(
      splits
        .filter((s) => normalizeSerial(s?.containerSerialNo) && String(s?.warehouse || '').trim())
        .map((s) => [normalizeSerial(s.containerSerialNo), String(s.warehouse).trim()])
    );

    const approval = actual.storageAllocationApproval;
    const approvalStatus = approval ? (approval.status || 'draft') : null;
    const isAllocatedState = approvalStatus
      ? (approvalStatus === 'pending_warehouse_manager' || approvalStatus === 'approved')
      : true; // Legacy fallback if approval state object is missing

    let containerExpected = 0;
    let containerAllocated = 0;

    if (transportationBooked.length) {
      // Authoritative: count one distinct physical container per booked row, at its CURRENT
      // (post-reroute-if-any) warehouse — deduplicated by serial the same way "received" is.
      transportationBooked.forEach((row) => {
        const bookedWarehouse = String(row?.warehouse || '').trim();
        const warehouse = bookedWarehouse || splitWarehouseBySerial.get(normalizeSerial(row?.containerSerialNo)) || '';
        if (!warehouse) return;
        // Only dedupe when we have a real serial to key on — a shared/missing serial isn't
        // reliable evidence of a duplicate row (e.g. legacy rows can share other fields).
        const serialKey = normalizeSerial(row?.containerSerialNo);
        if (serialKey) {
          if (allocatedKeysSeen.has(serialKey)) return;
          allocatedKeysSeen.add(serialKey);
        }
        addAlloc(warehouse, 1);
        containerAllocated += 1;
      });
      itemAllocations.forEach((item) => {
        containerExpected += num(item.expectedContainers);
      });
    } else if (itemAllocations.length) {
      itemAllocations.forEach((item) => {
        containerExpected += num(item.expectedContainers);
        if (isAllocatedState) {
          (Array.isArray(item.allocations) ? item.allocations : []).forEach((a) => {
            const fcl = num(a.containersAssigned);
            addAlloc(a.warehouse, fcl);
            containerAllocated += fcl;
          });
        }
      });
    } else if (allocationRows.length && isAllocatedState) {
      // Fallback: each storageAllocations row represents one allocated container (FCL).
      allocationRows.forEach((row) => {
        addAlloc(row.warehouse, 1);
        containerAllocated += 1;
      });
    }

    // Expected FCL for pending-allocation math — only counted for containers that have
    // actually entered the allocation workflow (transport arranged, or have item/legacy
    // allocation data on file). Containers that never went through this workflow at all
    // aren't "pending allocation", they're simply outside its scope — counting them here was
    // what inflated this total to include the entire historical container backlog.
    const hasAllocationWorkflow = transportationBooked.length > 0 || itemAllocations.length > 0 || allocationRows.length > 0;
    if (hasAllocationWorkflow) {
      const expected = containerExpected || num(actual.FCL) || num(planned.FCL) || containerAllocated;
      totalExpected += Math.max(expected, containerAllocated);
    }

    // Received: one per received split, grouped by warehouse — deduplicated by container
    // serial when one is on file (see receivedKeysSeen above); rows with no serial are counted
    // as-is, since a shared/missing serial isn't reliable evidence of a duplicate row.
    splits.forEach((split) => {
      if (!isSplitReceived(split)) return;
      const serialKey = normalizeSerial(split.containerSerialNo);
      if (serialKey) {
        if (receivedKeysSeen.has(serialKey)) return;
        receivedKeysSeen.add(serialKey);
      }
      addRecv(split.warehouse, 1);
    });
  });

  // Use db warehouses as the canonical list when available; fall back to whatever
  // strings were found in container data (legacy mode without db warehouses).
  const warehouses = dbWarehouses.length
    ? new Set(dbWarehouses.map(warehouseLabel))
    : new Set([...allocByWh.keys(), ...recvByWh.keys()]);

  const byWarehouse = [...warehouses]
    .map((warehouse) => {
      const allocated = allocByWh.get(warehouse) || 0;
      const received = recvByWh.get(warehouse) || 0;
      const pendingReceiving = Math.max(allocated - received, 0);
      return { warehouse, allocated, received, pendingReceiving, progress: pct(received, allocated) };
    })
    .filter((w) => w.allocated > 0 || w.received > 0)
    .sort((a, b) => b.allocated - a.allocated);

  const pendingAllocation = Math.max(totalExpected - totalAllocated, 0);
  const total = totalAllocated + pendingAllocation;
  const pendingReceiving = Math.max(totalAllocated - totalReceived, 0);

  return {
    allocationStatus: {
      total,
      allocated: totalAllocated,
      pendingAllocation,
      allocatedPct: pct(totalAllocated, total),
      pendingPct: pct(pendingAllocation, total),
    },
    receivingStatus: {
      allocated: totalAllocated,
      received: totalReceived,
      pendingReceiving,
      receivedPct: pct(totalReceived, totalAllocated),
      pendingPct: pct(pendingReceiving, totalAllocated),
    },
    byWarehouse,
    totals: {
      allocated: totalAllocated,
      received: totalReceived,
      pendingReceiving,
      progress: pct(totalReceived, totalAllocated),
    },
  };
};

module.exports = { buildWarehouseDashboard, isSplitReceived };
