export interface Shipment {
  _id: string;
  year: number;
  shipmentNo: string;
  orderDate: string;
  supplier: string;
  description: string;
  buyingQty: number;
  fcPerUnit: number;
  totalFC: number;
  noOfShipments: number;
  status: string;
}

export interface BlRowDefinitionItem {
  key: string;
  sn: number;
  description: string;
  visibleTo: string[];
  defaultQty: number;
  defaultRate: number;
  isActive?: boolean;
}

export interface ShipmentListResponse {
  page: number;
  limit: number;
  totalPages: number;
  totalRecords: number;
  shipments: Shipment[];
}

export interface ShipmentReportExportChildRow {
  rowType: 'child';
  shipmentNo: string;
  actualShipmentNo?: string;
  scheduledETD: string;
  scheduledETA: string;
  actualETD: string;
  actualETA: string;
  etaDifference: string;
  fcl: number | string;
  containerSize: number | string;
  buyingQtyMT: number | string;
  bags: number | string;
  pallet: number | string;
  month?: string;
  weekWiseShipment?: string;
  shipmentStatus?: string;
  currentStage: string;
}

export interface ShipmentReportExportRow {
  rowType?: 'parent';
  sn: number;
  year: number | string;
  shipmentNo: string;
  date: string;
  supplier: string;
  country: string;
  variant: string;
  itemDescription: string;
  riceName: string;
  packing: string | number;
  piNo: string;
  ciNo: string;
  fcl: number | string;
  containerSize: number | string;
  buyingUnit: string;
  buyingQtyMT: number | string;
  fcPerUnit: number | string;
  totalFC: number | string;
  incoterms: string;
  poNumber: string;
  fpoNo: string;
  bankName: string;
  paymentTerms: string;
  shipmentStatus?: string;
  currentStage: string;
  noOfShipments: number | string;
  portOfLoading: string;
  portOfDischarge: string;
  month?: string;
  advanceAmount: number | string;
  bags: number | string;
  pallet: number | string;
  actualShipmentNo?: string;
  weekWiseShipment?: string;
  children?: ShipmentReportExportChildRow[];
}

export interface ShipmentReportExportResponse {
  rows: ShipmentReportExportRow[];
  totalRecords: number;
  generatedAt: string;
}

export interface DashboardKpis {
  totalShipments: number;
  completedShipments: number;
  inProgressShipments: number;
  underClearanceShipments: number;
  totalPaymentExposure: number;
}

export interface DashboardStageBreakdown {
  stage: string;
  count: number;
}

export interface DashboardMonthlyTrend {
  label: string;
  month: number;
  year: number;
  count: number;
}

export interface DashboardArrivalSummary {
  totalContainers: number;
  arrivedContainers: number;
  pendingArrivalContainers: number;
  clearedContainers: number;
  dueThisWeekShipments: number;
  overdueShipments: number;
  etaScheduledShipments: number;
}

export interface DashboardPaymentSummary {
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  pendingShipments: number;
  partiallyPaidShipments: number;
  paidShipments: number;
}

export interface DashboardRecentShipment {
  _id: string;
  shipmentNo: string;
  orderDate: string;
  plannedETA?: string;
  status: string;
  totalAmount: number;
  supplier?: string;
  item?: string;
}

export interface ChartMappingRow {
  rowLabel: string;
  [key: string]: any;
}

export interface DashboardChartData {
  qtyMapping: ChartMappingRow[];
  valueMapping: ChartMappingRow[];
  yearlyQtyMapping: ChartMappingRow[];
  supplierAvgFc: ChartMappingRow[];
  supplierYearlyQty: ChartMappingRow[];
}

export interface DashboardSummaryResponse {
  kpis: DashboardKpis;
  stageBreakdown: DashboardStageBreakdown[];
  monthlyTrend: DashboardMonthlyTrend[];
  arrivalSummary: DashboardArrivalSummary;
  paymentSummary: DashboardPaymentSummary;
  rolePending?: { role: string; label: string; count: number };
  recentShipments: DashboardRecentShipment[];
  shippingStatus?: DashboardShippingStatus;
  chartData?: DashboardChartData;
}

export interface DashboardShippingStatusOrder {
  _id: string;
  customer: string;
  orderStatus: string;
  orderDate?: string;
}

export interface DashboardShippingStatusMetric {
  label: string;
  value: number;
}

