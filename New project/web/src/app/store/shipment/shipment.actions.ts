import { createAction, props } from '@ngrx/store';
import { ShipmentDetailsResponse } from '../../core/models/shipment.model';

// --- Load Shipment ---
export const loadShipmentDetail = createAction(
  '[Shipment Form] Load Detail',
  props<{ id: string }>()
);
export const loadShipmentDetailSuccess = createAction(
  '[Shipment Form] Load Detail Success',
  props<{ data: ShipmentDetailsResponse }>()
);
export const loadShipmentDetailFailure = createAction(
  '[Shipment Form] Load Detail Failure',
  props<{ error: string }>()
);

// --- Navigation ---
export const setCurrentStep = createAction(
  '[Shipment Form] Set Step',
  props<{ step: number }>()
);
export const setActiveSplitTab = createAction(
  '[Shipment Form] Set Split Tab',
  props<{ tab: 'planned' | 'actual' | 'history' | 'report' }>()
);

// --- Populate State from Loaded Data ---
export const populateFormState = createAction(
  '[Shipment Form] Populate State',
  props<{
    isPlannedLocked: boolean;
    totalContainers: number;
    submittedActualIndices: number[];
    submittedStep3Indices: number[];
    submittedStep4Indices: number[];
    submittedStep5Indices: number[];
    submittedStep6Indices: number[];
    submittedStep7Indices: number[];
  }>()
);

// --- Submit Planned ---
export const submitPlannedContainers = createAction(
  '[Shipment Form] Submit Planned',
  props<{ shipmentId: string; containers: any[]; plannedQtyMT: number; noOfShipments?: number; keepTab?: boolean }>()
);
export const submitPlannedSuccess = createAction(
  '[Shipment Form] Submit Planned Success',
  props<{ keepTab?: boolean }>()
);
export const submitPlannedFailure = createAction(
  '[Shipment Form] Submit Planned Failure',
  props<{ error: string }>()
);

// --- Step 2: Submit Actual ---
export const submitActualContainer = createAction(
  '[Shipment Form] Submit Actual',
  props<{ containerId: string; index: number; payload: any }>()
);
export const submitActualSuccess = createAction(
  '[Shipment Form] Submit Actual Success',
  props<{ index: number }>()
);
export const submitActualFailure = createAction(
  '[Shipment Form] Submit Actual Failure',
  props<{ error: string }>()
);

// --- Step 3: Documentation ---
export const submitDocumentation = createAction(
  '[Shipment Form] Submit Documentation',
  props<{ containerId: string; index: number; payload: any }>()
);
export const submitDocumentationSuccess = createAction(
  '[Shipment Form] Submit Documentation Success',
  props<{ index: number }>()
);
export const submitDocumentationFailure = createAction(
  '[Shipment Form] Submit Documentation Failure',
  props<{ error: string }>()
);

// --- Step 4: Logistics ---
export const submitLogistics = createAction(
  '[Shipment Form] Submit Logistics',
  props<{ containerId: string; index: number; payload: any }>()
);
export const submitLogisticsSuccess = createAction(
  '[Shipment Form] Submit Logistics Success',
  props<{ index: number }>()
);
export const submitLogisticsFailure = createAction(
  '[Shipment Form] Submit Logistics Failure',
  props<{ error: string }>()
);

// --- Step 5: Clearance Payment ---
export const submitClearancePayment = createAction(
  '[Shipment Form] Submit Clearance Payment',
  props<{ containerId: string; index: number; payload: any }>()
);
export const submitClearancePaymentSuccess = createAction(
  '[Shipment Form] Submit Clearance Payment Success',
  props<{ index: number }>()
);
export const submitClearancePaymentFailure = createAction(
  '[Shipment Form] Submit Clearance Payment Failure',
  props<{ error: string }>()
);

// --- Step 6: Clearance Final ---
export const submitClearanceFinal = createAction(
  '[Shipment Form] Submit Clearance Final',
  props<{ containerId: string; index: number; payload: any }>()
);
export const submitClearanceFinalSuccess = createAction(
  '[Shipment Form] Submit Clearance Final Success',
  props<{ index: number }>()
);
export const submitClearanceFinalFailure = createAction(
  '[Shipment Form] Submit Clearance Final Failure',
  props<{ error: string }>()
);

// --- Step 7: GRN ---
export const submitGRN = createAction(
  '[Shipment Form] Submit GRN',
  props<{ containerId: string; index: number; payload: any }>()
);
export const submitGRNSuccess = createAction(
  '[Shipment Form] Submit GRN Success',
  props<{ index: number }>()
);
export const submitGRNFailure = createAction(
  '[Shipment Form] Submit GRN Failure',
  props<{ error: string }>()
);

// --- Reset ---
export const resetShipmentFormState = createAction('[Shipment Form] Reset State');
