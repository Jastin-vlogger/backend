import { createReducer, on } from '@ngrx/store';
import { initialShipmentState, ShipmentState } from './shipment.state';
import * as ShipmentActions from './shipment.actions';

export const shipmentReducer = createReducer<ShipmentState>(
  initialShipmentState,

  // Load
  on(ShipmentActions.loadShipmentDetail, (state, { id }) => ({
    ...state,
    loading: true,
    error: null,
    shipmentId: id,
  })),
  on(ShipmentActions.loadShipmentDetailSuccess, (state, { data }) => ({
    ...state,
    loading: false,
    shipmentData: data,
  })),
  on(ShipmentActions.loadShipmentDetailFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  // Navigation
  on(ShipmentActions.setCurrentStep, (state, { step }) => ({
    ...state,
    currentStep: step,
  })),
  on(ShipmentActions.setActiveSplitTab, (state, { tab }) => ({
    ...state,
    activeSplitTab: tab,
  })),

  // Populate from loaded data
  on(ShipmentActions.populateFormState, (state, payload) => ({
    ...state,
    isPlannedLocked: payload.isPlannedLocked,
    totalContainers: payload.totalContainers,
    submittedActualIndices: payload.submittedActualIndices,
    submittedStep3Indices: payload.submittedStep3Indices,
    submittedStep4Indices: payload.submittedStep4Indices,
    submittedStep5Indices: payload.submittedStep5Indices,
    submittedStep6Indices: payload.submittedStep6Indices,
    submittedStep7Indices: payload.submittedStep7Indices,
  })),

  // Planned
  on(ShipmentActions.submitPlannedContainers, (state) => ({
    ...state,
    submittingPlanned: true,
  })),
  on(ShipmentActions.submitPlannedSuccess, (state, { keepTab }) => ({
    ...state,
    submittingPlanned: false,
    isPlannedLocked: true,
    activeSplitTab: keepTab ? state.activeSplitTab : ('actual' as const),
  })),
  on(ShipmentActions.submitPlannedFailure, (state) => ({
    ...state,
    submittingPlanned: false,
  })),

  // Step 2: Actual
  on(ShipmentActions.submitActualContainer, (state, { index }) => ({
    ...state,
    submittingRowIndex: index,
  })),
  on(ShipmentActions.submitActualSuccess, (state, { index }) => ({
    ...state,
    submittingRowIndex: null,
    submittedActualIndices: [...state.submittedActualIndices, index],
  })),
  on(ShipmentActions.submitActualFailure, (state) => ({
    ...state,
    submittingRowIndex: null,
  })),

  // Step 3: Documentation
  on(ShipmentActions.submitDocumentation, (state, { index }) => ({
    ...state,
    submittingRowIndex: index,
  })),
  on(ShipmentActions.submitDocumentationSuccess, (state, { index }) => ({
    ...state,
    submittingRowIndex: null,
    submittedStep3Indices: [...state.submittedStep3Indices, index],
  })),
  on(ShipmentActions.submitDocumentationFailure, (state) => ({
    ...state,
    submittingRowIndex: null,
  })),

  // Step 4: Logistics
  on(ShipmentActions.submitLogistics, (state, { index }) => ({
    ...state,
    submittingRowIndex: index,
  })),
  on(ShipmentActions.submitLogisticsSuccess, (state, { index }) => ({
    ...state,
    submittingRowIndex: null,
    submittedStep4Indices: [...state.submittedStep4Indices, index],
  })),
  on(ShipmentActions.submitLogisticsFailure, (state) => ({
    ...state,
    submittingRowIndex: null,
  })),

  // Step 5: Clearance Payment
  on(ShipmentActions.submitClearancePayment, (state, { index }) => ({
    ...state,
    submittingRowIndex: index,
  })),
  on(ShipmentActions.submitClearancePaymentSuccess, (state, { index }) => ({
    ...state,
    submittingRowIndex: null,
    submittedStep5Indices: [...state.submittedStep5Indices, index],
  })),
  on(ShipmentActions.submitClearancePaymentFailure, (state) => ({
    ...state,
    submittingRowIndex: null,
  })),

  // Step 6: Clearance Final
  on(ShipmentActions.submitClearanceFinal, (state, { index }) => ({
    ...state,
    submittingRowIndex: index,
  })),
  on(ShipmentActions.submitClearanceFinalSuccess, (state, { index }) => ({
    ...state,
    submittingRowIndex: null,
    submittedStep6Indices: [...state.submittedStep6Indices, index],
  })),
  on(ShipmentActions.submitClearanceFinalFailure, (state) => ({
    ...state,
    submittingRowIndex: null,
  })),

  // Step 7: GRN
  on(ShipmentActions.submitGRN, (state, { index }) => ({
    ...state,
    submittingRowIndex: index,
  })),
  on(ShipmentActions.submitGRNSuccess, (state, { index }) => ({
    ...state,
    submittingRowIndex: null,
    submittedStep7Indices: [...state.submittedStep7Indices, index],
  })),
  on(ShipmentActions.submitGRNFailure, (state) => ({
    ...state,
    submittingRowIndex: null,
  })),

  // Reset
  on(ShipmentActions.resetShipmentFormState, () => ({ ...initialShipmentState }))
);