export interface DashboardShippingStatusInventoryRow {
  category: string;
  product: string;
  sku: string;
  inStock: number;
}

export interface DashboardShippingStatusPerformanceRow {
  label: string;
  cashToCash: number;
  accountRec: number;
  inventoryDays: number;
  payableDays: number;
}

export interface DashboardShippingStatusMonthlyKpiRow {
  metric: string;
  thisMonth: number;
  pastMonth: number;
  change: number;
}

export interface DashboardShippingStatus {
  orders: DashboardShippingStatusOrder[];
  volumeToday: DashboardShippingStatusMetric[];
  inventory: DashboardShippingStatusInventoryRow[];
  financialPerformance: DashboardShippingStatusPerformanceRow[];
  monthlyKpis: DashboardShippingStatusMonthlyKpiRow[];
}

// Create Shipment Payload
export interface CreateShipmentPayload {
  poNumber: string;              // Shipment No.
  year: string;                  // Year (not shown in UI)
  orderDate: string;             // Order Date (YYYY-MM-DD)
  supplierId?: string;           // Optional supplier master ID
  supplierName: string;          // Supplier text
  supplierEmail?: string;
  itemId?: string;               // Item ID from dropdown (optional)
  itemCode?: string;
  itemDescription?: string;
  commodity?: string;
  countryOfOrigin?: string;
  brandName?: string;
  barcode?: string;
  dmBarcode?: string;
  variant?: string;
  hsCode?: string;
  packing?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  plannedQtyMT: string;          // Planned Quantity MT
  estimatedContainerCount: string; // Planned Containers
  estimatedContainerSize: string;  // Container Size
  plannedETD: string;            // Planned ETD (YYYY-MM-DD)
  plannedETA: string;            // Expected ETA (YYYY-MM-DD)
  piNo: string;                  // PI No.
  piDate?: string;
  fpoNo?: string;
  fcl?: string;
  pallet?: string;
  bags?: string;
  fcPerUnit: string;             // FC per Unit
  totalFC: string;               // Estimated Total FC
  amountAED: string;             // Converted AED value
  advanceAmount: number;         // Advance Amount
  totalAmount: string;           // Total Amount
  incoterms?: string;            // Inco Terms
  buyunit?: string;           // Buying Unit (MT/Bag)
  paymentTerms?: string;         // Payment Terms
  bankName?: string;
  q1Report?: string;
  itemsJson?: string;
  splitContainers?: string;      // Split Containers
  totalSplitQtyMT?: string;      // Total Split Quantity MT (from Split Containers)
}

// Create Shipment Response
export interface CreateShipmentResponse {
  message: string;
  supplierCreated?: boolean;
  inviteSent?: boolean;
  inviteStatusMessage?: string;
  data: {
    poNumber: string;
    year: number;
    supplierId: string;
    itemId?: string;
    shipmentNo: string;
    plannedQtyMT: number;
    piNo: string;
    totalSplitQtyMT: number;
    actualContainerCount: number;
    isFullySplit: boolean;
    orderDate: string;
    plannedETD: string;
    plannedETA: string;
    fcPerUnit: number;
    totalFC: number;
    amountAED: number;
    advanceAmount: number;
    payment: {
      totalAmount: number;
      paidAmount: number;
      balanceAmount: number;
      paymentStatus: string;
    };
    currentStage: string;
    _id: string;
    supplierName?: string;
    itemCode?: string;
    itemDescription?: string;
    commodity?: string;
    countryOfOrigin?: string;
    brandName?: string;
    barcode?: string;
    variant?: string;
    hsCode?: string;
    q1Report?: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
    __v: number;
  };
}

/**
 * Shipment calculations from extraction API (Python shipment_calculations).
 * Used to show FCL, pallets, bags and price-matching warning.
 */
export interface ShipmentCalculations {
  fcl?: number;
  bags?: number;
  quantity_in_mt?: number;
  container_size?: string;
  bags_per_container?: number;
  fcl_per_unit?: number;
  pallets?: number;
  price_per_mt?: number;
  is_price_matching?: boolean;
  lpo_price_per_mt?: number;
  pi_price_per_mt?: number;
  mt_variation?: number;
  diff_percent?: number;
}

/**
 * Response from document extraction API (POST /shipment/extract-documents).
 * Used to autopopulate shipment form from uploaded Purchase Order and S1 Quality Report documents.
 * Keys match Create New Shipment form controls; supplier/item are resolved from supplierCode/itemCode.
 */
