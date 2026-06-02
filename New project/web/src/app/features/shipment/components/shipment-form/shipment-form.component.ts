import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core'; // Trigger reload
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormControl, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { SkeletonModule } from 'primeng/skeleton';
import { ButtonModule } from 'primeng/button';

import { StepperComponent, Step } from '../../../../shared/components/stepper/stepper.component';
import { ShipmentDetailsResponse } from '../../../../core/models/shipment.model';

import {
  selectShipmentLoading,
  selectCurrentStep,
  selectIsPlannedLocked,
  selectShipmentData,
  selectTotalContainers,
  selectSubmittedActualIndices,
  selectSubmittedStep3Indices,
  selectSubmittedStep4Indices,
  selectSubmittedStep5Indices,
  selectSubmittedStep6Indices,
  selectSubmittedStep7Indices,
} from '../../../../store/shipment/shipment.selectors';
import * as ShipmentActions from '../../../../store/shipment/shipment.actions';

import { ShipmentSummaryComponent } from './steps/shipment-summary/shipment-summary.component';
import { ShipmentSplitComponent } from './steps/shipment-split/shipment-split.component';
import { ShipmentBlDetailsComponent } from './steps/shipment-bl-details/shipment-bl-details.component';
import { ShipmentDocumentationComponent } from './steps/shipment-documentation/shipment-documentation.component';
import { ShipmentArrivalComponent } from './steps/shipment-arrival/shipment-arrival.component';
import { ShipmentStorageComponent } from './steps/shipment-storage/shipment-storage.component';
import { ShipmentQualityComponent } from './steps/shipment-quality/shipment-quality.component';
import { RbacService } from '../../../../core/services/rbac.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ShipmentService } from '../../../../core/services/shipment.service';
import { BL_ROW_DEFINITIONS, normalizeBlVisibleTo, type BlRowDefinition } from './shared/bl-row-definitions';

type ShipmentTabKey =
  | 'shipment_entry'
  | 'shipment_tracker_split'
  | 'bl_details'
  | 'document_tracker'
  | 'port_customs'
  | 'storage_arrival'
  | 'quality'
  | 'payment_costing';

interface TrackerStepConfig extends Step {
  index: number;
  tabKey: ShipmentTabKey;
  viewPermissionKey: string;
  editPermissionKey?: string;
}

@Component({
  selector: 'app-shipment-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    SkeletonModule,
    StepperComponent,
    ShipmentSummaryComponent,
    ShipmentSplitComponent,
    ShipmentBlDetailsComponent,
    ShipmentDocumentationComponent,
    ShipmentArrivalComponent,
    ShipmentStorageComponent,
    ShipmentQualityComponent,
  ],
  templateUrl: './shipment-form.component.html',
  styleUrls: ['./shipment-form.component.scss'],
})
export class ShipmentFormComponent implements OnDestroy {
  readonly appDateFormat = 'dd/mm/yy';
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private store = inject(Store);
  private rbacService = inject(RbacService);
  private authService = inject(AuthService);
  private shipmentService = inject(ShipmentService);

  shipmentForm: FormGroup;
  shipmentId: string | null = null;
  readonly blRowDefinitions = signal<BlRowDefinition[]>([...BL_ROW_DEFINITIONS]);

  // Signals from store
  readonly loading = toSignal(this.store.select(selectShipmentLoading), { initialValue: false });
  readonly currentStep = toSignal(this.store.select(selectCurrentStep), { initialValue: 0 });
  readonly shipmentData = toSignal(this.store.select(selectShipmentData));
  readonly isPlannedLocked = toSignal(this.store.select(selectIsPlannedLocked), {
    initialValue: false,
  });
  readonly totalContainers = toSignal(this.store.select(selectTotalContainers), {
    initialValue: 0,
  });
  readonly submittedActualIndices = toSignal(this.store.select(selectSubmittedActualIndices), {
    initialValue: [],
  });
  readonly submittedStep3Indices = toSignal(this.store.select(selectSubmittedStep3Indices), {
    initialValue: [],
  });
  readonly submittedStep4Indices = toSignal(this.store.select(selectSubmittedStep4Indices), {
    initialValue: [],
  });
  readonly submittedStep5Indices = toSignal(this.store.select(selectSubmittedStep5Indices), {
    initialValue: [],
  });
  readonly submittedStep6Indices = toSignal(this.store.select(selectSubmittedStep6Indices), {
    initialValue: [],
  });
  readonly submittedStep7Indices = toSignal(this.store.select(selectSubmittedStep7Indices), {
    initialValue: [],
  });
  readonly effectivePermissions = toSignal(this.rbacService.permissions$, { initialValue: null });

  // Computed steps for stepper
  readonly trackerStepConfigs = computed<TrackerStepConfig[]>(() => {
    const total = this.totalContainers();
    return [
      {
        index: 0,
        tabKey: 'shipment_entry',
        viewPermissionKey: 'shipment.tab.shipment_entry.view',
        label: 'Shipment Entry',
        subLabel: 'Purchase',
        completed: true,
      },
      {
        index: 1,
        tabKey: 'shipment_tracker_split',
        viewPermissionKey: 'shipment.tab.shipment_tracker_split.view',
        editPermissionKey: 'shipment.tab.shipment_tracker_split.edit',
        label: 'Shipment Tracker',
        subLabel: 'Purchase',
        completed: this.isPlannedLocked(),
      },
      {
        index: 2,
        tabKey: 'bl_details',
        viewPermissionKey: 'shipment.tab.bl_details.view',
        editPermissionKey: 'shipment.tab.bl_details.edit',
        label: 'BL Details',
        subLabel: 'Purchase',
        completed: total > 0 && this.submittedActualIndices().length > 0 && this.allSubmitted(this.submittedActualIndices().length, this.submittedStep3Indices()),
      },
      {
        index: 3,
        tabKey: 'document_tracker',
        viewPermissionKey: 'shipment.tab.document_tracker.view',
        editPermissionKey: 'shipment.tab.document_tracker.edit',
        label: 'Document Tracker',
        subLabel: 'FAS',
        completed: this.submittedActualIndices().length > 0 && this.allSubmitted(this.submittedActualIndices().length, this.submittedStep3Indices()),
      },
      {
        index: 4,
        tabKey: 'port_customs',
        viewPermissionKey: 'shipment.tab.port_customs.view',
        editPermissionKey: 'shipment.tab.port_customs.edit',
        label: 'Port and Customs Clearance Tracker',
        subLabel: 'Logistics',
        completed: this.isStep3AllMilestonesCompleted() && this.submittedActualIndices().length > 0 && this.allSubmitted(this.submittedActualIndices().length, this.submittedStep4Indices()),
      },
      {
        index: 5,
        tabKey: 'storage_arrival',
        viewPermissionKey: 'shipment.tab.storage.view',
        editPermissionKey: 'shipment.tab.storage.storage_arrival.edit',
        label: 'Storage Allocation & Arrival',
        subLabel: 'Logistics',
        completed: this.submittedActualIndices().length > 0 && this.allSubmitted(this.submittedActualIndices().length, this.submittedStep5Indices()),
      },
      {
        index: 6,
        tabKey: 'quality',
        viewPermissionKey: 'shipment.tab.quality.view',
        editPermissionKey: 'shipment.tab.quality.edit',
        label: 'Quality',
        subLabel: 'QA',
        completed: this.submittedActualIndices().length > 0 && this.allSubmitted(this.submittedActualIndices().length, this.submittedStep6Indices()),
      },
      // POINT 7: Step 8 (Payment & Costing) removed from stepper.
      // Payment Allocation and Payment Costing tabs are now inside BL Details (Step 3).
    ];
  });

  readonly trackerAccessDenied = computed(() => this.shouldEnforceTabPermissions() && !this.hasTrackerScreenAccess());

  readonly accessibleTrackerSteps = computed<TrackerStepConfig[]>(() => {
    if (this.trackerAccessDenied()) {
      return [];
    }
    return this.trackerStepConfigs().filter((step) => this.canViewStep(step));
  });

  readonly stepperSteps = computed<Step[]>(() =>
    this.trackerStepConfigs().map(({ label, subLabel, completed, viewPermissionKey }) => ({
      label,
      subLabel,
      completed,
      // Hide the step entirely in the stepper when the user has no view permission.
      // Admin/Manager bypass is handled inside shouldEnforceTabPermissions().
      hidden: this.shouldEnforceTabPermissions()
        ? !this.rbacService.hasPermission(viewPermissionKey)
        : false,
    }))
  );

  /**
   * Max step index that can be opened based on prerequisite completions (UI gating),
   * independent of RBAC view permissions (RBAC is enforced separately).
   */
  readonly maxEnabledStep = computed<number>(() => {
    // Always allow navigating up to Port & Customs (index 4).
    let max = 4;
    // Storage unlocks as soon as at least one shipment has completed Port & Customs
    if (this.hasAnyStep4CompletedRow()) {
      max = 5;
    }
    if (this.hasAnyStep4CompletedRow() && this.hasAnyStep5CompletedRow()) {
      max = 6;
    }
    if (this.hasAnyStep4CompletedRow() && this.hasAnyStep5CompletedRow() && this.isStep6Completed()) {
      max = 7;
    }
    return max;
  });

  readonly currentStepMeta = computed<TrackerStepConfig | null>(
    () => this.trackerStepConfigs().find((step) => step.index === this.currentStep()) ?? null
  );

  constructor() {
    this.shipmentForm = this.buildForm();
    this.loadBlRowDefinitions();

    // Repopulate reactive form when API data arrives
    effect(() => {
      const data = this.shipmentData();
      if (data) this.populateFormWithData(data);
    });

    effect(() => {
      if (this.trackerAccessDenied()) {
        return;
      }

      const visibleSteps = this.accessibleTrackerSteps();
      const currentStep = this.currentStep();

      if (!visibleSteps.length) {
        return;
      }

      if (!visibleSteps.some((step) => step.index === currentStep)) {
        this.store.dispatch(ShipmentActions.setCurrentStep({ step: visibleSteps[0].index }));
      }
    });

    // Load shipment on route param
    this.route.params.subscribe((params) => {
      const id = params['id'];
      if (id) {
        this.shipmentId = id;
        this.store.dispatch(ShipmentActions.loadShipmentDetail({ id }));
      }
    });
  }

