import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { catchError, mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { ShipmentService } from '../../core/services/shipment.service';
import { NotificationService } from '../../core/services/notification.service';
import * as ShipmentActions from './shipment.actions';
import { selectShipmentId } from './shipment.selectors';

@Injectable()
export class ShipmentEffects {
  private actions$ = inject(Actions);
  private shipmentService = inject(ShipmentService);
  private notificationService = inject(NotificationService);
  private store = inject(Store);

  loadShipmentDetail$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShipmentActions.loadShipmentDetail),
      switchMap(({ id }) =>
        this.shipmentService.getShipmentById(id).pipe(
          mergeMap((data) => {
            const planned = data.planned || [];
            const actual = data.actual || [];
            const isPlannedLocked = planned.length > 0;
            const submittedActualIndices: number[] = [];
            const submittedStep3Indices: number[] = [];
            const submittedStep4Indices: number[] = [];
            const submittedStep5Indices: number[] = [];
            const submittedStep6Indices: number[] = [];
            const submittedStep7Indices: number[] = [];

            planned.forEach((container, index) => {
              const actualData = actual.find((a) => a.containerId === container.containerId);
              if (actualData?.BLNo) submittedActualIndices.push(index);
              if (
                actualData?.receiver ||
                actualData?.expectedDocDate ||
                actualData?.courierTrackNo ||
                actualData?.inwardCollectionAdviceDocumentUrl ||
                actualData?.murabahaContractSubmittedDocumentUrl ||
                actualData?.documentsReleasedDocumentUrl
              ) submittedStep3Indices.push(index);
              
              // Step 4 (Port & Customs) — mark as started when at least one logistics
              // section has been saved (locked). Previously required ALL 7 sections.
              const lockedSections = actualData?.lockedLogisticsSections || [];
              const hasAnyLogisticsData =
                lockedSections.length > 0 ||
                actualData?.arrivalOn ||
                actualData?.arrivalNoticeDate ||
                actualData?.arrivalNoticeDocumentUrl ||
                actualData?.advanceRequestDate ||
                actualData?.doReleasedDate ||
                actualData?.boePassingDate ||
                actualData?.customsClearanceDate ||
                actualData?.municipalityDate ||
                (actualData?.transportationBooked?.length ?? 0) > 0;
              if (hasAnyLogisticsData) submittedStep4Indices.push(index);
              
              if ((actualData?.storageSplits?.length ?? 0) > 0) submittedStep5Indices.push(index);
              if ((actualData?.qualityRows?.length ?? 0) > 0 || (actualData?.qualityReports?.length ?? 0) > 0) {
                submittedStep6Indices.push(index);
              }
              if (
                (actualData?.paymentAllocations?.length ?? 0) > 0 ||
                (actualData?.paymentCostings?.length ?? 0) > 0 ||
                actualData?.paymentCostingDocumentUrl
              ) {
                submittedStep7Indices.push(index);
              }
            });

            return [
              ShipmentActions.loadShipmentDetailSuccess({ data }),
              ShipmentActions.populateFormState({
                isPlannedLocked,
                totalContainers: planned.length,
                submittedActualIndices,
                submittedStep3Indices,
                submittedStep4Indices,
                submittedStep5Indices,
                submittedStep6Indices,
                submittedStep7Indices,
              }),
            ];
          }),
          catchError((error) => {
            this.notificationService.error('Load Error', 'Failed to load shipment details');
            return of(ShipmentActions.loadShipmentDetailFailure({ error: error.message }));
          })
        )
      )
    )
  );

  submitPlannedContainers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShipmentActions.submitPlannedContainers),
      switchMap(({ shipmentId, containers, plannedQtyMT, noOfShipments, keepTab }) => {
        const total = containers.reduce((sum, c) => sum + (Number(c.qtyMT) || 0), 0);
        if (total > plannedQtyMT) {
          this.notificationService.error(
            'Validation Error',
            `Total planned quantity (${total} MT) exceeds shipment total (${plannedQtyMT} MT)`
          );
          return of(ShipmentActions.submitPlannedFailure({ error: 'Quantity exceeds limit' }));
        }

        return this.shipmentService
          .createPlannedContainers({ shipmentId, plannedContainers: containers, noOfShipments })
            .pipe(
              mergeMap((response: any) => {
                this.notificationService.success(
                  'Success',
                  response?.message || 'Planned containers submitted successfully'
                );
                if (response?.inviteSent === false && response?.inviteStatusMessage) {
                  this.notificationService.warn('Invite email', response.inviteStatusMessage);
                }
                return [
                ShipmentActions.submitPlannedSuccess({ keepTab }),
                ShipmentActions.loadShipmentDetail({ id: shipmentId }),
              ];
            }),
            catchError((error) => {
              this.notificationService.error(
                'Error',
                error.error?.message || 'Failed to submit planned containers'
              );
              return of(ShipmentActions.submitPlannedFailure({ error: error.message }));
            })
          );
      })
    )
  );

  submitActualContainer$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShipmentActions.submitActualContainer),
      withLatestFrom(this.store.select(selectShipmentId)),
      switchMap(([{ containerId, index, payload }, shipmentId]) =>
        this.shipmentService.createActualContainer(containerId, payload).pipe(
          mergeMap(() => {
            this.notificationService.success('Success', 'Actual container submitted successfully');
            return [
              ShipmentActions.submitActualSuccess({ index }),
              ShipmentActions.loadShipmentDetail({ id: shipmentId! }),
            ];
          }),
          catchError((error) => {
            this.notificationService.error(
              'Error',
              error.error?.message || 'Failed to submit actual container'
            );
            return of(ShipmentActions.submitActualFailure({ error: error.message }));
          })
        )
      )
    )
  );

  submitDocumentation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShipmentActions.submitDocumentation),
      withLatestFrom(this.store.select(selectShipmentId)),
      switchMap(([{ containerId, index, payload }, shipmentId]) =>
        this.shipmentService.submitDocumentationPayment(containerId, payload).pipe(
          mergeMap(() => {
            this.notificationService.success('Success', 'Documentation submitted successfully');
            return [
              ShipmentActions.submitDocumentationSuccess({ index }),
              ShipmentActions.loadShipmentDetail({ id: shipmentId! }),
            ];
          }),
          catchError((error) => {
            this.notificationService.error(
              'Error',
              error.error?.message || 'Failed to submit documentation'
            );
            return of(ShipmentActions.submitDocumentationFailure({ error: error.message }));
          })
        )
      )
    )
  );

  submitLogistics$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShipmentActions.submitLogistics),
      withLatestFrom(this.store.select(selectShipmentId)),
      switchMap(([{ containerId, index, payload }, shipmentId]) =>
        this.shipmentService.submitLogistics(containerId, payload).pipe(
          mergeMap(() => {
            this.notificationService.success('Success', 'Logistics details submitted successfully');
            return [
              ShipmentActions.submitLogisticsSuccess({ index }),
              ShipmentActions.loadShipmentDetail({ id: shipmentId! }),
            ];
          }),
          catchError((error) => {
            this.notificationService.error(
              'Error',
              error.error?.message || 'Failed to submit logistics'
            );
            return of(ShipmentActions.submitLogisticsFailure({ error: error.message }));
          })
        )
      )
    )
  );

  submitClearancePayment$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShipmentActions.submitClearancePayment),
      withLatestFrom(this.store.select(selectShipmentId)),
      switchMap(([{ containerId, index, payload }, shipmentId]) =>
        this.shipmentService.submitClearancePayment(containerId, payload).pipe(
          mergeMap(() => {
            this.notificationService.success(
              'Success',
              'Clearance payment submitted successfully'
            );
            return [
              ShipmentActions.submitClearancePaymentSuccess({ index }),
              ShipmentActions.loadShipmentDetail({ id: shipmentId! }),
            ];
          }),
          catchError((error) => {
            this.notificationService.error(
              'Error',
              error.error?.message || 'Failed to submit clearance payment'
            );
            return of(ShipmentActions.submitClearancePaymentFailure({ error: error.message }));
          })
        )
      )
    )
  );

  submitClearanceFinal$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShipmentActions.submitClearanceFinal),
      withLatestFrom(this.store.select(selectShipmentId)),
      switchMap(([{ containerId, index, payload }, shipmentId]) =>
        this.shipmentService.submitClearance(containerId, payload).pipe(
          mergeMap(() => {
            this.notificationService.success('Success', 'Clearance details submitted successfully');
            return [
              ShipmentActions.submitClearanceFinalSuccess({ index }),
              ShipmentActions.loadShipmentDetail({ id: shipmentId! }),
            ];
          }),
          catchError((error) => {
            this.notificationService.error(
              'Error',
              error.error?.message || 'Failed to submit clearance'
            );
            return of(ShipmentActions.submitClearanceFinalFailure({ error: error.message }));
          })
        )
      )
    )
  );

  submitGRN$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShipmentActions.submitGRN),
      withLatestFrom(this.store.select(selectShipmentId)),
      switchMap(([{ containerId, index, payload }, shipmentId]) =>
        this.shipmentService.submitGRN(containerId, payload).pipe(
          mergeMap(() => {
            this.notificationService.success('Success', 'GRN details submitted successfully');
            return [
              ShipmentActions.submitGRNSuccess({ index }),
              ShipmentActions.loadShipmentDetail({ id: shipmentId! }),
            ];
          }),
          catchError((error) => {
            this.notificationService.error(
              'Error',
              error.error?.message || 'Failed to submit GRN'
            );
            return of(ShipmentActions.submitGRNFailure({ error: error.message }));
          })
        )
      )
    )
  );
}