export interface ExtractedShipmentData {
  // Shipment info
  piNo?: string;
  piDate?: string;
  fpoNo?: string;
  purchaseDate?: string;
  incoTerms?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  commodity?: string;
  brandName?: string;
  itemDescription?: string;
  barcode?: string;
  variant?: string;
  hsCode?: string;
  // Supplier (frontend resolves to supplier _id via supplierCode or supplierName)
  supplierCode?: string;
  supplierName?: string;
  countryOfOrigin?: string;
  // Item (frontend resolves to item _id via itemCode or itemDescription)
  itemCode?: string;
  // Quantity & packaging
  packagingType?: string;
  containerSize?: string;
  plannedContainers?: number;
  fcl?: number;
  pallet?: number;
  bags?: number;
  noOfShipments?: number;
  // Price & payment
  buyingUnit?: string;
  fclPerUnit?: number;
  fcPerUnit?: number;
  totalUSD?: number;
  totalAED?: number;
  paymentTerms?: string;
  advanceAmount?: number;
  // Dates
  expectedETD?: string;
  expectedETA?: string;
  /** From Python shipment_calculations; used for FCL/pallet/bags and price-mismatch warning. */
  shipmentCalculations?: ShipmentCalculations;
  /** Full S1 quality extraction payload from Python response (s1_quality_report). */
  q1Report?: {
    report_details?: {
      report_date?: string | null;
      report_no?: string | null;
    };
    sample_details?: Record<string, unknown>;
    quality_parameters?: Array<Record<string, unknown>>;
    cooking_result?: Record<string, unknown>;
    analysis_details?: Record<string, unknown>;
    [key: string]: unknown;
  };
  items?: ExtractedShipmentItem[];
}

export interface ExtractedShipmentItem {
  lineNo?: number;
  itemCode?: string;
  itemDescription?: string;
  commodity?: string;
  brandName?: string;
  countryOfOrigin?: string;
  barcode?: string;
  dmBarcode?: string;
  variant?: string;
  hsCode?: string;
  packagingType?: string;
  containerSize?: string;
  plannedContainers?: number;
  fcl?: number;
  pallet?: number;
  bags?: number;
  noOfShipments?: number;
  buyingUnit?: string;
  fclPerUnit?: number;
  fcPerUnit?: number;
  totalUSD?: number;
  totalAED?: number;
  expectedETD?: string;
  expectedETA?: string;
}

export interface ExtractShipmentFromDocumentsResponse {
  message?: string;
  data?: ExtractedShipmentData;
}

/** Response from bill-no extraction API (POST /shipment/extract-bill-no). */
export interface ExtractBillNoResponse {
  bill_no: string;
  invoice_number?: string;
  shipped_on_board_date?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  number_of_containers?: number;
  number_of_bags?: number;
  quantity_mt?: number;
  shipping_line?: string;
  free_detention_days?: number;
  maximum_detention_days?: number;
  freight_prepaid?: boolean;
  bill_extracted_data?: any;
  packaging_list?: {
    brand?: string;
    expiry_date?: string;
    packing_description?: string;
    total_bags?: number;
    total_gross_weight?: string;
    total_net_weight?: string;
    container_info?: Array<{
      container_number?: string;
      no_of_bags?: number;
      gross_weight?: string;
      net_weight?: string;
    }>;
  };
  containers?: Array<{
    container_no?: string;
    containerNo?: string;
    pkg_ct?: number;
    pkgCt?: number;
  }>;
  metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost_incurred?: number;
    cost_currency?: string;
    latency_ms?: number;
    model?: string;
  };
}

export interface ExtractArrivalNoticeResponse {
  arrival_on?: string | null;
  free_retension_days?: number;
  print_date?: string | null;
  printed_date?: string | null;
  issue_date?: string | null;
  metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost_incurred?: number;
    cost_currency?: string;
    latency_ms?: number;
    model?: string;
  } | null;
}

// Shipment Details API Response (GET /shipment/:id)
export interface ShipmentDetailsResponse {
  shipment: ShipmentInfo;
  planned: PlannedContainer[];
  actual: ActualContainer[];
  scheduledHistory?: ScheduledHistoryEntry[];
}

