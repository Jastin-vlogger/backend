import { ShipmentDetailsResponse } from '../../core/models/shipment.model';

export interface ShipmentState {
  shipmentId: string | null;
  shipmentData: ShipmentDetailsResponse | null;
  loading: boolean;
  error: string | null;
  currentStep: number;
  totalContainers: number;
  isPlannedLocked: boolean;
  activeSplitTab: 'planned' | 'actual' | 'history' | 'report';
  submittedActualIndices: number[];
  submittedStep3Indices: number[];
  submittedStep4Indices: number[];
  submittedStep5Indices: number[];
  submittedStep6Indices: number[];
  submittedStep7Indices: number[];
  submittingPlanned: boolean;
  submittingRowIndex: number | null;
}

export const initialShipmentState: ShipmentState = {
  shipmentId: null,
  shipmentData: null,
  loading: false,
  error: null,
  currentStep: 0,
  totalContainers: 0,
  isPlannedLocked: false,
  activeSplitTab: 'planned',
  submittedActualIndices: [],
  submittedStep3Indices: [],
  submittedStep4Indices: [],
  submittedStep5Indices: [],
  submittedStep6Indices: [],
  submittedStep7Indices: [],
  submittingPlanned: false,
  submittingRowIndex: null,
};
