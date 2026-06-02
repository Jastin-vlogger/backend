export interface Item {
  _id: string;
  itemCode: string;
  description: string;
  riceName?: string;
  variant?: string;
  barcode?: string;
  hsCode?: string;
  packing: string;
  bagWeightKg: number | null;
  unit: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface ItemListResponse {
  page: number;
  limit: number;
  totalPages: number;
  totalRecords: number;
  items: Item[];
}

export interface ItemLookupResponse {
  _id: string;
  item_code: string;
  item_name?: string;
  brand?: string;
  barcode?: string;
  dm_barcode?: string;
  grain_type?: string;
  variant?: string;
  process_type?: string;
  blend?: string;
  country_of_origin?: string;
  unit_kg?: number;
  category?: string;
  hsCode?: string;
  hs_code?: string;
}