export interface ScheduledHistoryEntry {
  id: string;
  action: 'ScheduledBaselineCreated' | 'ScheduledBaselineUpdated';
  remarks: string;
  createdAt: string;
  updatedAt?: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
  } | null;
  before: PlannedContainer[];
  after: PlannedContainer[];
}

export interface ShipmentInfo {
  _id: string;
  shipmentNo: string;
  orderDate: string;
  orderNumber?: string;
  poNumber?: string;
  fpoNo?: string;
  supplier: string;
  supplierEmail?: string;
  item: string;
  itemCode?: string;
  commodity?: string;
  countryOfOrigin?: string;
  itemDescription?: string;
  riceName?: string;
  packing?: string;
  piNo: string;
  piDate?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  fcl?: number;
  pallet?: number;
  bags?: number;
  plannedQtyMT: number;
  assumedContainerCount: number;
  currentStage: string;
  payment: number;
  totalAED?: number;
  incoterms?: string;
  buyunit?: string;
  fcPerUnit?: number;
  advanceAmount?: number;
  paymentTerms?: string;
  bankName?: string;
  barcode?: string;
  dmBarcode?: string;
  variant?: string;
  hsCode?: string;
  lpoDocumentName?: string;
  lpoDocumentUrl?: string;
  proformaDocumentName?: string;
  proformaDocumentUrl?: string;
  s1QualityReportName?: string;
  s1QualityReportUrl?: string;
  q1Report?: Record<string, unknown> | null;
  plannedETD?: string;
  plannedETA?: string;
  containerSize?: number;
  noOfShipments?: number;
  lineItems?: Array<{
    lineNo?: number | null;
    itemCode?: string | null;
    itemDescription?: string | null;
    commodity?: string | null;
    countryOfOrigin?: string | null;
    brandName?: string | null;
    barcode?: string | null;
    dmBarcode?: string | null;
    variant?: string | null;
    hsCode?: string | null;
    packagingType?: string | null;
    containerSize?: string | null;
    plannedContainers?: number | null;
    fcl?: number | null;
    pallet?: number | null;
    bags?: number | null;
    buyingUnit?: string | null;
    fclPerUnit?: number | null;
    fcPerUnit?: number | null;
    totalUSD?: number | null;
    totalAED?: number | null;
  }>;
}

// Step 1: Planned Split
export interface PlannedContainer {
  containerId: string;
  shipmentStatus?: string;
  size: string;
  FCL: number;
  qtyMT: number;
  bags: number;
  weekWiseShipment: string;
  etd?: string;
  eta?: string;
  buyingUnit: string;
  status: 'Planned' | 'Actual' | 'Documentation' | 'Arrival' | 'Clearance Paid' | 'Clearance Final' | 'GRN';
}

export interface DeliverySchedule {
  deliveryDate?: string;
  deliveryNo?: string;
  noOfFCL?: number;
  time?: string;
  location?: string;
}

export interface WarehouseSchedule extends DeliverySchedule {
  grn?: string;
}

export interface ClearingAdvanceApprovalState {
  status?: 'draft' | 'pending_fas' | 'pending_fas_manager' | 'approved';
  submittedAt?: string | null;
  submittedBy?: string | null;
  fasApprovedAt?: string | null;
  fasApprovedBy?: string | null;
  fasManagerApprovedAt?: string | null;
  fasManagerApprovedBy?: string | null;
}

export interface PaymentCostingApprovalState {
  status?: 'draft' | 'pending_fas_manager' | 'approved';
  submittedAt?: string | null;
  submittedBy?: string | null;
  fasManagerApprovedAt?: string | null;
  fasManagerApprovedBy?: string | null;
}

export interface StorageAllocationApprovalState {
  status?: 'draft' | 'pending_warehouse_manager' | 'approved';
  submittedAt?: string | null;
  submittedBy?: string | null;
  warehouseManagerApprovedAt?: string | null;
  warehouseManagerApprovedBy?: string | null;
}

export interface StorageArrivalApprovalState {
  status?: 'draft' | 'pending_warehouse_manager' | 'approved';
  submittedAt?: string | null;
  submittedBy?: string | null;
  warehouseManagerApprovedAt?: string | null;
  warehouseManagerApprovedBy?: string | null;
}

