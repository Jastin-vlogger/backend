export type SupplierStatus = 'Pending' | 'Active' | 'Inactive';
export type SupplierRegistrationStage = 'In Progress' | 'Draft';

export interface Supplier {
  _id: string;
  supplierCode: string;
  name: string;
  companyName?: string;
  country: string;
  status: SupplierStatus | string;
  registrationStage?: SupplierRegistrationStage | string;
  profileCompletionPercent?: number;
  profileCompletedAt?: string | null;
  missingFields?: string[];
  email?: string;
  phone?: string;
  contactPerson?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  notes?: string;
  portalEmail?: string;
  isPortalEnabled?: boolean;
  activatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export interface SupplierListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: SupplierStatus | 'All' | '';
}

export interface SupplierListResponse {
  page: number;
  limit: number;
  totalPages: number;
  totalRecords: number;
  suppliers: Supplier[];
}

export interface UpdateSupplierPayload {
  supplierCode?: string;
  name?: string;
  country?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  notes?: string;
}

export interface UpdateSupplierStatusPayload {
  status: SupplierStatus;
}