  private loadBlRowDefinitions(): void {
    this.shipmentService.getBlRowDefinitions().subscribe({
      next: (response) => {
        const rows = (response?.rows || [])
          .filter((row) => row?.isActive !== false)
          .map((row) => ({
            key: row.key,
            sn: Number(row.sn) || 0,
            description: row.description,
            visibleTo: normalizeBlVisibleTo(row.visibleTo),
            defaultQty: Number(row.defaultQty ?? 1),
            defaultRate: Number(row.defaultRate ?? 0),
          }))
          .filter((row) => !!row.description)
          .sort((left, right) => left.sn - right.sn);

        if (!rows.length) return;

        this.blRowDefinitions.set(rows);
        const data = this.shipmentData();
        this.shipmentForm = this.buildForm();
        if (data) this.populateFormWithData(data);
      },
      error: () => {
        // Keep the local fallback definitions if the DB list is unavailable.
      },
    });
  }

  private getActiveBlRowDefinitions(): BlRowDefinition[] {
    const rows = this.blRowDefinitions();
    return rows.length ? rows : [...BL_ROW_DEFINITIONS];
  }

  getDisplayShipmentNo(): string {
    const shipmentNo = this.shipmentForm.get('shipmentNo')?.value;
    if (typeof shipmentNo !== 'string') return '';
    const clean = shipmentNo.replace(/\([^)]*\)/g, '').trim();
    return clean.match(/^(RHST-\d+\/[A-Z0-9-]+)/i)?.[1] || clean;
  }

  isStepReadOnly(stepIndex: number): boolean {
    if (stepIndex === 0) {
      return true;
    }

    // Restriction: Step 3 (BL Details) and beyond require at least one Actual row to be submitted
    if (stepIndex >= 2 && this.submittedActualIndices().length === 0) {
      return true;
    }

    const step = this.trackerStepConfigs().find((item) => item.index === stepIndex);
    if (!step || !step.editPermissionKey || !this.shouldEnforceTabPermissions()) {
      return false;
    }

    if (stepIndex === 2) {
      const hasAnyEditableBlSubview =
        this.rbacService.hasPermission('shipment.tab.bl_details.edit') ||
        this.rbacService.hasPermission('shipment.tab.bl_details.clearing_advance.edit') ||
        this.rbacService.hasPermission('shipment.tab.bl_details.storage_allocations.edit') ||
        this.rbacService.hasPermission('shipment.tab.bl_details.packaging_list.edit') ||
        this.rbacService.hasPermission('shipment.tab.payment_costing.payment_allocation.edit') ||
        this.rbacService.hasPermission('shipment.tab.payment_costing.costing_table.edit') ||
        this.rbacService.hasPermission('shipment.tab.payment_costing.packaging_expenses.edit');

      if (hasAnyEditableBlSubview) {
        return false;
      }
    }

    return !this.rbacService.hasPermission(step.editPermissionKey);
  }

  getNextVisibleStepLabel(): string {
    const nextStep = this.getAdjacentAccessibleStep(1);
    return nextStep?.label || '';
  }

  isStep4Completed(): boolean {
    const total = this.submittedActualIndices().length;
    if (!(total > 0)) return false;

    // Check if all actual rows have completed Step 4 (all 7 logistics sections locked)
    return this.allSubmitted(total, this.submittedStep4Indices());
  }

  hasAnyStep3CompletedRow(): boolean {
    if (this.documentationSplits.length > 0) {
      return this.documentationSplits.controls.some((row) => this.isDocumentationRowComplete(row));
    }

    const actualRows = this.shipmentData()?.actual;
    if (!actualRows || actualRows.length === 0) return false;

    return actualRows.some((shipment: any) => this.isDocumentationRowComplete(shipment));
  }

  /**
   * Returns true only when every actual shipment row has all 6 Document Tracker
   * milestones saved (courier, receiving, inward, murabaha_process, murabaha_submit, release).
   * Step 4 (Port & Customs) is gated behind this check.
   */
  isStep3AllMilestonesCompleted(): boolean {
    if (this.documentationSplits.length > 0) {
      return this.documentationSplits.controls.every((row) => this.isDocumentationRowComplete(row));
    }

    const actualRows = this.shipmentData()?.actual;
    if (!actualRows || actualRows.length === 0) return false;

    return actualRows.every((shipment: any) => this.isDocumentationRowComplete(shipment));
  }

  private isDocumentationRowComplete(row: AbstractControl | any): boolean {
    const getValue = (field: string) =>
      row instanceof AbstractControl ? row.get(field)?.value : row?.[field];

    const hasCourier = !!(getValue('courierTrackNo') || getValue('courierServiceProvider') || getValue('docArrivalNotes'));
    const hasReceiving = !!(getValue('expectedDocDate') || (getValue('receiver') && getValue('bankName')));
    const hasRelease = !!(getValue('documentsReleasedDate') || getValue('documentsReleasedDocumentUrl'));

    const receiver = String(getValue('receiver') || '').trim().toLowerCase();
    const isDirect = receiver === 'direct';
    if (isDirect) {
      return hasCourier && hasReceiving && hasRelease;
    }

    const hasInward = !!(getValue('inwardCollectionAdviceDate') || getValue('inwardCollectionAdviceDocumentUrl'));
    const hasMurabahaProcess = !!(getValue('murabahaContractReleasedDate') || getValue('murabahaContractApprovedDate'));
    const hasMurabahaSubmit = !!(getValue('murabahaContractSubmittedDate') || getValue('murabahaContractSubmittedDocumentUrl'));

    return hasCourier && hasReceiving && hasInward && hasMurabahaProcess && hasMurabahaSubmit && hasRelease;
  }

  isStep5Completed(): boolean {
    const total = this.submittedActualIndices().length;
    return total > 0 && this.allSubmitted(total, this.submittedStep5Indices());
  }

  hasAnyStep4CompletedRow(): boolean {
    const totalRows = this.shipmentData()?.actual?.length ?? this.arrivalTimeSplits.length;
    if (!totalRows) return false;

    for (let index = 0; index < totalRows; index++) {
      if (this.isStep4RowComplete(index)) {
        return true;
      }
    }

    return false;
  }

  hasAnyStep5CompletedRow(): boolean {
    const totalRows = this.shipmentData()?.actual?.length ?? this.storageSplits.length;
    if (!totalRows) return false;

    for (let index = 0; index < totalRows; index++) {
      if (this.isStep5RowComplete(index)) {
        return true;
      }
    }

    return false;
  }

  getStep4VisibleShipmentIndices(): number[] {
    const totalRows = this.documentationSplits.length || this.shipmentData()?.actual?.length || 0;
    return Array.from({ length: totalRows }, (_, index) => index).filter((index) => this.isDocumentationRowComplete(this.documentationSplits.at(index) || this.shipmentData()?.actual?.[index]));
  }

  getStep5VisibleShipmentIndices(): number[] {
    const totalRows = this.arrivalTimeSplits.length || this.shipmentData()?.actual?.length || 0;
    return Array.from({ length: totalRows }, (_, index) => index).filter((index) => this.isStep4RowComplete(index));
  }

  getStep6VisibleShipmentIndices(): number[] {
    const totalRows = this.storageSplits.length || this.shipmentData()?.actual?.length || 0;
    return Array.from({ length: totalRows }, (_, index) => index).filter((index) => this.isStep5RowComplete(index));
  }

  isStep6Completed(): boolean {
    const total = this.submittedActualIndices().length;
    return total > 0 && this.allSubmitted(total, this.submittedStep6Indices());
  }

  getAwaitingStepMessage(requiredStepIndex: number): string {
    const meta = this.trackerStepConfigs().find((step) => step.index === requiredStepIndex);
    const uiNo = requiredStepIndex + 1;
    const label = meta?.label ? ` (${meta.label})` : '';
    return `Awaiting Step ${uiNo}${label} completion.`;
  }

  private getBlockedByStep(targetStepIndex: number): number | null {
    // Step 5+ (Port & Customs and beyond) requires Document Tracker milestone completion
    if (targetStepIndex >= 4 && !this.hasAnyStep3CompletedRow()) {
      return 3;
    }
    // Step 6+ (Storage and beyond) requires Port & Customs (index 4) completion
    if (targetStepIndex >= 5 && !this.hasAnyStep4CompletedRow()) {
      return 4;
    }
    // Step 7+ (Quality and beyond) requires Storage (index 5) completion
    if (targetStepIndex >= 6 && !this.hasAnyStep5CompletedRow()) {
      return 5;
    }
    // Step 8 (Payment) requires Quality (index 6) completion
    if (targetStepIndex >= 7 && !this.isStep6Completed()) {
      return 6;
    }
    return null;
  }

  private isStep4RowComplete(index: number): boolean {
    if (this.submittedStep4Indices().includes(index)) {
      return true;
    }

    const actualRow = this.shipmentData()?.actual?.[index];
    const lockedSections = new Set(actualRow?.lockedLogisticsSections || []);
    return [
      'arrivalNotice',
      'advanceRequest',
      'doReleased',
      'boePassingDate',
      'customsClearance',
      'municipality',
      'transportation',
    ].every((section) => lockedSections.has(section));
  }

  private isStep5RowComplete(index: number): boolean {
    if (this.submittedStep5Indices().includes(index)) {
      return true;
    }

    const status = this.shipmentData()?.actual?.[index]?.storageArrivalApproval?.status;
    return status === 'pending_warehouse_manager' || status === 'approved';
  }

  hasPreviousAccessibleStep(): boolean {
    return !!this.getAdjacentAccessibleStep(-1);
  }

  // --- Form Accessors ---
  get plannedSplits(): FormArray {
    return this.shipmentForm.get('plannedSplits') as FormArray;
  }
  get actualSplits(): FormArray {
    return this.shipmentForm.get('actualSplits') as FormArray;
  }
  get noOfShipmentsFormControl(): FormControl<number | null> {
    return this.shipmentForm.get('noOfShipments') as FormControl<number | null>;
  }
  get documentationSplits(): FormArray {
    return this.shipmentForm.get('documentationSplits') as FormArray;
  }
  get blDetailsSplits(): FormArray {
    return this.shipmentForm.get('blDetailsSplits') as FormArray;
  }
  get arrivalTimeSplits(): FormArray {
    return this.shipmentForm.get('arrivalTimeSplits') as FormArray;
  }
  get clearancePaidSplits(): FormArray {
    return this.shipmentForm.get('clearancePaidSplits') as FormArray;
  }
  get clearanceFinalSplits(): FormArray {
    return this.shipmentForm.get('clearanceFinalSplits') as FormArray;
  }
  get grnSplits(): FormArray {
    return this.shipmentForm.get('grnSplits') as FormArray;
  }
  get storageSplits(): FormArray {
    return this.shipmentForm.get('storageSplits') as FormArray;
  }

  // --- Form Init ---
  private buildForm(): FormGroup {
    const form = this.fb.group({
      shipmentNo: ['', Validators.required],
      piNo: [''],
      fpoNo: [''],
      incoTerms: [''],
      item: [null],
      itemDescription: [''],
      supplier: [null],
      countryOfOrigin: [null],
      packagingType: [null],
      containerSize: [''],
      buyingUnit: [null],
      plannedContainers: [null],
      fcPerUnit: [null],
      estimatedTotalFC: [{ value: null as number | null, disabled: true }],
      paymentTerms: [null],
      advanceAmount: [null],
      expectedETD: [null],
      expectedETA: [null],
      noOfShipments: [null as number | null],
      plannedSplits: this.fb.array([]),
      actualSplits: this.fb.array([]),
      blDetailsSplits: this.fb.array([]),
      documentationSplits: this.fb.array([]),
      arrivalTimeSplits: this.fb.array([]),
      clearancePaidSplits: this.fb.array([]),
      clearanceFinalSplits: this.fb.array([]),
      grnSplits: this.fb.array([]),
      storageSplits: this.fb.array([]),
    }, {
      validators: this.dateOrderValidator('expectedETD', 'expectedETA', 'etaBeforeEtd'),
    });

    form.valueChanges.subscribe((val) => {
      const containers = val.plannedContainers as number | null;
      const fcPerUnit = val.fcPerUnit as number | null;
      if (containers != null && fcPerUnit != null) {
        form
          .get('estimatedTotalFC')
          ?.setValue(containers * fcPerUnit, { emitEvent: false });
      }
    });

    return form;
  }

  // --- Sync Planned Splits ---
  private syncPlannedSplits(count: number): void {
    const current = this.plannedSplits.length;
    if (count > current) {
      for (let i = current; i < count; i++) {
        this.plannedSplits.push(this.createPlannedGroup());
      }
    } else if (count < current) {
      for (let i = current; i > count; i--) {
        this.plannedSplits.removeAt(i - 1);
      }
    }
  }

  /** Distribute totalQtyMT across n rows (equal split, sum never exceeds total). */
  private distributeQtyMT(totalQtyMT: number, n: number): number[] {
    if (n <= 0) return [];
    const perRow = totalQtyMT / n;
    const rows: number[] = [];
    let sum = 0;
    for (let i = 0; i < n - 1; i++) {
      const v = Math.floor(perRow * 100) / 100;
      rows.push(v);
      sum += v;
    }
    rows.push(Math.round((totalQtyMT - sum) * 100) / 100);
    return rows;
  }

  /**
   * Distribute shipment-level FCL across n rows using whole numbers only.
   * The remainder is assigned to the last row so no row gets a decimal.
   */
  private distributeFcl(totalFcl: number, n: number): number[] {
    if (n <= 0 || totalFcl <= 0) return Array.from({ length: n }, () => 0);
    const base = Math.ceil(totalFcl / n);
    const rows: number[] = [];
    let allocated = 0;

    for (let i = 0; i < n; i++) {
      const remainingRows = n - i;
      const remainingFcl = totalFcl - allocated;
      const nextValue = remainingRows === 1 ? remainingFcl : Math.min(base, remainingFcl);
      rows.push(nextValue);
      allocated += nextValue;
    }

    return rows;
  }

  /** Sync planned rows from "No of Shipments" and set each row qtyMT = totalQtyMT / no. */
  syncPlannedSplitsByNoOfShipments(no: number, totalQtyMT: number): void {
    if (no <= 0 || totalQtyMT <= 0) return;
    this.plannedSplits.clear();
    const qtyPerRow = this.distributeQtyMT(totalQtyMT, no);
    const totalFcl = Number(this.shipmentData()?.shipment?.fcl) || 0;
    const fclPerRow = this.distributeFcl(totalFcl, no);
    for (let i = 0; i < no; i++) {
      this.plannedSplits.push(this.createPlannedGroup(qtyPerRow[i], false, fclPerRow[i]));
    }
    this.shipmentForm.get('noOfShipments')?.setValue(no, { emitEvent: false });
  }

  addPlannedRow(): void {
    const totalQtyMT = this.shipmentData()?.shipment?.plannedQtyMT ?? 0;
    const totalFcl = Number(this.shipmentData()?.shipment?.fcl) || 0;
    this.plannedSplits.push(this.createPlannedGroup(undefined, true));
    const n = this.plannedSplits.length;
    const qtyPerRow = this.distributeQtyMT(totalQtyMT, n);
    const fclPerRow = this.distributeFcl(totalFcl, n);
    this.plannedSplits.controls.forEach((c, i) => {
      c.get('qtyMT')?.setValue(qtyPerRow[i], { emitEvent: false });
      c.get('FCL')?.setValue(fclPerRow[i], { emitEvent: false });
    });
    this.shipmentForm.get('noOfShipments')?.setValue(n, { emitEvent: false });
  }

  /** Adds a remainder row (auto-generated when allocated MT < total MT). */
  onAddRemainderRow(event: { qtyMT: number; fcl: number; copyFrom: any }): void {
    const group = this.fb.group({
      size: [event.copyFrom?.size ?? this.shipmentForm.get('containerSize')?.value, Validators.required],
      qtyMT: [event.qtyMT, Validators.required],
      weekWiseShipment: [event.copyFrom?.weekWiseShipment ?? ''],
      FCL: [event.fcl, Validators.required],
      etd: [null],
      eta: [null],
      isManualRow: [true],
      isRemainderRow: [true],
    }, { validators: this.dateOrderValidator('etd', 'eta', 'etaBeforeEtd') });
    this.plannedSplits.push(group);
    this.shipmentForm.get('noOfShipments')?.setValue(this.plannedSplits.length, { emitEvent: false });
  }

  removePlannedRow(index: number): void {
    if (this.plannedSplits.length <= 1) return;
    const row = this.plannedSplits.at(index) as FormGroup | null;
    const isManualRow = !!row?.get('isManualRow')?.value;
    if (!isManualRow) return;

    // Check if this is an auto-generated remainder row
    const isRemainderRow = !!row?.get('isRemainderRow')?.value;

    this.plannedSplits.removeAt(index);
    const n = this.plannedSplits.length;
    this.shipmentForm.get('noOfShipments')?.setValue(n, { emitEvent: false });

    // Remainder rows are removed silently — preserve all other rows exactly as the user set them.
    // Only redistribute when the user manually deletes a normal row via the trash button.
    if (!isRemainderRow) {
      const totalQtyMT = this.shipmentData()?.shipment?.plannedQtyMT ?? 0;
      const totalFcl = Number(this.shipmentData()?.shipment?.fcl) || 0;
      const qtyPerRow = this.distributeQtyMT(totalQtyMT, n);
      const fclPerRow = this.distributeFcl(totalFcl, n);
      this.plannedSplits.controls.forEach((c, i) => {
        c.get('qtyMT')?.setValue(qtyPerRow[i], { emitEvent: false });
        c.get('FCL')?.setValue(fclPerRow[i], { emitEvent: false });
      });
    }
  }

  private createPlannedGroup(qtyMT?: number, isManualRow = false, fcl?: number): FormGroup {
    return this.fb.group({
      size: [this.shipmentForm.get('containerSize')?.value, Validators.required],
      qtyMT: [qtyMT ?? null, Validators.required],
      weekWiseShipment: ['', Validators.required],
      FCL: [fcl ?? null, Validators.required],
      etd: [null, Validators.required],
      eta: [null, Validators.required],
      isManualRow: [isManualRow],
    }, { validators: this.dateOrderValidator('etd', 'eta', 'etaBeforeEtd') });
  }

  // --- Populate Form from API Data ---
  private populateFormWithData(data: ShipmentDetailsResponse): void {
    this.actualSplits.clear();
    this.blDetailsSplits.clear();
    this.documentationSplits.clear();
    this.arrivalTimeSplits.clear();
    this.clearancePaidSplits.clear();
    this.clearanceFinalSplits.clear();
    this.grnSplits.clear();
    this.storageSplits.clear();

    // Planned splits
    if (data.planned && data.planned.length > 0) {
      this.plannedSplits.clear();
      const expectedPlannedRows =
        typeof (data.shipment as { noOfShipments?: number }).noOfShipments === 'number' &&
        (data.shipment as { noOfShipments?: number }).noOfShipments! > 0
          ? Math.min(
              data.planned.length,
              Number((data.shipment as { noOfShipments?: number }).noOfShipments)
            )
          : data.planned.length;
      data.planned.slice(0, expectedPlannedRows).forEach((container) => {
        this.plannedSplits.push(
          this.fb.group({
            size: [container.size || data.shipment.containerSize, Validators.required],
            qtyMT: [container.qtyMT, Validators.required],
            weekWiseShipment: [container.weekWiseShipment, Validators.required],
            FCL: [container.FCL, Validators.required],
            etd: [container.etd ? new Date(container.etd) : null, Validators.required],
            eta: [container.eta ? new Date(container.eta) : null, Validators.required],
            isManualRow: [false],
          }, { validators: this.dateOrderValidator('etd', 'eta', 'etaBeforeEtd') })
        );
      });
    }

    // Step 1 fields and noOfShipments (for step 2 Scheduled)
    const noOfShipmentsValue = (data.shipment as { noOfShipments?: number }).noOfShipments ?? (data.planned?.length ?? 0);
    this.shipmentForm.patchValue(
      {
        shipmentNo: data.shipment.shipmentNo,
        piNo: data.shipment.piNo,
        supplier: data.shipment.supplier,
        item: data.shipment.item,
        plannedContainers: data.shipment.assumedContainerCount,
        noOfShipments: noOfShipmentsValue || null,
        incoTerms: data.shipment.incoterms,
        buyingUnit: data.shipment.buyunit,
        fcPerUnit: data.shipment.fcPerUnit,
        paymentTerms: data.shipment.paymentTerms,
        advanceAmount: data.shipment.advanceAmount,
        containerSize: data.shipment.containerSize,
      },
      { emitEvent: false }
    );

    // Build actual + linked step arrays
    if (data.planned && data.planned.length > 0) {
      data.planned.forEach((plannedContainer) => {
        const actualData = data.actual?.find(
          (a) => String(a.containerId || '') === String(plannedContainer.containerId || '')
        );

        this.actualSplits.push(
          this.fb.group({
            containerId: [plannedContainer?.containerId],
            actualSerialNo: [actualData?.actualSerialNo || `${this.actualSplits.length + 1}`],
            commercialInvoiceNo: [actualData?.commercialInvoiceNo || ''],
            shipOnBoardDate: [actualData?.shipOnBoardDate ? new Date(actualData.shipOnBoardDate) : null, Validators.required],
            portOfLoading: [actualData?.portOfLoading || ''],
            portOfDischarge: [actualData?.portOfDischarge || ''],
            noOfContainers: [actualData?.noOfContainers ?? null],
            noOfBags: [actualData?.noOfBags ?? null],
            quantityByMt: [actualData?.quantityByMt ?? null],
            shippingLine: [actualData?.shippingLine || ''],
            freeDetentionDays: [actualData?.freeDetentionDays ?? null],
            maximumDetentionDays: [actualData?.maximumDetentionDays ?? null],
            freightPrepared: [actualData?.freightPrepared || 'No'],
            actualBags: [actualData?.actualBags ?? null],
            expiryDate: [actualData?.expiryDate ? new Date(actualData.expiryDate) : null],
            hsCode: [actualData?.hsCode || ''],
            packagingDate: [
              actualData?.packagingDate
                ? new Date(actualData.packagingDate)
                : this.parseExpiryDate(
                    (actualData?.packagingList as any)?.packagingDate ||
                    (actualData?.packagingList as any)?.productionDate
                  ),
            ],
            grossWeight: [actualData?.grossWeight || ''],
            netWeight: [actualData?.netWeight || ''],
            billExtractionData: [actualData?.billExtractionData || null],
            extractedContainers: [actualData?.extractedContainers || []],
            packagingList: [actualData?.packagingList || null],
            packagingListDocumentUrl: [actualData?.packagingListDocumentUrl || ''],
            packagingListDocumentName: [actualData?.packagingListDocumentName || ''],
            FCL: [plannedContainer.FCL ?? null],
            size: [plannedContainer.size ?? data.shipment.containerSize ?? null],
            qtyMT: [
              actualData?.qtyMT ?? plannedContainer.qtyMT ?? null,
              Validators.required,
            ],
            bags: [actualData?.bags ?? null, Validators.required],
            pallet: [actualData?.pallet ?? null],
            updatedETD: [
              actualData?.updatedETD
                ? new Date(actualData.updatedETD)
                : plannedContainer.etd
                  ? new Date(plannedContainer.etd)
                  : null,
              Validators.required,
            ],
            updatedETA: [
              actualData?.updatedETA
                ? new Date(actualData.updatedETA)
                : plannedContainer.eta
                  ? new Date(plannedContainer.eta)
                  : null,
              Validators.required,
            ],
            receivedOn: [actualData?.receivedOn ? new Date(actualData.receivedOn) : null],
            status: [actualData ? 'Actual' : 'Planned'],
            BLNo: [actualData?.BLNo || '', Validators.required],
          }, { validators: this.actualDateOrderValidator() })
        );
      });
    }

    // Step 3+ connection: Driven by Actual containers
    const actualContainers = data.actual || [];
    actualContainers.forEach((actualData, shipmentIndex) => {
        const plannedContainer = data.planned?.find(p => p.containerId === actualData.containerId);
        if (!plannedContainer) return;

        this.documentationSplits.push(
          this.fb.group({
            containerId: [plannedContainer?.containerId],
            BLNo: [actualData?.BLNo || '', Validators.required],
            courierTrackNo: [actualData?.courierTrackNo || actualData?.DHL || ''],
            courierServiceProvider: [actualData?.courierServiceProvider || ''],
            docArrivalNotes: [actualData?.docArrivalNotes || ''],
            expectedDocDate: [actualData?.expectedDocDate ? new Date(actualData.expectedDocDate) : null],
            receiver: [actualData?.receiver || (data.shipment?.bankName ? 'Bank' : ''), Validators.required],
            bankName: [actualData?.bankName || data.shipment?.bankName || ''],
            inwardCollectionAdviceDate: [actualData?.inwardCollectionAdviceDate ? new Date(actualData.inwardCollectionAdviceDate) : null],
            inwardCollectionAdviceDocumentUrl: [actualData?.inwardCollectionAdviceDocumentUrl || ''],
            inwardCollectionAdviceDocumentName: [actualData?.inwardCollectionAdviceDocumentName || ''],
            murabahaContractReleasedDate: [actualData?.murabahaContractReleasedDate ? new Date(actualData.murabahaContractReleasedDate) : null],
            murabahaContractApprovedDate: [actualData?.murabahaContractApprovedDate ? new Date(actualData.murabahaContractApprovedDate) : null],
            murabahaContractSubmittedDate: [actualData?.murabahaContractSubmittedDate ? new Date(actualData.murabahaContractSubmittedDate) : null],
            murabahaContractSubmittedDocumentUrl: [actualData?.murabahaContractSubmittedDocumentUrl || ''],
            murabahaContractSubmittedDocumentName: [actualData?.murabahaContractSubmittedDocumentName || ''],
            documentsReleasedDate: [actualData?.documentsReleasedDate ? new Date(actualData.documentsReleasedDate) : null],
            documentsReleasedDocumentUrl: [actualData?.documentsReleasedDocumentUrl || ''],
            documentsReleasedDocumentName: [actualData?.documentsReleasedDocumentName || ''],
          }, { validators: this.documentationBankValidator() })
        );

        this.blDetailsSplits.push(this.createBlDetailsGroup(plannedContainer, actualData, data, shipmentIndex));

        const containerCount = Math.max(1, Number(plannedContainer?.FCL ?? 1) || 1);
        const extractedContainerSource =
          actualData?.extractedContainers?.length
            ? actualData.extractedContainers
            : actualData?.billExtractionData?.containers || [];
        const shipmentNo = data.shipment?.shipmentNo || '';
        const existingTransportationBooked =
          (actualData as any)?.transportationBooked ||
          (actualData as any)?.transportContainers ||
          [];

        this.arrivalTimeSplits.push(
          this.fb.group({
            containerId: [plannedContainer?.containerId],
            arrivalOn: [actualData?.arrivalOn ? new Date(actualData.arrivalOn) : null],
            shipmentFreeRetentionDate: [actualData?.shipmentFreeRetentionDate ? new Date(actualData.shipmentFreeRetentionDate) : null],
            portRetentionWithPenaltyDate: [actualData?.portRetentionWithPenaltyDate ? new Date(actualData.portRetentionWithPenaltyDate) : null],
            maximumRetentionDate: [actualData?.maximumRetentionDate ? new Date(actualData.maximumRetentionDate) : null],
            arrivalNoticeDate: [actualData?.arrivalNoticeDate ? new Date(actualData.arrivalNoticeDate) : null],
            arrivalNoticeFreeRetentionDays: [actualData?.arrivalNoticeFreeRetentionDays ?? null],
            arrivalNoticeDocumentUrl: [actualData?.arrivalNoticeDocumentUrl || ''],
            arrivalNoticeDocumentName: [actualData?.arrivalNoticeDocumentName || ''],
            advanceRequestDate: [actualData?.advanceRequestDate ? new Date(actualData.advanceRequestDate) : null],
            advanceRequestDocumentUrl: [actualData?.advanceRequestDocumentUrl || ''],
            advanceRequestDocumentName: [actualData?.advanceRequestDocumentName || ''],
            doReleasedDate: [
              (actualData as any)?.doReleasedDate
                ? new Date((actualData as any).doReleasedDate)
                : null,
            ],
            doReleasedDocumentUrl: [actualData?.doReleasedDocumentUrl || ''],
            doReleasedDocumentName: [actualData?.doReleasedDocumentName || ''],
            doReleasedRemarks: [(actualData as any)?.doReleasedRemarks || ''],
            boePassingDate: [actualData?.boePassingDate ? new Date(actualData.boePassingDate) : null],
            boePassingDocumentUrl: [actualData?.boePassingDocumentUrl || ''],
            boePassingDocumentName: [actualData?.boePassingDocumentName || ''],
            boePassingRemarks: [actualData?.boePassingRemarks || ''],
            customsClearanceDate: [actualData?.customsClearanceDate ? new Date(actualData.customsClearanceDate) : null],
            customsClearanceDocumentUrl: [actualData?.customsClearanceDocumentUrl || ''],
            customsClearanceDocumentName: [actualData?.customsClearanceDocumentName || ''],
            customsClearanceRemarks: [actualData?.customsClearanceRemarks || ''],
            tokenReceivedDate: [
              (actualData as any)?.tokenReceivedDate
                ? new Date((actualData as any).tokenReceivedDate)
                : actualData?.tokenDate
                  ? new Date(actualData.tokenDate)
                  : null,
            ],
            municipalityDate: [
              (actualData as any)?.municipalityDate
                ? new Date((actualData as any).municipalityDate)
                : actualData?.municipalityClearanceDate
                  ? new Date(actualData.municipalityClearanceDate)
                  : null,
            ],
            municipalityDocumentUrl: [actualData?.municipalityDocumentUrl || ''],
            municipalityDocumentName: [actualData?.municipalityDocumentName || ''],
            municipalityRemarks: [
              (actualData as any)?.municipalityRemarks ||
              actualData?.municipalityClearanceRemarks ||
              '',
            ],
            municipalityStatus: [(actualData as any)?.municipalityStatus || 'open'],
            municipalityStatusComment: [(actualData as any)?.municipalityStatusComment || ''],
            dmBarcode: [(actualData as any)?.dmBarcode || ''],
            // Customs Original Documents
            customsDocBoeSubmissionDate: [(actualData as any)?.customsOriginalDocuments?.boe?.submissionDate ? new Date((actualData as any).customsOriginalDocuments.boe.submissionDate) : null],
            customsDocBoeUrl: [(actualData as any)?.customsOriginalDocuments?.boe?.documentUrl || ''],
            customsDocBoeName: [(actualData as any)?.customsOriginalDocuments?.boe?.documentName || ''],
            customsDocDoSubmissionDate: [(actualData as any)?.customsOriginalDocuments?.do?.submissionDate ? new Date((actualData as any).customsOriginalDocuments.do.submissionDate) : null],
            customsDocDoUrl: [(actualData as any)?.customsOriginalDocuments?.do?.documentUrl || ''],
            customsDocDoName: [(actualData as any)?.customsOriginalDocuments?.do?.documentName || ''],
            customsDocBlOriginalSubmissionDate: [(actualData as any)?.customsOriginalDocuments?.blOriginal?.submissionDate ? new Date((actualData as any).customsOriginalDocuments.blOriginal.submissionDate) : null],
            customsDocBlOriginalUrl: [(actualData as any)?.customsOriginalDocuments?.blOriginal?.documentUrl || ''],
            customsDocBlOriginalName: [(actualData as any)?.customsOriginalDocuments?.blOriginal?.documentName || ''],
            customsDocInvoiceSubmissionDate: [(actualData as any)?.customsOriginalDocuments?.invoice?.submissionDate ? new Date((actualData as any).customsOriginalDocuments.invoice.submissionDate) : null],
            customsDocInvoiceUrl: [(actualData as any)?.customsOriginalDocuments?.invoice?.documentUrl || ''],
            customsDocInvoiceName: [(actualData as any)?.customsOriginalDocuments?.invoice?.documentName || ''],
            customsDocPackingListSubmissionDate: [(actualData as any)?.customsOriginalDocuments?.packingList?.submissionDate ? new Date((actualData as any).customsOriginalDocuments.packingList.submissionDate) : null],
            customsDocPackingListUrl: [(actualData as any)?.customsOriginalDocuments?.packingList?.documentUrl || ''],
            customsDocPackingListName: [(actualData as any)?.customsOriginalDocuments?.packingList?.documentName || ''],
            customsDocCooSubmissionDate: [(actualData as any)?.customsOriginalDocuments?.coo?.submissionDate ? new Date((actualData as any).customsOriginalDocuments.coo.submissionDate) : null],
            customsDocCooUrl: [(actualData as any)?.customsOriginalDocuments?.coo?.documentUrl || ''],
            customsDocCooName: [(actualData as any)?.customsOriginalDocuments?.coo?.documentName || ''],
            transportationBooked: this.createTransportationBookedRows(
              containerCount,
              this.actualSplits.length - 1,
              existingTransportationBooked,
              extractedContainerSource
            ),
          })
        );

        this.clearancePaidSplits.push(
          this.fb.group({
            containerId: [plannedContainer?.containerId],
            paid_amount: [actualData?.paid_amount ?? null, Validators.required],
            paidOn: [
              actualData?.paidOn ? new Date(actualData.paidOn) : null,
              Validators.required,
            ],
            remarks: [actualData?.remarks || '', Validators.required],
          })
        );

        this.clearanceFinalSplits.push(
          this.fb.group({
            containerId: [plannedContainer?.containerId],
            paymentAllocations: this.createPaymentAllocationRows(
              (actualData as any)?.paymentAllocations?.length
                ? (actualData as any).paymentAllocations
                : (actualData as any)?.costSheetBookings
            ),
            paymentCostings: this.createPaymentCostingRows(
              (actualData as any)?.paymentCostings,
              (actualData as any)?.paymentAllocations?.length
                ? (actualData as any).paymentAllocations
                : (actualData as any)?.costSheetBookings
            ),
            packagingExpenses: this.createPackagingExpenseRows((actualData as any)?.packagingExpenses),
            paymentCostingDocumentUrl: [(actualData as any)?.paymentCostingDocumentUrl || ''],
            paymentCostingDocumentName: [(actualData as any)?.paymentCostingDocumentName || ''],
          })
        );

        this.grnSplits.push(
          this.fb.group({
            containerId: [plannedContainer?.containerId],
            qualityRows: this.createQualityRows((actualData as any)?.qualityRows, (actualData as any)?.qualityReports),
            qualityReports: this.createQualityReportRows((actualData as any)?.qualityReports),
          })
        );
        
        // 1 storageSplits entry per planned split, with N containers inside.
        // Prefer saved extracted containers from BL/bill extraction over FCL count.
        const existingStorageSplits = actualData?.storageSplits || [];
        const existingStorageAllocations = actualData?.storageAllocations || [];
        const storageExtractedContainerSource =
          actualData?.extractedContainers?.length
            ? actualData.extractedContainers
            : actualData?.billExtractionData?.containers || [];
        const storageContainerCount = Math.max(1, storageExtractedContainerSource.length || containerCount);

        const containersArray = this.fb.array(
          Array.from({ length: storageContainerCount }, (_, c) => {
            const normalizeSerial = (value: unknown) =>
              String(value || '')
                .trim()
                .toUpperCase()
                .replace(/\s+/g, ' ');
            const extractedContainer = storageExtractedContainerSource[c];
            const extractedSerial =
              extractedContainer?.containerNo ||
              (extractedContainer as any)?.container_no ||
              (extractedContainer as any)?.container_number ||
              (extractedContainer as any)?.containerNumber ||
              '';

            // Determine the container serial label first (this is our matching key).
            const containerLabelCandidate =
              existingStorageSplits?.[c]?.containerSerialNo ||
              existingStorageAllocations?.[c]?.containerSerialNo ||
              extractedSerial ||
              `${shipmentNo}-C${c + 1}`;

            const normalizedKey = normalizeSerial(containerLabelCandidate);
            const storageMatch =
              existingStorageSplits.find((row: any) => normalizeSerial(row?.containerSerialNo) === normalizedKey) ||
              existingStorageSplits[c];
            const allocationMatch =
              existingStorageAllocations.find((row: any) => normalizeSerial(row?.containerSerialNo) === normalizedKey) ||
              existingStorageAllocations[c];
            const containerLabel =
              storageMatch?.containerSerialNo ||
              allocationMatch?.containerSerialNo ||
              extractedSerial ||
              `${shipmentNo}-C${c + 1}`;
            return this.fb.group({
              containerSerialNo: [containerLabel],
              bags: [storageMatch?.bags ?? allocationMatch?.bags ?? extractedContainer?.pkgCt ?? (extractedContainer as any)?.pkg_ct ?? null],
              warehouse: [storageMatch?.warehouse || allocationMatch?.warehouse || ''],
              storageAvailability: [storageMatch?.storageAvailability ?? allocationMatch?.storageAvailability ?? null],
              receivedOnDate: [storageMatch?.receivedOnDate ? new Date(storageMatch.receivedOnDate) : null],
              receivedOnTime: [this.parseTimeValue(storageMatch?.receivedOnTime)],
              customsInspection: [storageMatch?.customsInspection || 'Yes'],
              grn: [storageMatch?.grn || ''],
              batch: [storageMatch?.batch || ''],
              productionDate: [
                storageMatch?.productionDate
                  ? new Date(storageMatch.productionDate)
                  : actualData?.packagingDate
                    ? new Date(actualData.packagingDate)
                    : this.parseExpiryDate(
                        (actualData?.packagingList as any)?.packagingDate ||
                        (actualData?.packagingList as any)?.productionDate
                      ),
              ],
              expiryDate: [
                storageMatch?.expiryDate
                  ? new Date(storageMatch.expiryDate)
                  : this.parseExpiryDate(actualData?.expiryDate || actualData?.packagingList?.expiryDate),
              ],
              hsCode: [
                storageMatch?.hsCode ||
                actualData?.hsCode ||
                (actualData?.packagingList as any)?.hsCode ||
                (actualData?.packagingList as any)?.hs_code ||
                '',
              ],
              grossWeight: [storageMatch?.grossWeight || actualData?.grossWeight || actualData?.packagingList?.totalGrossWeight || ''],
              netWeight: [storageMatch?.netWeight || actualData?.netWeight || actualData?.packagingList?.totalNetWeight || ''],
              remarks: [storageMatch?.remarks || ''],
              documentUrl: [storageMatch?.documentUrl || ''],
              documentName: [storageMatch?.documentName || ''],
            });
          })
        );

        this.storageSplits.push(
          this.fb.group({
            containerId: [plannedContainer?.containerId],
            noOfContainers: [storageContainerCount],
            storageDocumentUrl: [actualData?.storageDocumentUrl || ''],
            storageDocumentName: [actualData?.storageDocumentName || ''],
            containers: containersArray,
          })
        );
      });
  }

  // --- Child Event Handlers ---
  onConfirmNoOfShipments(no: number): void {
    const totalQtyMT = this.shipmentData()?.shipment?.plannedQtyMT ?? 0;
    if (no > 0 && totalQtyMT > 0) {
      this.syncPlannedSplitsByNoOfShipments(no, totalQtyMT);
    }
  }

  onAddActual(): void {
    const max = this.shipmentForm.get('plannedContainers')?.value || 0;
    if (this.actualSplits.length < max) {
      this.actualSplits.push(this.createGroup('actual'));
      const idx = this.actualSplits.length - 1;
      const planned = this.plannedSplits.at(idx);
      if (planned) {
        this.actualSplits.at(idx).patchValue(
          {
            actualSerialNo: `${idx + 1}`,
            FCL: planned.get('FCL')?.value,
            size: planned.get('size')?.value,
            qtyMT: planned.get('qtyMT')?.value,
            shipOnBoardDate: null,
            updatedETD: planned.get('etd')?.value,
            updatedETA: planned.get('eta')?.value,
          },
          { emitEvent: false }
        );
      }
      this.blDetailsSplits.push(this.createGroup('bl'));
      this.documentationSplits.push(this.createGroup('doc'));
      const plannedContainerCount = Math.max(1, Number(planned?.get('FCL')?.value ?? 1) || 1);
      this.arrivalTimeSplits.push(this.createGroup('arrival', idx, plannedContainerCount));
      this.clearancePaidSplits.push(this.createGroup('paid'));
      this.clearanceFinalSplits.push(this.createGroup('final'));
      this.grnSplits.push(this.createGroup('grn'));
      this.storageSplits.push(this.createGroup('storage'));
    }
  }

  onRemoveActual(index: number): void {
    this.actualSplits.removeAt(index);
    this.blDetailsSplits.removeAt(index);
    this.documentationSplits.removeAt(index);
    this.arrivalTimeSplits.removeAt(index);
    this.clearancePaidSplits.removeAt(index);
    this.clearanceFinalSplits.removeAt(index);
    this.grnSplits.removeAt(index);
    this.storageSplits.removeAt(index);
  }

  private createGroup(type: string, shipmentIndex = 0, containerCount = 1): FormGroup {
    switch (type) {
      case 'actual':
        return this.fb.group({
          containerId: [null],
          actualSerialNo: [''],
          commercialInvoiceNo: [''],
          shipOnBoardDate: [null, Validators.required],
          portOfLoading: [''],
          portOfDischarge: [''],
          noOfContainers: [null],
          noOfBags: [null],
          quantityByMt: [null],
          shippingLine: [''],
          freeDetentionDays: [null],
          maximumDetentionDays: [null],
          freightPrepared: ['No'],
          billExtractionData: [null],
          extractedContainers: [[]],
          packagingList: [null],
          FCL: [null],
          size: [null],
          qtyMT: [null, Validators.required],
          bags: [null, Validators.required],
          pallet: [null],
          updatedETD: [null, Validators.required],
          updatedETA: [null, Validators.required],
          BLNo: ['', Validators.required],
        }, { validators: this.actualDateOrderValidator() });
      case 'doc':
        return this.fb.group({
          containerId: [null],
          BLNo: ['', Validators.required],
          courierTrackNo: [''],
          courierServiceProvider: [''],
          expectedDocDate: [null],
          receiver: ['', Validators.required],
          bankName: [''],
          inwardCollectionAdviceDate: [null],
          inwardCollectionAdviceDocumentUrl: [''],
          inwardCollectionAdviceDocumentName: [''],
          murabahaContractReleasedDate: [null],
          murabahaContractApprovedDate: [null],
          murabahaContractSubmittedDate: [null],
          murabahaContractSubmittedDocumentUrl: [''],
          murabahaContractSubmittedDocumentName: [''],
          documentsReleasedDate: [null],
          documentsReleasedDocumentUrl: [''],
          documentsReleasedDocumentName: [''],
        }, { validators: this.documentationBankValidator() });
      case 'bl':
        return this.createBlDetailsGroup();
      case 'arrival':
        return this.fb.group({
          containerId: [null],
          arrivalOn: [null],
          shipmentFreeRetentionDate: [null],
          portRetentionWithPenaltyDate: [null],
          maximumRetentionDate: [null],
          arrivalNoticeDate: [null],
          arrivalNoticeFreeRetentionDays: [null],
          arrivalNoticeDocumentUrl: [''],
          arrivalNoticeDocumentName: [''],
          advanceRequestDate: [null],
          advanceRequestDocumentUrl: [''],
          advanceRequestDocumentName: [''],
          doReleasedDate: [null],
          doReleasedDocumentUrl: [''],
          doReleasedDocumentName: [''],
          doReleasedRemarks: [''],
          boePassingDate: [null],
          boePassingDocumentUrl: [''],
          boePassingDocumentName: [''],
          boePassingRemarks: [''],
          customsClearanceDate: [null],
          customsClearanceDocumentUrl: [''],
          customsClearanceDocumentName: [''],
          customsClearanceRemarks: [''],
          tokenReceivedDate: [null],
          municipalityDate: [null],
          municipalityDocumentUrl: [''],
          municipalityDocumentName: [''],
          municipalityRemarks: [''],
          municipalityStatus: ['open'],
          municipalityStatusComment: [''],
          dmBarcode: [''],
          // Customs Original Documents
          customsDocBoeSubmissionDate: [null],
          customsDocBoeUrl: [''],
          customsDocBoeName: [''],
          customsDocDoSubmissionDate: [null],
          customsDocDoUrl: [''],
          customsDocDoName: [''],
          customsDocBlOriginalSubmissionDate: [null],
          customsDocBlOriginalUrl: [''],
          customsDocBlOriginalName: [''],
          customsDocInvoiceSubmissionDate: [null],
          customsDocInvoiceUrl: [''],
          customsDocInvoiceName: [''],
          customsDocPackingListSubmissionDate: [null],
          customsDocPackingListUrl: [''],
          customsDocPackingListName: [''],
          customsDocCooSubmissionDate: [null],
          customsDocCooUrl: [''],
          customsDocCooName: [''],
          transportationBooked: this.createTransportationBookedRows(containerCount, shipmentIndex),
        });
      case 'paid':
        return this.fb.group({
          containerId: [null],
          paid_amount: [null, Validators.required],
          paidOn: [null, Validators.required],
          remarks: ['', Validators.required],
        });
      case 'final':
        return this.fb.group({
          containerId: [null],
          paymentAllocations: this.createPaymentAllocationRows(),
          paymentCostings: this.createPaymentCostingRows(),
          packagingExpenses: this.createPackagingExpenseRows(),
          paymentCostingDocumentUrl: [''],
          paymentCostingDocumentName: [''],
        });
      case 'grn':
        return this.fb.group({
          containerId: [null],
          qualityRows: this.createQualityRows(),
          qualityReports: this.createQualityReportRows([]),
        });
      case 'storage':
        return this.fb.group({
          containerId: [null],
          noOfContainers: [containerCount],
          storageDocumentUrl: [''],
          storageDocumentName: [''],
          containers: this.fb.array(
            Array.from({ length: Math.max(1, containerCount) }, (_, c) =>
              this.fb.group({
                containerSerialNo: [`SHIPMENT-${shipmentIndex + 1}-C${c + 1}`],
                bags: [null],
                warehouse: [''],
                storageAvailability: [null],
                receivedOnDate: [null],
                receivedOnTime: [null],
                customsInspection: ['Yes'],
                grn: [''],
                batch: [''],
                productionDate: [null],
                expiryDate: [null],
                remarks: [''],
                documentUrl: [''],
                documentName: [''],
              })
            )
          ),
        });
      default:
        return this.fb.group({});
    }
  }

  private createBlDetailsGroup(
    plannedContainer?: any,
    actualData?: any,
    data?: ShipmentDetailsResponse,
    shipmentIndex = 0
  ): FormGroup {
    const lineItem = this.getLineItemByShipmentIndex(data, shipmentIndex);
    const extractedContainerSource =
      actualData?.extractedContainers?.length
        ? actualData.extractedContainers
        : actualData?.billExtractionData?.containers || [];
    const noOfContainers =
      Number(
        actualData?.noOfContainers ??
        extractedContainerSource?.length ??
        plannedContainer?.FCL ??
        actualData?.FCL ??
        1
      ) || 1;
    return this.fb.group({
      containerId: [plannedContainer?.containerId ?? null],
      blNo: [actualData?.BLNo || ''],
      shippedOnBoard: [actualData?.shipOnBoardDate ? new Date(actualData.shipOnBoardDate) : null],
      portOfLoading: [actualData?.portOfLoading || ''],
      portOfDischarge: [actualData?.portOfDischarge || ''],
      noOfContainers: [noOfContainers],
      noOfBags: [actualData?.noOfBags ?? actualData?.bags ?? null],
      quantityByMt: [actualData?.quantityByMt ?? actualData?.qtyMT ?? plannedContainer?.qtyMT ?? null],
      shippingLine: [actualData?.shippingLine || ''],
      freeDetentionDays: [actualData?.freeDetentionDays ?? null],
      maximumDetentionDays: [actualData?.maximumDetentionDays ?? null],
      freightPrepared: [actualData?.freightPrepared || 'No'],
      actualBags: [actualData?.actualBags ?? actualData?.packagingList?.totalBags ?? null],
      expiryDate: [this.parseExpiryDate(actualData?.expiryDate || actualData?.packagingList?.expiryDate)],
      hsCode: [
        actualData?.hsCode ||
        (lineItem as any)?.hsCode ||
        actualData?.packagingList?.hsCode ||
        actualData?.packagingList?.hs_code ||
        '',
      ],
      packagingDate: [
        actualData?.packagingDate
          ? new Date(actualData.packagingDate)
          : this.parseExpiryDate(
              (lineItem as any)?.packagingDate ||
              (actualData?.packagingList as any)?.packagingDate ||
              (actualData?.packagingList as any)?.productionDate
            ),
      ],
      grossWeight: [actualData?.grossWeight || actualData?.packagingList?.totalGrossWeight || ''],
      netWeight: [actualData?.netWeight || actualData?.packagingList?.totalNetWeight || ''],
      blDocumentUrl: [actualData?.blDocumentUrl || ''],
      blDocumentName: [actualData?.blDocumentName || ''],
      costSheetBookingDocumentUrl: [actualData?.costSheetBookingDocumentUrl || ''],
      costSheetBookingDocumentName: [actualData?.costSheetBookingDocumentName || ''],
      packagingListDocumentUrl: [actualData?.packagingListDocumentUrl || ''],
      packagingListDocumentName: [actualData?.packagingListDocumentName || ''],
      packagingList: [actualData?.packagingList || null],
      extractedContainers: [actualData?.extractedContainers || []],
      costSheetBookings: this.createCostSheetBookingRows(actualData?.costSheetBookings),
      storageAllocations: this.createStorageAllocationRows(
        noOfContainers,
        shipmentIndex,
        actualData?.storageAllocations,
        extractedContainerSource
      ),
    });
  }

  private getLineItemByShipmentIndex(data: ShipmentDetailsResponse | undefined, shipmentIndex: number): any | null {
    const lineItems = (data?.shipment as any)?.lineItems;
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return null;
    }
    return lineItems[shipmentIndex] || lineItems[0] || null;
  }

  private createCostSheetBookingRows(existingRows?: any[]): FormArray {
    const existingMap = new Map(
      (existingRows || []).map((row) => [Number(row.sn) || 0, row])
    );
    return this.fb.array(
      this.getActiveBlRowDefinitions().map((definition) =>
        this.fb.group({
          sn: [definition.sn],
          description: [definition.description],
          visibleTo: [normalizeBlVisibleTo([...definition.visibleTo])],
          defaultQty: [definition.defaultQty ?? 1],
          defaultRate: [definition.defaultRate ?? 0],
          requestAmount: [existingMap.get(definition.sn)?.requestAmount ?? null],
          // POINT 5: paidAmount removed, replaced with remarks
          remarks: [existingMap.get(definition.sn)?.remarks ?? ''],
          attachmentDocumentUrl: [existingMap.get(definition.sn)?.attachmentDocumentUrl ?? ''],
          attachmentDocumentName: [existingMap.get(definition.sn)?.attachmentDocumentName ?? ''],
        })
      )
    );
  }

  private createStorageAllocationRows(count: number, shipmentIndex: number, existingRows?: any[], extractedContainers?: any[]): FormArray {
    const rows = new FormArray<FormGroup>([]);
    const safeCount = Math.max(1, extractedContainers?.length || count || 1);
    const shipmentNo = this.shipmentData()?.shipment?.shipmentNo || 'SHIPMENT';
    for (let i = 0; i < safeCount; i++) {
      const existing = existingRows?.[i];
      const extracted = extractedContainers?.[i];
      rows.push(
        this.fb.group({
          sn: [existing?.sn ?? i + 1],
	          containerSerialNo: [
	            existing?.containerSerialNo ||
	            extracted?.containerNo ||
	            (extracted as any)?.container_no ||
	            `${shipmentNo}-${shipmentIndex + 1}-C${i + 1}`
	          ],
	          bags: [existing?.bags ?? extracted?.pkgCt ?? extracted?.pkg_ct ?? ''],
	          warehouse: [existing?.warehouse || ''],
	          storageAvailability: [existing?.storageAvailability ?? ''],
        })
      );
    }
    return rows;
  }

  private createTransportationBookedRows(
    count: number,
    shipmentIndex: number,
    existingRows: any[] = [],
    extractedContainers?: any[]
  ): FormArray {
    const rows = new FormArray<FormGroup>([]);
    const safeCount = Math.max(1, extractedContainers?.length || count || 1);
    const shipmentNo = this.shipmentData()?.shipment?.shipmentNo || 'SHIPMENT';
    const defaultDate = this.createTodayDate();
    const defaultTime = this.createCurrentTimeDate();
    for (let i = 0; i < safeCount; i++) {
      const existing = existingRows[i];
      const extracted = extractedContainers?.[i];
      rows.push(
        this.fb.group({
          sn: [i + 1],
	          containerSerialNo: [
	            existing?.containerSerialNo ||
	            extracted?.containerNo ||
	            (extracted as any)?.container_no ||
	            `${shipmentNo}-${shipmentIndex + 1}-C${i + 1}`
	          ],
	          transportCompanyName: [existing?.transportCompanyName || ''],
	          bookedDate: [existing?.bookedDate ? new Date(existing.bookedDate) : defaultDate],
	          bookingTime: [this.parseTimeValue(existing?.bookingTime) || defaultTime],
          transportDate: [existing?.transportDate ? new Date(existing.transportDate) : defaultDate],
          transportTime: [this.parseTimeValue(existing?.transportTime) || defaultTime],
          delayHours: [existing?.delayHours ?? null],
        }, { validators: this.transportationDateOrderValidator() })
      );
    }
    return rows;
  }

  private createQualityRows(existingRows: any[] = [], existingReports: any[] = []): FormArray {
    const source = existingRows.length > 0 ? existingRows : [{}];
    return this.fb.array(
      source.map((row: any, index: number) => {
        const fallbackReport = existingReports[index] || {};
        const defaultDate = this.createTodayDate();
        return (
        this.fb.group({
          sn: [row?.sn ?? index + 1],
          sampleNo: [row?.sampleNo || row?.shipment_no_batch_no || fallbackReport?.shipment_no_batch_no || ''],
          phase: [row?.phase || 'S1'],
          purpose: [row?.purpose || ''],
          date: [row?.date ? new Date(row.date) : (row?.report_date ? new Date(row.report_date) : defaultDate)],
          inhouseReportNo: [row?.inhouseReportNo || ''],
          inhouseReportDate: [row?.inhouseReportDate ? new Date(row.inhouseReportDate) : defaultDate],
          inhouseReportDocumentUrl: [row?.inhouseReportDocumentUrl || ''],
          inhouseReportDocumentName: [row?.inhouseReportDocumentName || ''],
          strategicReportNo: [row?.strategicReportNo || ''],
          strategicReportDate: [row?.strategicReportDate ? new Date(row.strategicReportDate) : defaultDate],
          strategicReportDocumentUrl: [row?.strategicReportDocumentUrl || ''],
          strategicReportDocumentName: [row?.strategicReportDocumentName || ''],
          thirdPartyReportNo: [row?.thirdPartyReportNo || ''],
          thirdPartyReportDate: [row?.thirdPartyReportDate ? new Date(row.thirdPartyReportDate) : defaultDate],
          thirdPartyReportDocumentUrl: [row?.thirdPartyReportDocumentUrl || ''],
          thirdPartyReportDocumentName: [row?.thirdPartyReportDocumentName || ''],
          remarks: [row?.remarks || fallbackReport?.remarks || ''],
          attachmentDocumentUrl: [row?.attachmentDocumentUrl || fallbackReport?.documentUrl || ''],
          attachmentDocumentName: [row?.attachmentDocumentName || fallbackReport?.documentName || ''],
        })
      );
      })
    );
  }

  private parseTimeValue(value: unknown): Date | null {
    if (!value || typeof value !== 'string') return null;
    const [hours, minutes] = value.split(':').map((part) => Number(part));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  private createTodayDate(): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private createCurrentTimeDate(): Date {
    const date = new Date();
    date.setSeconds(0, 0);
    return date;
  }

  private createQualityReportRows(existingRows: any[] = []): FormArray {
    const source = existingRows.length > 0 ? existingRows : [{}];
    return this.fb.array(
      source.map((row: any) =>
        this.fb.group({
          phase: [row?.phase || 'S1'],
          reportDate: [row?.reportDate ? new Date(row.reportDate) : (row?.report_date ? new Date(row.report_date) : this.createTodayDate())],
          remarks: [row?.remarks || ''],
          documentUrl: [row?.documentUrl || ''],
          documentName: [row?.documentName || ''],
        })
      )
    );
  }

  private createPaymentAllocationRows(existingRows: any[] = []): FormArray {
    const existingMap = new Map((existingRows || []).map((row) => [Number(row?.sn) || 0, row]));
    const source = this.getActiveBlRowDefinitions().map((definition) => {
      const existing = existingMap.get(definition.sn);
      return {
        sn: existing?.sn ?? definition.sn,
        description: definition.description,
        visibleTo: normalizeBlVisibleTo([...definition.visibleTo]),
        defaultQty: Number(existing?.defaultQty ?? definition.defaultQty ?? 1),
        defaultRate: Number(existing?.defaultRate ?? definition.defaultRate ?? 0),
        requestAmount: existing?.requestAmount ?? null,
        paidAmount: existing?.paidAmount ?? null,
        reference: existing?.reference ?? '',
        attachmentDocumentUrl: existing?.attachmentDocumentUrl ?? '',
        attachmentDocumentName: existing?.attachmentDocumentName ?? '',
      };
    });
    return this.fb.array(
      source.map((row: any, index: number) =>
        this.fb.group({
          sn: [row?.sn ?? index + 1],
          description: [row?.description || ''],
          visibleTo: [normalizeBlVisibleTo(row?.visibleTo ?? [])],
          defaultQty: [Number(row?.defaultQty ?? 1)],
          defaultRate: [Number(row?.defaultRate ?? 0)],
          requestAmount: [row?.requestAmount ?? null],
          paidAmount: [row?.paidAmount ?? null],
          reference: [row?.reference ?? ''],
          attachmentDocumentUrl: [row?.attachmentDocumentUrl ?? ''],
          attachmentDocumentName: [row?.attachmentDocumentName ?? ''],
        })
      )
    );
  }

  private createPaymentCostingRows(existingRows: any[] = [], seedRows: any[] = []): FormArray {
    const existingMap = new Map((existingRows || []).map((row) => [Number(row?.sn) || 0, row]));
    const seedMap = new Map((seedRows || []).map((row) => [Number(row?.sn) || 0, row]));
    const source = this.getActiveBlRowDefinitions().map((definition) => {
      const existing = existingMap.get(definition.sn);
      const seeded = seedMap.get(definition.sn);
      return {
        sn: existing?.sn ?? seeded?.sn ?? definition.sn,
        description: definition.description,
        visibleTo: normalizeBlVisibleTo([...definition.visibleTo]),
        defaultQty: Number(existing?.defaultQty ?? seeded?.defaultQty ?? definition.defaultQty ?? 1),
        defaultRate: Number(existing?.defaultRate ?? seeded?.defaultRate ?? definition.defaultRate ?? 0),
        requestAmount: existing?.requestAmount ?? seeded?.requestAmount ?? null,
        paidAmount: existing?.paidAmount ?? seeded?.paidAmount ?? null,
        actualPaid: existing?.actualPaid ?? null,
        refBillNo: existing?.refBillNo ?? '',
        refBillDate: existing?.refBillDate ?? null,
        refBillVendor: existing?.refBillVendor ?? '',
        refBillDocumentUrl: existing?.refBillDocumentUrl ?? '',
        refBillDocumentName: existing?.refBillDocumentName ?? '',
      };
    });
    return this.fb.array(
      source.map((row: any, index: number) =>
        this.fb.group({
          sn: [row?.sn ?? index + 1],
          description: [row?.description || ''],
          visibleTo: [normalizeBlVisibleTo(row?.visibleTo ?? [])],
          defaultQty: [Number(row?.defaultQty ?? 1)],
          defaultRate: [Number(row?.defaultRate ?? 0)],
          requestAmount: [row?.requestAmount ?? null],
          paidAmount: [row?.paidAmount ?? null],
          actualPaid: [row?.actualPaid ?? null],
          refBillNo: [row?.refBillNo || ''],
          refBillDate: [row?.refBillDate ? new Date(row.refBillDate) : null],
          refBillVendor: [row?.refBillVendor || ''],
          refBillDocumentUrl: [row?.refBillDocumentUrl || ''],
          refBillDocumentName: [row?.refBillDocumentName || ''],
        })
      )
    );
  }

  private createPackagingExpenseRows(existingRows: any[] = []): FormArray {
    const source = existingRows.length > 0
      ? existingRows
      : [{
          sn: 1,
          item: '',
          packing: '',
          qty: null,
          uom: '',
          unitCostFC: null,
          unitCostDH: null,
          totalCostFC: null,
          totalCostDH: null,
          expenseAllocationFactor: null,
          expensesAllocated: null,
          totalValueWithExpenses: null,
          landedCostPerUnit: null,
          reference: '',
        }];

    return this.fb.array(
      source.map((row: any, index: number) =>
        this.fb.group({
          sn: [row?.sn ?? index + 1],
          item: [row?.item || ''],
          packing: [row?.packing || ''],
          qty: [row?.qty ?? null],
          uom: [row?.uom || ''],
          unitCostFC: [row?.unitCostFC ?? null],
          unitCostDH: [row?.unitCostDH ?? null],
          totalCostFC: [row?.totalCostFC ?? null],
          totalCostDH: [row?.totalCostDH ?? null],
          expenseAllocationFactor: [row?.expenseAllocationFactor ?? null],
          expensesAllocated: [row?.expensesAllocated ?? null],
          totalValueWithExpenses: [row?.totalValueWithExpenses ?? null],
          landedCostPerUnit: [row?.landedCostPerUnit ?? null],
          reference: [row?.reference || ''],
        })
      )
    );
  }

  // --- Navigation ---
  onStepChange(step: number): void {
    const targetStep = this.trackerStepConfigs()[step];
    if (!targetStep) {
      return;
    }
    if (!this.canViewStep(targetStep)) {
      return;
    }

    const blockedBy = this.getBlockedByStep(targetStep.index);
    if (blockedBy != null) {
      this.store.dispatch(ShipmentActions.setCurrentStep({ step: blockedBy }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    this.store.dispatch(ShipmentActions.setCurrentStep({ step: targetStep.index }));
    if (this.shipmentId) {
      this.store.dispatch(ShipmentActions.loadShipmentDetail({ id: this.shipmentId }));
    }
  }

  goToStep(stepIndex: number): void {
    const targetStep = this.trackerStepConfigs().find((step) => step.index === stepIndex);
    if (!targetStep || !this.canViewStep(targetStep)) {
      return;
    }

    const blockedBy = this.getBlockedByStep(stepIndex);
    if (blockedBy != null) {
      this.store.dispatch(ShipmentActions.setCurrentStep({ step: blockedBy }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    this.store.dispatch(ShipmentActions.setCurrentStep({ step: stepIndex }));
    if (this.shipmentId) {
      this.store.dispatch(ShipmentActions.loadShipmentDetail({ id: this.shipmentId }));
    }
  }

  nextStep(): void {
    const nextStep = this.getAdjacentAccessibleStep(1);
    if (nextStep) {
      this.store.dispatch(ShipmentActions.setCurrentStep({ step: nextStep.index }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevStep(): void {
    const previousStep = this.getAdjacentAccessibleStep(-1);
    if (previousStep) {
      this.store.dispatch(ShipmentActions.setCurrentStep({ step: previousStep.index }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  private shouldEnforceTabPermissions(): boolean {
    if (this.authService.isAdminLevelRole()) {
      return false;
    }
    return !!this.effectivePermissions();
  }

  private hasTrackerScreenAccess(): boolean {
    if (!this.shouldEnforceTabPermissions()) {
      return true;
    }
    // Explicit screen-level permission grants access.
    if (this.rbacService.hasPermission('shipment.screen.shipment_tracker.view')) {
      return true;
    }
    // Implicit access: if the user has view permission for at least one tracker
    // tab, they should be able to open the tracker (the tab they can't see will
    // simply be hidden in the stepper). This covers custom roles like Quality or
    // Warehouse that are assigned tab permissions without the parent screen key.
    return this.trackerStepConfigs().some((step) =>
      this.rbacService.hasPermission(step.viewPermissionKey)
    );
  }

  private canViewStep(step: TrackerStepConfig): boolean {
    if (!this.shouldEnforceTabPermissions()) {
      return true;
    }
    return this.rbacService.hasPermission(step.viewPermissionKey);
  }

  private getAdjacentAccessibleStep(direction: 1 | -1): TrackerStepConfig | null {
    const currentIndex = this.currentStep();
    const steps = this.trackerStepConfigs();

    for (let index = currentIndex + direction; index >= 0 && index < steps.length; index += direction) {
      const step = steps[index];
      if (step && this.canViewStep(step)) {
        return step;
      }
    }

    return null;
  }

  // --- Helpers ---
  private parseExpiryDate(v: any): Date | null {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    
    // If it's a string, try various formats
    const str = String(v).trim();
    if (!str) return null;

    // Handle "MM/YYYY" format common in packaging lists
    const mmYyyy = /^(\d{1,2})\/(\d{4})$/.exec(str);
    if (mmYyyy) {
      const month = parseInt(mmYyyy[1], 10) - 1;
      const year = parseInt(mmYyyy[2], 10);
      return new Date(year, month, 1);
    }

    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private allSubmitted(total: number, indices: number[]): boolean {
    if (total === 0) return false;
    for (let i = 0; i < total; i++) {
      if (!indices.includes(i)) return false;
    }
    return true;
  }

  private dateOrderValidator(startControlName: string, endControlName: string, errorKey: string): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const startValue = control.get(startControlName)?.value;
      const endValue = control.get(endControlName)?.value;
      if (!startValue || !endValue) return null;

      const startDate = new Date(startValue);
      const endDate = new Date(endValue);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return null;
      }

      const errors: ValidationErrors = {};

      if (endDate <= startDate) {
        errors[errorKey] = true;
      }

      const poDateStr = this.shipmentData()?.shipment?.orderDate;
      if (poDateStr) {
        const poDate = new Date(poDateStr);
        if (!Number.isNaN(poDate.getTime())) {
          poDate.setHours(0, 0, 0, 0);
          if (startDate <= poDate) {
            errors['etdBeforePoDate'] = true;
          }
          if (endDate <= poDate) {
            errors['etaBeforePoDate'] = true;
          }
        }
      }

      return Object.keys(errors).length > 0 ? errors : null;
    };
  }

  private actualDateOrderValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const shipOnBoardDate = control.get('shipOnBoardDate')?.value;
      const etd = control.get('updatedETD')?.value;
      const eta = control.get('updatedETA')?.value;

      const shipDate = shipOnBoardDate ? new Date(shipOnBoardDate) : null;
      const etdDate = etd ? new Date(etd) : null;
      const etaDate = eta ? new Date(eta) : null;
      const errors: ValidationErrors = {};

      // TODO: Temporarily disabled per business request.
      // Re-enable ship-on-board vs ETD/ETA ordering once validation policy is finalized.
      // if (shipDate && etdDate && etdDate <= shipDate) {
      //   errors['etdBeforeShipOnBoard'] = true;
      // }
      // if (shipDate && etaDate && etaDate <= shipDate) {
      //   errors['etaBeforeShipOnBoard'] = true;
      // }

      if (etdDate && etaDate && etaDate <= etdDate) {
        errors['etaBeforeEtd'] = true;
      }

      const poDateStr = this.shipmentData()?.shipment?.orderDate;
      if (poDateStr) {
        const poDate = new Date(poDateStr);
        if (!Number.isNaN(poDate.getTime())) {
          poDate.setHours(0, 0, 0, 0);
          if (etdDate && etdDate <= poDate) {
            errors['etdBeforePoDate'] = true;
          }
          if (etaDate && etaDate <= poDate) {
            errors['etaBeforePoDate'] = true;
          }
          if (shipDate && shipDate <= poDate) {
            errors['shipOnBoardBeforePoDate'] = true;
          }
        }
      }

      return Object.keys(errors).length > 0 ? errors : null;
    };
  }

  private transportationDateOrderValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const bookedDateValue = control.get('bookedDate')?.value;
      const bookingTimeValue = control.get('bookingTime')?.value;
      const transportDateValue = control.get('transportDate')?.value;
      const transportTimeValue = control.get('transportTime')?.value;

      if (!bookedDateValue || !bookingTimeValue || !transportDateValue || !transportTimeValue) {
        return null;
      }

      const bookedDate = new Date(bookedDateValue as string | Date);
      const transportDate = new Date(transportDateValue as string | Date);
      const bookingTime = bookingTimeValue instanceof Date ? bookingTimeValue : this.parseTimeValue(bookingTimeValue);
      const transportTime = transportTimeValue instanceof Date ? transportTimeValue : this.parseTimeValue(transportTimeValue);

      if (
        Number.isNaN(bookedDate.getTime()) ||
        Number.isNaN(transportDate.getTime()) ||
        !bookingTime ||
        !transportTime
      ) {
        return null;
      }

      bookedDate.setHours(bookingTime.getHours(), bookingTime.getMinutes(), 0, 0);
      transportDate.setHours(transportTime.getHours(), transportTime.getMinutes(), 0, 0);

      return transportDate < bookedDate ? { transportBeforeArranged: true } : null;
    };
  }

  private documentationBankValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const receiver = control.get('receiver')?.value;
      if (receiver !== 'Bank') return null;

      const requiredFields = [
        'bankName',
        'inwardCollectionAdviceDate',
        'murabahaContractReleasedDate',
        'murabahaContractApprovedDate',
        'murabahaContractSubmittedDate',
        'documentsReleasedDate',
      ];

      const missing = requiredFields.some((field) => !control.get(field)?.value);
      return missing ? { missingBankDocumentFields: true } : null;
    };
  }

  ngOnDestroy(): void {
    this.store.dispatch(ShipmentActions.resetShipmentFormState());
  }
}