// Steps 2-7: Actual Container Data
export interface ActualContainer {
  containerId: string;
  shipmentStatus?: string;
  size?: string;
  // Step 2: Actual Split
  actualSerialNo?: string;
  commercialInvoiceNo?: string;
  shipOnBoardDate?: string;
  qtyMT?: number;
  bags?: number;
  pallet?: number;
  FCL?: number;
  weekWiseShipment?: string;
  buyingUnit?: string;
  receivedOn?: string;
  updatedETD?: string;
  updatedETA?: string;
  BLNo?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  noOfContainers?: number;
  noOfBags?: number;
  quantityByMt?: number;
  shippingLine?: string;
  freeDetentionDays?: number;
  maximumDetentionDays?: number;
  freightPrepared?: string;
  billExtractionData?: {
    bill_no?: string;
    invoice_number?: string;
    containers?: Array<{
      container_no?: string;
      containerNo?: string;
      pkg_ct?: number;
      pkgCt?: number;
    }>;
  };
  actualBags?: number;
  expiryDate?: string;
  hsCode?: string;
  tokenReceivedDate?: string;
  packagingDate?: string;
  grossWeight?: string;
  netWeight?: string;
  blDocumentUrl?: string;
  blDocumentName?: string;
  packagingListDocumentUrl?: string;
  packagingListDocumentName?: string;
  costSheetBookingDocumentUrl?: string;
  costSheetBookingDocumentName?: string;
  packagingList?: {
    brand?: string;
    expiryDate?: string;
    packingDescription?: string;
    totalBags?: number;
    totalGrossWeight?: string;
    totalNetWeight?: string;
    containerInfo?: Array<{
      container_number?: string;
      no_of_bags?: number;
      gross_weight?: string;
      net_weight?: string;
    }>;
  };
  extractedContainers?: Array<{
    containerNo?: string;
    pkgCt?: number;
  }>;
  costSheetBookings?: {
    sn?: number;
    description?: string;
    visibleTo?: string[];
    defaultQty?: number;
    defaultRate?: number;
    requestAmount?: number;
    paidAmount?: number;
    remarks?: string;
    attachmentDocumentUrl?: string;
    attachmentDocumentName?: string;
  }[];
  clearingAdvanceApproval?: ClearingAdvanceApprovalState;
  storageAllocations?: {
    sn?: number;
    containerSerialNo?: string;
    bags?: number;
    warehouse?: string;
    storageAvailability?: number;
  }[];
  storageAllocationApproval?: StorageAllocationApprovalState;
  storageArrivalApproval?: StorageArrivalApprovalState;
  // Step 3: Documentation — Purchase
  DHL?: string;
  courierTrackNo?: string;
  courierServiceProvider?: string;
  docArrivalNotes?: string;
  expectedDocDate?: string;
  receiver?: string;
  bankName?: string;
  inwardCollectionAdviceDate?: string;
  inwardCollectionAdviceDocumentUrl?: string;
  inwardCollectionAdviceDocumentName?: string;
  murabahaContractReleasedDate?: string;
  murabahaContractApprovedDate?: string;
  murabahaContractSubmittedDate?: string;
  murabahaContractSubmittedDocumentUrl?: string;
  murabahaContractSubmittedDocumentName?: string;
  documentsReleasedDate?: string;
  documentsReleasedDocumentUrl?: string;
  documentsReleasedDocumentName?: string;
  // Step 3: Documentation — legacy
  bankAdvanceAmountDocumentUrl?: string;
  bankAdvanceApprovedDocumentUrl?: string;
  bankAdvanceSubmittedOn?: string;
  docToBeReleasedOn?: string;
  // Step 3: Documentation — Logistics (legacy)
  documentCollectedOn?: string;
  // Legacy
  bankAdvanceAmount?: number;
  // Step 4: Shipment Clearing Tracker
  arrivalOn?: string;
  shipmentFreeRetentionDate?: string;
  portRetentionWithPenaltyDate?: string;
  maximumRetentionDate?: string;
  arrivalNoticeFreeRetentionDays?: number;
  arrivalNoticeDocumentUrl?: string;
  arrivalNoticeDocumentName?: string;
  arrivalNoticeDate?: string;
  advanceRequestDocumentUrl?: string;
  advanceRequestDocumentName?: string;
  advanceRequestDate?: string;

  dpApprovalDocumentUrl?: string;
  dpApprovalDocumentName?: string;
  dpApprovalDate?: string;
  dpApprovalRemarks?: string;

