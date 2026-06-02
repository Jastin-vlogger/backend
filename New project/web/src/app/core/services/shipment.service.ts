import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  Shipment,
  ShipmentListResponse,
  ShipmentDetail,
  CreateShipmentPayload,
  CreateShipmentResponse,
  ShipmentDetailsResponse,
  ExtractShipmentFromDocumentsResponse,
  ExtractBillNoResponse,
  ExtractArrivalNoticeResponse,
  DashboardSummaryResponse
  ,
  ShipmentReportExportResponse,
  BlRowDefinitionItem
} from '../models/shipment.model';

// Payload interfaces for container operations
export interface PlannedContainer {
  size: number;
  qtyMT: number;
  bags: number;
  weekWiseShipment: string;
  FCL: number;
  etd?: string;
  eta?: string;
}

export interface CreatePlannedContainersPayload {
  shipmentId: string;
  plannedContainers: PlannedContainer[];
  noOfShipments?: number;
}

export interface ActualContainer {
  actualSerialNo?: string;
  commercialInvoiceNo?: string;
  shipOnBoardDate?: string;
  size: string;
  FCL: number;
  qtyMT: number;
  bags: number;
  pallet?: number;
  weekWiseShipment: string;
  buyingUnit: string;
  updatedETD: string;  // ISO date string
  updatedETA: string;  // ISO date string
  BLNo: string;
}

export interface BLDetailsPayload {
  blNo: string;
  shippedOnBoard: string;
  portOfLoading: string;
  portOfDischarge: string;
  noOfContainers: number;
  noOfBags: number;
  quantityByMt: number;
  shippingLine: string;
  freeDetentionDays: number;
  maximumDetentionDays: number;
  freightPrepared: string;
  costSheetBookings: Array<{
    sn: number;
    description: string;
    requestAmount: number;
    paidAmount: number;
  }>;
  storageAllocations: Array<{
    sn: number;
    containerSerialNo: string;
    bags?: number;
    warehouse: string;
    storageAvailability: number;
  }>;
}

export interface ShipmentContainerApprovalResponse {
  message: string;
  container: unknown;
}

// Step 3: Documentation (Document Tracker)
export interface DocumentationPaymentPayload {
  BLNo: string;
  courierTrackNo: string;
  courierServiceProvider: string;
  expectedDocDate: string;
  receiver: string;
  bankName: string;
  inwardCollectionAdviceDate: string;
  inwardCollectionAdviceDocumentUrl: string;
  murabahaContractReleasedDate: string;
  murabahaContractApprovedDate: string;
  murabahaContractSubmittedDate: string;
  murabahaContractSubmittedDocumentUrl: string;
  documentsReleasedDate: string;
  documentsReleasedDocumentUrl: string;
}

// Step 4: Logistics / Shipment Clearing Tracker
export interface DeliveryScheduleItem {
  deliveryDate: string;
  deliveryNo: string;
  noOfFCL: number | null;
  time: string;
  location: string;
}

export interface WarehouseScheduleItem extends DeliveryScheduleItem {
  grn: string;
}

export interface LogisticsPayload {
  arrivalOn: string;
  shipmentFreeRetentionDate: string;
  portRetentionWithPenaltyDate: string;
  maximumRetentionDate?: string;
  arrivalNoticeDate: string;
  arrivalNoticeDocumentUrl: string;
  advanceRequestDate: string;
  advanceRequestDocumentUrl: string;
  doReleasedDate: string;
  doReleasedDocumentUrl: string;
  doReleasedRemarks: string;
  dpApprovalDate: string;
  dpApprovalDocumentUrl: string;
  dpApprovalRemarks: string;
  customsClearanceDate: string;
  customsClearanceDocumentUrl: string;
  customsClearanceRemarks: string;
  tokenReceivedDate: string;
  municipalityDate: string;
  municipalityDocumentUrl: string;
  municipalityRemarks: string;
  transportationBooked: Array<{
    sn?: number;
    containerSerialNo: string;
    transportCompanyName: string;
    bookedDate: string;
    bookingTime: string;
    transportDate: string;
    transportTime: string;
    delayHours: number | null;
  }>;
}

// Step 5: Clearance Payment
export interface ClearancePaymentPayload {
  paid_amount: number;
  paidOn: string;  // ISO date string
  remarks: string;
}

// Step 6: Clearance Final
export interface ClearancePayload {
  clearedOn: string;  // ISO date string
  remarks: string;
  warehouse: string;
}

