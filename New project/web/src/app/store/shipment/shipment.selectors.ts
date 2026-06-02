import { createSelector, createFeatureSelector } from '@ngrx/store';
import { ShipmentState } from './shipment.state';

export const selectShipmentState = createFeatureSelector<ShipmentState>('shipment');

export const selectShipmentData = createSelector(
  selectShipmentState,
  (state) => state.shipmentData
);

export const selectShipmentLoading = createSelector(
  selectShipmentState,
  (state) => state.loading
);

export const selectCurrentStep = createSelector(
  selectShipmentState,
  (state) => state.currentStep
);

export const selectTotalContainers = createSelector(
  selectShipmentState,
  (state) => state.totalContainers
);

export const selectIsPlannedLocked = createSelector(
  selectShipmentState,
  (state) => state.isPlannedLocked
);

export const selectActiveSplitTab = createSelector(
  selectShipmentState,
  (state) => state.activeSplitTab
);

export const selectSubmittedActualIndices = createSelector(
  selectShipmentState,
  (state) => state.submittedActualIndices
);

export const selectSubmittedStep3Indices = createSelector(
  selectShipmentState,
  (state) => state.submittedStep3Indices
);

export const selectSubmittedStep4Indices = createSelector(
  selectShipmentState,
  (state) => state.submittedStep4Indices
);

export const selectSubmittedStep5Indices = createSelector(
  selectShipmentState,
  (state) => state.submittedStep5Indices
);

export const selectSubmittedStep6Indices = createSelector(
  selectShipmentState,
  (state) => state.submittedStep6Indices
);

export const selectSubmittedStep7Indices = createSelector(
  selectShipmentState,
  (state) => state.submittedStep7Indices
);

export const selectSubmittingPlanned = createSelector(
  selectShipmentState,
  (state) => state.submittingPlanned
);

export const selectSubmittingRowIndex = createSelector(
  selectShipmentState,
  (state) => state.submittingRowIndex
);

export const selectShipmentId = createSelector(
  selectShipmentState,
  (state) => state.shipmentId
);