  // New BOE fields (renamed from dpApproval)
  boePassingDate?: string;
  boePassingDocumentUrl?: string;
  boePassingDocumentName?: string;
  boePassingRemarks?: string;
  dmBarcode?: string;

  customsClearanceDocumentUrl?: string;
  customsClearanceDocumentName?: string;
  customsClearanceDate?: string;
  customsClearanceRemarks?: string;

  tokenDocumentUrl?: string;
  tokenDate?: string;

  municipalityDocumentUrl?: string;
  municipalityDocumentName?: string;
  municipalityDate?: string;
  municipalityRemarks?: string;
  municipalityClearanceDocumentUrl?: string;
  municipalityClearanceDate?: string;
  municipalityClearanceRemarks?: string;
  
  // New Transportation Booked Fields
  transportCompanyName?: string;
  transportBookedDate?: string;
  transportBookingTime?: string;
  transportDate?: string;
  transportTime?: string;
  transportDelayHours?: number;
  transportTokenGateNo?: string;

  doReleasedDate?: string;
  doReleasedDocumentUrl?: string;
  doReleasedDocumentName?: string;
  doReleasedRemarks?: string;

  deliverySchedules?: DeliverySchedule[];
  warehouseSchedules?: WarehouseSchedule[];
  transportationBooked?: Array<{
    sn?: number;
    containerSerialNo?: string;
    transportCompanyName?: string;
    bookedDate?: string;
    bookingTime?: string;
    transportDate?: string;
    transportTime?: string;
    delayHours?: number;
  }>;
  lockedLogisticsSections?: string[];
  
  // Customs Original Document Submission
  customsOriginalDocuments?: {
    boeSubmissionDate?: string;
    boeDocumentUrl?: string;
    boeDocumentName?: string;
    doSubmissionDate?: string;
    doDocumentUrl?: string;
    doDocumentName?: string;
    blOriginalSubmissionDate?: string;
    blOriginalDocumentUrl?: string;
    blOriginalDocumentName?: string;
    invoiceSubmissionDate?: string;
    invoiceDocumentUrl?: string;
    invoiceDocumentName?: string;
    packingListSubmissionDate?: string;
    packingListDocumentUrl?: string;
    packingListDocumentName?: string;
    cooSubmissionDate?: string;
    cooDocumentUrl?: string;
    cooDocumentName?: string;
  };
  
  // Step 4 legacy
  clearExpectedOn?: string;
  shipmentArrivedOn?: string;
  // Step 4: Arrival — Warehouse (legacy single fields)
  warehouseReceivedOn?: string;
  warehouseGrnNo?: string;
  qualityInspectionReportDate?: string;
  
  // Step 5: Storage Allocation & Arrival — per physical container
  storageSplits?: {
    containerSerialNo?: string;
    bags?: number;
    warehouse?: string;
    storageAvailability?: number;
    receivedOnDate?: string;
    receivedOnTime?: string;
    customsInspection?: string;
    grn?: string;
    batch?: string;
    productionDate?: string;
    expiryDate?: string;
    hsCode?: string;
    grossWeight?: string;
    netWeight?: string;
    remarks?: string;
    documentUrl?: string;
    documentName?: string;
  }[];
  storageDocumentUrl?: string;
  storageDocumentName?: string;

  // Transport per physical container (from Port & Customs step)
  transportSplits?: {
    containerSerialNo?: string;
    transportCompanyName?: string;
    transportBookedDate?: string;
    transportBookingTime?: string;
    transportDate?: string;
    transportTime?: string;
    transportDelayHours?: number;
    transportTokenGateNo?: string;
  }[];