// Step 7: GRN
export interface GRNPayload {
  grnNo: string;
  grnDate: string;  // ISO date string
  statusRemarks: string;
}

export interface StorageDetailsPayload {
  storageSplits: Array<{
    containerSerialNo: string;
    bags?: number;
    warehouse: string;
    storageAvailability: number | null;
    receivedOnDate: string;
    receivedOnTime: string;
    customsInspection: string;
    grn: string;
    batch: string;
    productionDate: string;
    expiryDate: string;
    remarks: string;
    documentUrl?: string;
    documentName?: string;
  }>;
  storageDocumentUrl?: string;
  storageDocumentName?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ShipmentService {
  private apiUrl = 'shipment';

  constructor(private http: HttpClient) { }

  getShipments(page: number = 1, limit: number = 20): Observable<ShipmentListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<ShipmentListResponse>(this.apiUrl, { params });
  }

  searchShipments(query: string, page: number = 1, limit: number = 20): Observable<ShipmentListResponse> {
    const params = new HttpParams()
      .set('q', query)
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<ShipmentListResponse>(`${this.apiUrl}/search`, { params });
  }

  getShipmentById(id: string): Observable<ShipmentDetailsResponse> {
    return this.http.get<ShipmentDetailsResponse>(`${this.apiUrl}/${id}`);
  }

  getBlRowDefinitions(): Observable<{ rows: BlRowDefinitionItem[] }> {
    return this.http.get<{ rows: BlRowDefinitionItem[] }>(`${this.apiUrl}/bl-row-definitions`);
  }

  getDashboardSummary(): Observable<DashboardSummaryResponse> {
    return this.http.get<DashboardSummaryResponse>(`${this.apiUrl}/dashboard`);
  }

  getShipmentReportExportData(): Observable<ShipmentReportExportResponse> {
    return this.http.get<ShipmentReportExportResponse>(`${this.apiUrl}/reports/export-data`);
  }

