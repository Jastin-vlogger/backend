export type ShipmentStatusSeverity = 'success' | 'warn' | 'info' | 'secondary';

function hasMeaningfulValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function hasAssignedWarehouse(actualRow: any): boolean {
  const storageRows = [
    ...(Array.isArray(actualRow?.storageSplits) ? actualRow.storageSplits : []),
    ...(Array.isArray(actualRow?.storageAllocations) ? actualRow.storageAllocations : []),
  ];
  return storageRows.some((row) => hasMeaningfulValue(row?.warehouse));
}

export function hasTransitActualMilestone(actualRow: any): boolean {
  return [
    actualRow?.BLNo,
    actualRow?.commercialInvoiceNo,
    actualRow?.shipOnBoardDate,
    actualRow?.updatedETD,
    actualRow?.updatedETA,
  ].every(hasMeaningfulValue);
}

export function hasPortOfDischargeMilestone(actualRow: any): boolean {
  return hasMeaningfulValue(actualRow?.portOfDischarge);
}

export function getComputedShipmentStatus(params: {
  shipmentCurrentStage?: string | null;
  plannedRow?: any;
  actualRow?: any;
  isPlannedLocked?: boolean;
  fallbackStageLabel?: string | null;
}): string {
  const actualRow = params.actualRow;
  const plannedRow = params.plannedRow;

  if (hasPortOfDischargeMilestone(actualRow)) {
    return 'At Port of Discharge';
  }

  if (hasTransitActualMilestone(actualRow)) {
    return 'On Transit';
  }

  const plannedEtd = plannedRow?.etd ? new Date(plannedRow.etd) : null;
  if (plannedEtd && !Number.isNaN(plannedEtd.getTime())) {
    return 'ETD yet to due';
  }

  return String(params.fallbackStageLabel || params.shipmentCurrentStage || 'Shipment Entry').trim();
}

export function getShipmentStatusSeverity(status: string): ShipmentStatusSeverity {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'reached wh') return 'success';
  if (normalized === 'at port of discharge') return 'warn';
  if (normalized === 'on transit') return 'info';
  if (normalized === 'etd yet to due') return 'secondary';
  if (normalized === 'payment & costing' || normalized === 'quality') return 'success';
  if (normalized === 'shipment tracker' || normalized === 'shipment split') return 'info';
  return 'warn';
}
