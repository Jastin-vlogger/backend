import { Supplier } from './supplier.model';

export type SupplierScheduleStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected';

export interface SupplierScheduleHistoryEntry {
  action: string;
  actorType: string;
  actorName?: string;
  changes: {
    field: string;
    label: string;
    previousValue?: string;
    nextValue?: string;
  }[];
  createdAt: string;
}

export interface SupplierSchedule {
  _id: string;
  supplierId: string | (Partial<Supplier> & { name?: string; country?: string; supplierCode?: string; status?: string });
  supplier?: Pick<Supplier, '_id' | 'supplierCode' | 'name' | 'country' | 'status'>;
  shipmentType?: string;
  origin?: string;
  destination?: string;
  plannedDepartureDate?: string | null;
  plannedArrivalDate?: string | null;
  frequency?: string;
  capacity?: number | null;
  scheduleNo?: string;
  scheduleCode?: string;
  title?: string;
  referenceNo?: string;
  scheduledDate?: string;
  timeWindow?: string;
  location?: string;
  route?: string;
  notes?: string;
  status: SupplierScheduleStatus | string;
  rejectionReason?: string;
  suggestion?: string;
  adminSuggestion?: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  scheduleHistory?: SupplierScheduleHistoryEntry[];
  updatedAt?: string;
  createdAt?: string;
}

export interface SupplierScheduleListResponse {
  page: number;
  limit: number;
  totalPages: number;
  totalRecords: number;
  schedules: SupplierSchedule[];
}

export interface SupplierScheduleListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: SupplierScheduleStatus | 'All' | '';
  supplierId?: string;
}

export interface UpdateSupplierSchedulePayload {
  title?: string;
  scheduleNo?: string;
  scheduleCode?: string;
  referenceNo?: string;
  scheduledDate?: string;
  timeWindow?: string;
  location?: string;
  route?: string;
  notes?: string;
}

export interface RejectSupplierSchedulePayload {
  reason: string;
}

export interface SuggestSupplierSchedulePayload {
  suggestion: string;
}