  // Step 5 legacy: Clearance Paid
  paid_amount?: number;
  paidOn?: string;
  remarks?: string;
  // Step 6: Clearance Final
  clearance?: {
    clearedOn: string;
    remarks: string;
    warehouse: string;
  };
  // Step 7: GRN
  grn?: {
    grnNo: string;
    grnDate: string;
    statusRemarks: string;
  };
  qualityRows?: {
    sn?: number;
    sampleNo?: string;
    phase?: string;
    date?: string;
    inhouseReportNo?: string;
    inhouseReportDate?: string;
    inhouseReportDocumentUrl?: string;
    inhouseReportDocumentName?: string;
    strategicReportNo?: string;
    strategicReportDate?: string;
    strategicReportDocumentUrl?: string;
    strategicReportDocumentName?: string;
    thirdPartyReportNo?: string;
    thirdPartyReportDate?: string;
    thirdPartyReportDocumentUrl?: string;
    thirdPartyReportDocumentName?: string;
  }[];
  qualityReports?: {
    phase?: string;
    reportDate?: string;
    remarks?: string;
    documentUrl?: string;
    documentName?: string;
  }[];
  paymentAllocations?: {
    sn?: number;
    description?: string;
    visibleTo?: string[];
    defaultQty?: number;
    defaultRate?: number;
    requestAmount?: number;
    paidAmount?: number;
    reference?: string;
    attachmentDocumentUrl?: string;
    attachmentDocumentName?: string;
  }[];
  paymentCostings?: {
    sn?: number;
    description?: string;
    visibleTo?: string[];
    defaultQty?: number;
    defaultRate?: number;
    requestAmount?: number;
    paidAmount?: number;
    actualPaid?: number;
    refBillNo?: string;
    refBillDate?: string;
    refBillVendor?: string;
    refBillDocumentUrl?: string;
    refBillDocumentName?: string;
  }[];
  paymentCostingApproval?: PaymentCostingApprovalState;
  packagingExpenses?: {
    sn?: number;
    item?: string;
    packing?: string;
    qty?: number;
    uom?: string;
    unitCostFC?: number;
    unitCostDH?: number;
    totalCostFC?: number;
    totalCostDH?: number;
    expenseAllocationFactor?: number;
    expensesAllocated?: number;
    totalValueWithExpenses?: number;
    landedCostPerUnit?: number;
    reference?: string;
  }[];
  paymentCostingDocumentUrl?: string;
  paymentCostingDocumentName?: string;
}

// Legacy interfaces for form/detail views (keep for backward compatibility)
export interface ShipmentDetail {
  id?: string;
  shipmentNo: string;
  piNo?: string;
  fpoNo?: string;
  incoTerms?: string;
  item?: { label: string; value: string };
  supplier?: { label: string; value: string };
  countryOfOrigin?: string;
  itemDescription?: string;
  packagingType?: { label: string; value: string };
  containerSize?: string;
  status?: string;
  
  // Financials
  paymentTerms?: { label: string; value: string };
  plannedContainers: number;
  fcPerUnit: number;
  estimatedTotalFC: number;
  advanceAmount?: number;
  
  // Dates
  expectedETD?: Date;
  expectedETA?: Date;

  // Step 2 Splits
  plannedSplits: PlannedSplit[];
  actualSplits: ActualSplit[];
  documentationSplits: DocumentationSplit[];
  arrivalTimeSplits: ArrivalTimeSplit[];
  clearancePaidSplits: ClearancePaidSplit[];
  clearanceFinalSplits: ClearanceFinalSplit[];
  grnSplits: GrnSplit[];
}

export interface PlannedSplit {
  size: number;
  qtyMT: number;
  bags: number;
  weekWiseShipment: string;
  FCL: number;
  etd?: Date;
  eta?: Date;
}

export interface ActualSplit {
  size?: number;
  actualSerialNo?: string;
  commercialInvoiceNo?: string;
  shipOnBoardDate?: Date;
  qtyMT: number;
  bags?: number;
  weekWiseShipment?: string;
  FCL?: number;
  updatedETD?: Date;
  updatedETA?: Date;
  BLNo: string;
}

export interface DocumentationSplit {
  courierTrackNo?: string;
  courierServiceProvider?: string;
  docArrivalNotes?: string;
  BLNo: string;
  receiver?: string;
  bankName?: string;
  expectedDocDate?: Date;
  inwardCollectionAdviceDate?: Date;
  murabahaContractReleasedDate?: Date;
  murabahaContractApprovedDate?: Date;
  murabahaContractSubmittedDate?: Date;
  documentsReleasedDate?: Date;
}

export interface ArrivalTimeSplit {
  shipmentArrivedOn: Date;
  clearExpectedOn: Date;
}

export interface ClearancePaidSplit {
  paid_amount: number;
  paidOn: Date;
  remarks?: string;
}

export interface ClearanceFinalSplit {
  clearedOn: Date;
  remarks?: string;
  warehouse: string;
}

export interface GrnSplit {
  grnNo: string;
  grnDate: Date;
  statusRemarks?: string;
}