  downloadShipmentReportExcel(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/reports/export/excel`, { responseType: 'blob' });
  }

  downloadShipmentReportPdf(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/reports/export/pdf`, { responseType: 'blob' });
  }

  createShipment(payload: CreateShipmentPayload | FormData): Observable<CreateShipmentResponse> {
    return this.http.post<CreateShipmentResponse>(`${this.apiUrl}/create`, payload);
  }

  /**
   * Extract shipment data from uploaded documents for autopopulating the form.
   * POST /shipment/extract-documents with FormData containing document1 and s1QualityReport files.
   */
  extractShipmentFromDocuments(formData: FormData): Observable<ExtractShipmentFromDocumentsResponse> {
    return this.http.post<ExtractShipmentFromDocumentsResponse>(`${this.apiUrl}/extract-documents`, formData);
  }

  /**
   * Extract bill number + packaging details from documents.
   * POST /shipment/extract-bill-no with FormData containing 'file' (BL), 'packaging_list_file', and 'packaging_brand'.
   */
  extractShipmentDetailsFromDocuments(formData: FormData): Observable<ExtractBillNoResponse> {
    return this.http.post<ExtractBillNoResponse>(`${this.apiUrl}/extract-bill-no`, formData);
  }

  extractArrivalNoticeFromDocument(formData: FormData): Observable<ExtractArrivalNoticeResponse> {
    return this.http.post<ExtractArrivalNoticeResponse>(`${this.apiUrl}/extract-arrival-notice`, formData);
  }

  updateShipment(id: string, shipment: Partial<ShipmentDetail>): Observable<ShipmentDetail> {
    return this.http.patch<ShipmentDetail>(`${this.apiUrl}/${id}`, shipment);
  }

  deleteShipment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // Row-level updates for specific steps if needed
  updateSplitRow(shipmentId: string, step: string, rowIndex: number, data: any): Observable<ShipmentDetail> {
    return this.http.put<ShipmentDetail>(`${this.apiUrl}/${shipmentId}/steps/${step}/rows/${rowIndex}`, data);
  }

  /**
   * Create planned containers for a shipment (Step 2 - Planned)
   * POST /shipment/container/planned/
   */
  createPlannedContainers(payload: CreatePlannedContainersPayload): Observable<any> {
    return this.http.post(`${this.apiUrl}/container/planned/`, payload);
  }

  /**
   * Create/Update actual container for a shipment (Step 2 - Actual)
   * PATCH /shipment/container/actual/:id
   * @param containerId - The container ID
   * @param containerData - The actual container data
   */
  createActualContainer(containerId: string, containerData: ActualContainer | FormData): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/actual/${containerId}`, containerData);
  }

  /**
   * Submit documentation/payment details (Step 3)
   * PATCH /shipment/container/payment/:id
   * @param containerId - The container ID
   * @param paymentData - Documentation and payment details
   */
  submitDocumentationPayment(containerId: string, paymentData: DocumentationPaymentPayload | FormData): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/payment/${containerId}`, paymentData);
  }

  submitBLDetails(containerId: string, payload: BLDetailsPayload | FormData): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/bl-details/${containerId}`, payload);
  }

  /**
   * Submit logistics/arrival details (Step 4)
   * PATCH /shipment/container/logistic/:id
   * @param containerId - The container ID
   * @param logisticsData - Arrival and clearance expected dates
   */
  submitLogistics(containerId: string, logisticsData: LogisticsPayload | FormData): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/logistic/${containerId}`, logisticsData);
  }

  /**
   * Submit clearance payment details (Step 5)
   * PATCH /shipment/container/clearence-payment/:id
   * @param containerId - The container ID
   * @param clearancePaymentData - Payment amount, date, and remarks
   */
  submitClearancePayment(containerId: string, clearancePaymentData: ClearancePaymentPayload): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/clearence-payment/${containerId}`, clearancePaymentData);
  }

  /**
   * Submit final clearance details (Step 6)
   * PATCH /shipment/container/clearance/:id
   * @param containerId - The container ID
   * @param clearanceData - Clearance date, remarks, and warehouse
   */
  submitClearance(containerId: string, clearanceData: ClearancePayload): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/clearance/${containerId}`, clearanceData);
  }

  submitStorageDetails(containerId: string, payload: StorageDetailsPayload | FormData): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/storage/${containerId}`, payload);
  }

  submitStorageArrivalRow(containerId: string, rowIndex: number, payload: FormData): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/storage-row/${containerId}/${rowIndex}`, payload);
  }

  submitQualityDetails(containerId: string, payload: FormData): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/quality/${containerId}`, payload);
  }

  submitPaymentCostingDetails(containerId: string, payload: FormData): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/payment-costing/${containerId}`, payload);
  }

  approveClearingAdvance(containerId: string): Observable<ShipmentContainerApprovalResponse> {
    return this.http.patch<ShipmentContainerApprovalResponse>(`${this.apiUrl}/container/bl-details/${containerId}/clearing-advance/approve`, {});
  }

  approvePaymentCosting(containerId: string): Observable<ShipmentContainerApprovalResponse> {
    return this.http.patch<ShipmentContainerApprovalResponse>(`${this.apiUrl}/container/payment-costing/${containerId}/approve`, {});
  }

  approveStorageAllocations(containerId: string): Observable<ShipmentContainerApprovalResponse> {
    return this.http.patch<ShipmentContainerApprovalResponse>(`${this.apiUrl}/container/bl-details/${containerId}/storage-allocations/approve`, {});
  }

  approveStorageArrival(containerId: string): Observable<ShipmentContainerApprovalResponse> {
    return this.http.patch<ShipmentContainerApprovalResponse>(`${this.apiUrl}/container/storage/${containerId}/approve`, {});
  }

  /**
   * Submit GRN details (Step 7)
   * PATCH /shipment/container/grn/:id
   * @param containerId - The container ID
   * @param grnData - GRN number, date, and status remarks
   */
  submitGRN(containerId: string, grnData: GRNPayload): Observable<any> {
    return this.http.patch(`${this.apiUrl}/container/grn/${containerId}`, grnData);
  }

  /**
   * PATCH /shipment/:id/supplier-email
   * Updates the vendor email on a shipment.
   */
  updateSupplierEmail(shipmentId: string, supplierEmail: string): Observable<{ message: string; supplierEmail: string }> {
    return this.http.patch<{ message: string; supplierEmail: string }>(
      `${this.apiUrl}/${shipmentId}/supplier-email`,
      { supplierEmail }
    );
  }

  updateBankName(shipmentId: string, bankName: string): Observable<{ message: string; bankName: string }> {
    return this.http.patch<{ message: string; bankName: string }>(
      `${this.apiUrl}/${shipmentId}/bank-name`,
      { bankName }
    );
  }
}
