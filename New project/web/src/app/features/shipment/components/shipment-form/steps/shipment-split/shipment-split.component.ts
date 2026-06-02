import { Component, Input, Output, EventEmitter, inject, effect, signal, computed, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormArray, FormControl, FormGroup } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogService } from '../../../../../../core/services/confirm-dialog.service';
import { RbacService } from '../../../../../../core/services/rbac.service';
import { getComputedShipmentStatus, getShipmentStatusSeverity, type ShipmentStatusSeverity } from '../../shared/shipment-status';

import {
  selectActiveSplitTab,
  selectIsPlannedLocked,
  selectShipmentData,
  selectSubmittedActualIndices,
  selectSubmittingPlanned,
  selectSubmittingRowIndex,
} from '../../../../../../store/shipment/shipment.selectors';
import * as ShipmentActions from '../../../../../../store/shipment/shipment.actions';
import { ShipmentService } from '../../../../../../core/services/shipment.service';
import { ScheduledHistoryEntry, ExtractBillNoResponse } from '../../../../../../core/models/shipment.model';

type SplitTab = 'planned' | 'actual' | 'history' | 'report';

export interface HistoryDiffRow {
  index: number;
  shipmentId: string;
  status: 'Added' | 'Removed' | 'Modified' | 'Unchanged';
  changes: {
    field: string;
    before: any;
    after: any;
  }[];
}


@Component({
  selector: 'app-shipment-split',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    InputNumberModule,
    InputTextModule,
    DatePickerModule,
    ButtonModule,
    TableModule,
    ConfirmDialogModule,
    DialogModule,
    ToastModule,
  ],

  providers: [ConfirmationService],
  templateUrl: './shipment-split.component.html',
  styleUrl: './shipment-split.component.scss',
})
export class ShipmentSplitComponent implements AfterViewInit, OnDestroy {
  readonly appDateFormat = 'dd/mm/yy';
  @Input({ required: true }) plannedSplits!: FormArray;
  @Input({ required: true }) actualSplits!: FormArray;
  @Input({ required: true }) noOfShipmentsControl!: FormControl<number | null>;
  @Input() totalQtyMT = 0;
  @Output() addActual = new EventEmitter<void>();
  @Output() removeActual = new EventEmitter<number>();
  @Output() confirmNoOfShipments = new EventEmitter<number>();
  @Output() addPlannedRow = new EventEmitter<void>();
  @Output() removePlannedRow = new EventEmitter<number>();
  @Output() addRemainderRow = new EventEmitter<{ qtyMT: number; fcl: number; copyFrom: any }>();
  @Output() removeRemainderRow = new EventEmitter<number>();

  private store = inject(Store);
  private confirmationService = inject(ConfirmationService);
  private shipmentService = inject(ShipmentService);
  private messageService = inject(MessageService);
  private confirmDialog = inject(ConfirmDialogService);
  private rbacService = inject(RbacService);

  readonly shipmentData = toSignal(this.store.select(selectShipmentData));
  readonly isPlannedLocked = toSignal(this.store.select(selectIsPlannedLocked), {
    initialValue: false,
  });
  readonly activeSplitTab = toSignal(this.store.select(selectActiveSplitTab), {
    initialValue: 'planned' as const,
  });
  readonly submittedActualIndices = toSignal(this.store.select(selectSubmittedActualIndices), {
    initialValue: [],
  });
  readonly storeSubmittingPlanned = toSignal(this.store.select(selectSubmittingPlanned), {
    initialValue: false,
  });
  readonly storeSubmittingRowIndex = toSignal(this.store.select(selectSubmittingRowIndex), {
    initialValue: null,
  });
  readonly localSubmittingPlanned = signal(false);
  readonly localSubmittingRowIndex = signal<number | null>(null);
  readonly submittingPlanned = computed(() => this.localSubmittingPlanned() || this.storeSubmittingPlanned());
  readonly submittingRowIndex = computed(() => this.localSubmittingRowIndex() ?? this.storeSubmittingRowIndex());

  /** Row index for which bill-no extraction is in progress (show spinner). */
  readonly extractingBillNoRowIndex = signal<number | null>(null);
  readonly billDocumentFiles = signal<Record<number, File | null>>({});
  readonly splitTabOrder: SplitTab[] = ['planned', 'actual', 'history', 'report'];

  // ─── Track Order Modal ────────────────────────────────────────────────────
  readonly trackOrderModalVisible = signal(false);
  readonly trackOrderData = signal<{
    shipmentNo: string;
    currentStage: string;
    shipmentStatus: string;
    portOfLoading: string;
    portOfDischarge: string;
    etd: string;
    eta: string;
  } | null>(null);

  readonly shipmentStages = [
    'Shipment Entry',
    'Shipment Tracker',
    'BL Details',
    'Document Tracker',
    'Port and Customs Clearance Tracker',
    'Storage Allocation & Arrival',
    'Quality',
    'Payment & Costing',
  ] as const;
  readonly packagingListFiles = signal<Record<number, File | null>>({});
  readonly packagingBrands = signal<Record<number, string>>({});
  readonly showEtaShareModal = signal(false);
  readonly showEtaCalendar = signal(false);
  readonly etaCalendarDates = signal<Date[]>([]);
  readonly etaCalendarViewDate = signal<Date>(new Date());
  readonly editablePlannedRows = signal<number[]>([]);
  readonly actualBagCapacityError = signal<string | null>(null);
  readonly manualActualBagRows = signal<Record<number, boolean>>({});
  readonly actualExtractionErrors = signal<Record<number, string | null>>({});
  readonly showExtractionValidationModal = signal(false);
  readonly extractionValidationMessage = signal('');

  /** True after user clicks Confirm (No of Shipments) so the input becomes readonly until lock. */
  readonly noOfShipmentsConfirmed = signal(false);

  readonly extractionMessages = [
    'Uploading your documents securely',
    'Royal AI is reading the BL document',
    'Extracting bill number and invoice references',
    'Preparing the extraction result for review'
  ];
  readonly extractionMessageIndex = signal(0);
  readonly extractionProgress = signal(18);
  readonly currentExtractionMessage = computed(() => this.extractionMessages[this.extractionMessageIndex()] || this.extractionMessages[0]);
  private extractionTicker: any = null;
  private isRebalancingPlannedRows = false;

  private actualRecalcSub?: Subscription;
  private plannedLockSub?: Subscription;

  constructor() {
    effect(() => {
      const currentTab = this.activeSplitTab();
      const firstAllowedTab = this.splitTabOrder.find((tab) => this.canViewSplitTab(tab)) ?? 'planned';
      if (!this.canViewSplitTab(currentTab)) {
        this.store.dispatch(ShipmentActions.setActiveSplitTab({ tab: firstAllowedTab }));
      }
    });

    // Disable submitted actual rows whenever submitted indices change
    effect(() => {
      const indices = this.submittedActualIndices();
      indices.forEach((idx) => {
        if (this.actualSplits?.at(idx)) {
          this.actualSplits.at(idx).disable({ emitEvent: false });
        }
      });
    });

    // Reset confirmed state when planned rows are cleared (e.g. new shipment loaded)
    effect(() => {
      const len = this.plannedSplits?.length ?? 0;
      if (len === 0) {
        this.noOfShipmentsConfirmed.set(false);
        this.editablePlannedRows.set([]);
        this.manualActualBagRows.set({});
      }
    });

    effect(() => {
      const data = this.shipmentData();
      const actual = data?.actual;
      const shipment = data?.shipment as any;
      if (!actual) return;
      
      const brands: Record<number, string> = {};
      
      // 1. Map brands from existing actual container data (saved in DB)
      actual.forEach((container, index) => {
        if (container.packagingList?.brand) {
          brands[index] = container.packagingList.brand;
        }
      });
      
      // 2. Auto-map brand if it's a single-item shipment and field is empty
      const items = shipment?.lineItems || shipment?.items || [];
      const normalizeBrand = (value: unknown) => String(value || '').trim();
      const itemBrands = (Array.isArray(items) ? items : [])
        .map((item: any) => normalizeBrand(item?.brandName || item?.brand))
        .filter(Boolean);
      const uniqueItemBrands = [...new Set(itemBrands)];

      // Prefer shipment-level brand; otherwise auto-map if all items share the same brand (including 2-item shipments).
      const autoBrand =
        normalizeBrand(shipment?.brandName || shipment?.brand) ||
        (uniqueItemBrands.length === 1 ? uniqueItemBrands[0] : '');
      
      if (autoBrand) {
        console.log(`🏷️ [ShipmentSplit] Auto-mapping detected brand: "${autoBrand}"`);
        // Consider all rows currently in the UI (actualSplits)
        const uiRowsCount = this.actualSplits?.length || actual.length;
        
        for (let i = 0; i < uiRowsCount; i++) {
          if (!brands[i]) {
            console.log(`   🔸 Auto-filling row ${i} with brand`);
            brands[i] = autoBrand;
          }
        }
      } else {
        console.warn(`🏷️ [ShipmentSplit] Auto-mapping skipped: No unique brand found in shipment data`, { itemsCount: items.length, shipment });
      }
      
      this.packagingBrands.set(brands);
    });

    effect(() => {
      this.isPlannedLocked();
      this.submittedActualIndices();
      this.editablePlannedRows();
      this.applyPlannedRowLockState();
    });

    // Auto-fill bag values for untouched rows and keep capacity validation in sync.
    effect(() => {
      if (this.activeSplitTab() !== 'actual' || !this.actualSplits?.length) return;
      this.syncActualAutoBagValues();
      this.updateActualBagCapacityError();
    });

    // Re-run bags/pallet calc when actual form values change (e.g. parent patched after add/load)
    // Subscription is set up in ngAfterViewInit when actualSplits is available.
  }

  canEditSplitStep(): boolean {
    return this.rbacService.hasPermission('shipment.tab.shipment_tracker_split.edit');
  }

  canViewSplitTab(tab: SplitTab): boolean {
    const permissionMap: Record<SplitTab, string> = {
      planned: 'shipment.tab.shipment_tracker_split.scheduled.view',
      actual: 'shipment.tab.shipment_tracker_split.actual.view',
      history: 'shipment.tab.shipment_tracker_split.history.view',
      report: 'shipment.tab.shipment_tracker_split.report.view',
    };

    return this.rbacService.hasPermission(permissionMap[tab]);
  }

  canOpenSplitTab(tab: SplitTab): boolean {
    if (!this.canViewSplitTab(tab)) return false;
    if (tab !== 'actual') return true;
    return this.isPlannedLocked() || !this.canEditSplitStep();
  }

  ngAfterViewInit(): void {
    if (this.actualSplits?.valueChanges) {
      this.actualRecalcSub = this.actualSplits.valueChanges.pipe(debounceTime(0)).subscribe(() => {
        if (this.activeSplitTab() !== 'actual' || !this.actualSplits?.length) return;
        this.syncActualAutoBagValues();
        this.updateActualBagCapacityError();
      });
    }

    if (this.plannedSplits?.valueChanges) {
      this.plannedLockSub = this.plannedSplits.valueChanges.pipe(debounceTime(0)).subscribe(() => {
        this.applyPlannedRowLockState();
      });
      queueMicrotask(() => this.applyPlannedRowLockState());
    }
  }

  ngOnDestroy(): void {
    this.actualRecalcSub?.unsubscribe();
    this.plannedLockSub?.unsubscribe();
    this.stopExtractionExperience();
  }

  private startExtractionExperience(): void {
    this.stopExtractionExperience();
    this.extractionMessageIndex.set(0);
    this.extractionProgress.set(18);
    this.extractionTicker = setInterval(() => {
      this.extractionMessageIndex.update((index) => (index + 1) % this.extractionMessages.length);
      this.extractionProgress.update((value) => {
        if (value >= 88) return 26;
        return value + 12;
      });
    }, 1600);
  }

  private stopExtractionExperience(): void {
    if (this.extractionTicker) {
      clearInterval(this.extractionTicker);
      this.extractionTicker = null;
    }
  }

  private applyPlannedRowLockState(): void {
    if (!this.plannedSplits) return;
    const locked = this.isPlannedLocked();
    const editable = new Set(this.editablePlannedRows());
    const submittedActual = new Set(this.submittedActualIndices());

    this.plannedSplits.controls.forEach((control, index) => {
      if (submittedActual.has(index) || (locked && !editable.has(index))) {
        control.disable({ emitEvent: false });
      } else {
        control.enable({ emitEvent: false });
      }
    });
  }

  getPackingKg(): number {
    const p = this.shipmentData()?.shipment?.packing;
    if (p == null || p === '') return 20;
    
    // Attempt to specifically find a number immediately before KG/KGS
    const kgMatch = String(p).toUpperCase().match(/(\d+(?:\.\d+)?)\s*KGS?/);
    if (kgMatch && kgMatch[1]) {
      const num = parseFloat(kgMatch[1]);
      if (Number.isFinite(num) && num > 0) return num;
    }

    // Fallback block if KG prefix is not used explicitly
    const num = typeof p === 'number' ? p : parseFloat(String(p).replace(/[^0-9.]/g, ''));
    return Number.isFinite(num) && num > 0 ? num : 20;
  }

  getContainerCapacityMT(size: string | number | null | undefined): number {
    const s = size != null ? String(size).trim() : '';
    if (s === '40') return 26;
    return 25; // 20ft default
  }

  private getShipmentBagCapacity(): number {
    const shipment = this.shipmentData()?.shipment as any;
    const items = shipment?.lineItems || shipment?.items || [];
    const lineItemBagTotal = items.reduce((sum: number, item: any) => {
      const bags = Number(item?.bags) || 0;
      return sum + (bags > 0 ? bags : 0);
    }, 0);

    if (lineItemBagTotal > 0) {
      return lineItemBagTotal;
    }

    return Number(shipment?.bags) || 0;
  }

  private getAutoCalculatedBagDistribution(): number[] {
    if (!this.actualSplits?.length) return [];

    const totalBagCapacity = this.getShipmentBagCapacity();
    if (totalBagCapacity <= 0) {
      return this.actualSplits.controls.map(() => 0);
    }

    const submitted = new Set(this.submittedActualIndices());
    const manualRows = this.manualActualBagRows();

    const fixedBagTotal = this.actualSplits.controls.reduce((sum, row, index) => {
      if (!submitted.has(index) && !manualRows[index]) return sum;
      const bags = Number(row.get('bags')?.value) || 0;
      return sum + Math.max(0, Math.round(bags));
    }, 0);

    const autoRows = this.actualSplits.controls
      .map((row, index) => ({ row, index, qtyMT: Number(row.get('qtyMT')?.value) || 0 }))
      .filter(({ index }) => !submitted.has(index) && !manualRows[index]);

    const distribution = this.actualSplits.controls.map((row) => Math.max(0, Math.round(Number(row.get('bags')?.value) || 0)));
    if (!autoRows.length) {
      return distribution;
    }

    const remainingBagCapacity = Math.max(0, totalBagCapacity - fixedBagTotal);
    const totalAutoQty = autoRows.reduce((sum, entry) => sum + Math.max(0, entry.qtyMT), 0);
    let allocated = 0;

    autoRows.forEach((entry, autoIndex) => {
      let nextBags = 0;
      if (remainingBagCapacity > 0 && totalAutoQty > 0 && entry.qtyMT > 0) {
        if (autoIndex === autoRows.length - 1) {
          nextBags = Math.max(0, remainingBagCapacity - allocated);
        } else {
          nextBags = Math.max(0, Math.round((remainingBagCapacity * entry.qtyMT) / totalAutoQty));
          allocated += nextBags;
        }
      }
      distribution[entry.index] = nextBags;
    });

    return distribution;
  }

  private syncActualAutoBagValues(): void {
    if (!this.actualSplits?.length) return;

    const submitted = new Set(this.submittedActualIndices());
    const manualRows = this.manualActualBagRows();
    const nextDistribution = this.getAutoCalculatedBagDistribution();

    this.actualSplits.controls.forEach((row, index) => {
      if (submitted.has(index) || manualRows[index]) {
        return;
      }

      const nextBags = nextDistribution[index] ?? 0;
      const currentBags = Math.max(0, Math.round(Number(row.get('bags')?.value) || 0));
      const nextPallet = nextBags > 0 ? Math.round(nextBags / 50) : 0;
      const currentPallet = Math.max(0, Math.round(Number(row.get('pallet')?.value) || 0));

      if (currentBags !== nextBags || currentPallet !== nextPallet) {
        row.patchValue(
          { bags: nextBags, pallet: nextPallet },
          { emitEvent: false }
        );
      }
    });
  }

  private getActualAssignedBagsTotal(): number {
    if (!this.actualSplits?.length) return 0;
    return this.actualSplits.controls.reduce((sum, row) => {
      const bags = Number(row.get('bags')?.value) || 0;
      return sum + Math.max(0, Math.round(bags));
    }, 0);
  }

  private updateActualBagCapacityError(): void {
    const totalBagCapacity = this.getShipmentBagCapacity();
    if (totalBagCapacity <= 0 || !this.actualSplits?.length) {
      this.actualBagCapacityError.set(null);
      return;
    }

    const assignedBags = this.getActualAssignedBagsTotal();
    if (assignedBags > totalBagCapacity) {
      this.actualBagCapacityError.set(
        `Assigned bags (${assignedBags}) cannot be greater than shipment bag capacity (${totalBagCapacity}).`
      );
      return;
    }

    this.actualBagCapacityError.set(null);
  }

  markActualBagsAsManual(index: number): void {
    this.manualActualBagRows.update((current) => ({ ...current, [index]: true }));
    const row = this.actualSplits?.at(index);
    if (!row) return;
    const bags = Math.max(0, Math.round(Number(row.get('bags')?.value) || 0));
    row.get('pallet')?.setValue(bags > 0 ? Math.round(bags / 50) : 0, { emitEvent: false });
    this.updateActualBagCapacityError();
  }

  setTab(tab: SplitTab) {
    if (!this.canOpenSplitTab(tab)) return;
    this.store.dispatch(ShipmentActions.setActiveSplitTab({ tab }));
  }

  get scheduledHistory(): ScheduledHistoryEntry[] {
    return this.shipmentData()?.scheduledHistory || [];
  }

  /**
   * POINT 3: Build ETA/ETD report data — column-wise per shipment row showing
   * each update iteration: initial value, then each subsequent change.
   */
  get etaEtdReport(): Array<{
    shipmentId: string;
    updates: Array<{ iteration: number; eta: string; etd: string; updatedAt: string; updatedBy: string }>;
  }> {
    const history = this.scheduledHistory;
    if (!history.length) return [];

    // Group history entries by shipment row index
    const reportMap = new Map<number, Array<{ iteration: number; eta: string; etd: string; updatedAt: string; updatedBy: string }>>();

    history.forEach((entry) => {
      const rows = entry.after || [];
      rows.forEach((row: any, rowIndex: number) => {
        if (!reportMap.has(rowIndex)) {
          reportMap.set(rowIndex, []);
        }
        const updates = reportMap.get(rowIndex)!;
        const eta = row.eta ? this.formatHistoryTimestamp(row.eta) : '—';
        const etd = row.etd ? this.formatHistoryTimestamp(row.etd) : '—';
        const updatedAt = entry.createdAt ? this.formatHistoryTimestamp(entry.createdAt) : '—';
        const updatedBy = entry.user?.name || entry.user?.email || 'System';
        // Only add if ETA or ETD changed from previous entry
        const prev = updates[updates.length - 1];
        if (!prev || prev.eta !== eta || prev.etd !== etd) {
          updates.push({ iteration: updates.length + 1, eta, etd, updatedAt, updatedBy });
        }
      });
    });

    const result: Array<{ shipmentId: string; updates: Array<{ iteration: number; eta: string; etd: string; updatedAt: string; updatedBy: string }> }> = [];
    reportMap.forEach((updates, rowIndex) => {
      result.push({
        shipmentId: this.getScheduledShipmentId(rowIndex),
        updates,
      });
    });

    return result;
  }

  isPlannedRowEditable(index: number): boolean {
    return this.editablePlannedRows().includes(index);
  }

  startPlannedRowEdit(index: number): void {
    if (this.isPlannedRowLocked(index)) return;
    if (!this.isPlannedLocked() || this.isPlannedRowEditable(index)) return;
    this.editablePlannedRows.set([...this.editablePlannedRows(), index].sort((a, b) => a - b));
  }

  cancelPlannedRowEdit(index: number): void {
    this.editablePlannedRows.set(this.editablePlannedRows().filter((rowIndex) => rowIndex !== index));
  }

  hasPendingPlannedEdits(): boolean {
    return this.editablePlannedRows().length > 0;
  }

  onConfirmNoOfShipments(): void {
    const no = Number(this.noOfShipmentsControl.value) || 0;
    if (no > 0 && this.totalQtyMT > 0) {
      this.noOfShipmentsConfirmed.set(true);
      this.confirmNoOfShipments.emit(no);
    }
  }

  /** Get week-of-month (W1-W5) from date for weekWiseShipment. */
  getWeekString(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const weekNum = Math.ceil(d.getDate() / 7);
    return 'W' + weekNum;
  }

  /** When ETA is selected, auto-fill Week (week of month). */
  onEtaSelect(row: FormGroup, date: Date): void {
    if (date) {
      const weekStr = this.getWeekString(date instanceof Date ? date : new Date(date));
      row.get('weekWiseShipment')?.setValue(weekStr, { emitEvent: false });
    }
  }

  getMonthLabel(value: Date | string | null | undefined): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', { month: 'short' });
  }

  getWeekLabelForRow(row: FormGroup): string {
    const etaValue = row.get('eta')?.value;
    if (etaValue) {
      const etaDate = etaValue instanceof Date ? etaValue : new Date(etaValue);
      if (!Number.isNaN(etaDate.getTime())) {
        return this.getWeekString(etaDate);
      }
    }

    const weekValue = row.get('weekWiseShipment')?.value;
    return (typeof weekValue === 'string' && weekValue.trim()) ? weekValue : '—';
  }

  getEtaCalendarDates(): Date[] {
    return this.plannedSplits.controls
      .map((group) => group.get('eta')?.value)
      .filter((value): value is Date | string => Boolean(value))
      .map((value) => (value instanceof Date ? value : new Date(value)))
      .filter((date) => !Number.isNaN(date.getTime()));
  }

  openEtaCalendar(): void {
    const etaDates = this.getEtaCalendarDates();
    this.etaCalendarDates.set(etaDates);
    this.etaCalendarViewDate.set(etaDates[0] ? new Date(etaDates[0]) : new Date());
    this.showEtaShareModal.set(false);
    this.showEtaCalendar.set(true);
  }

  closeEtaCalendar(): void {
    this.showEtaShareModal.set(false);
    this.showEtaCalendar.set(false);
  }

  getEtaCalendarDateLabels(): string[] {
    return this.etaCalendarDates()
      .slice()
      .sort((left, right) => left.getTime() - right.getTime())
      .map((date) =>
        date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      );
  }

  getEtaCalendarMonthLabel(): string {
    return this.etaCalendarViewDate().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  showPreviousEtaCalendarMonth(): void {
    const current = this.etaCalendarViewDate();
    this.etaCalendarViewDate.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  showNextEtaCalendarMonth(): void {
    const current = this.etaCalendarViewDate();
    this.etaCalendarViewDate.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  getEtaCalendarWeekRows(): Array<Array<{ date: Date; inCurrentMonth: boolean; isSelected: boolean; isToday: boolean }>> {
    const viewDate = this.etaCalendarViewDate();
    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());

    const selectedDates = new Set(this.etaCalendarDates().map((date) => this.getDateKey(date)));
    const todayKey = this.getDateKey(new Date());
    const weeks: Array<Array<{ date: Date; inCurrentMonth: boolean; isSelected: boolean; isToday: boolean }>> = [];

    for (let weekIndex = 0; weekIndex < 6; weekIndex++) {
      const week: Array<{ date: Date; inCurrentMonth: boolean; isSelected: boolean; isToday: boolean }> = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + (weekIndex * 7) + dayIndex);
        const key = this.getDateKey(date);
        week.push({
          date,
          inCurrentMonth: date.getMonth() === viewDate.getMonth(),
          isSelected: selectedDates.has(key),
          isToday: key === todayKey,
        });
      }
      weeks.push(week);
    }

    return weeks;
  }

  formatEtaCalendarDay(date: Date): string {
    return String(date.getDate());
  }

  /** Called when qtyMT changes in a planned row — auto-sets FCL = ceil(qtyMT / 25) and recalculates remainder row. */
  onPlannedQtyMTChange(rowIndex: number): void {
    if (this.isRebalancingPlannedRows || !this.plannedSplits?.length) return;

    const row = this.plannedSplits.at(rowIndex);
    if (!row) return;

    // Auto-calc FCL from qtyMT — set flag so onPlannedFclBlur does NOT redistribute
    const qtyMT = Number(row.get('qtyMT')?.value) || 0;
    const autoFcl = qtyMT > 0 ? Math.ceil(qtyMT / 25) : 0;
    this.isRebalancingPlannedRows = true;
    row.get('FCL')?.setValue(autoFcl, { emitEvent: false });
    this.isRebalancingPlannedRows = false;

    // Recalculate remainder row only — never touch other rows
    this.recalculateRemainderRow();
  }

  /** Recalculates and manages the auto-added remainder row. */
  recalculateRemainderRow(): void {
    if (this.isRebalancingPlannedRows || !this.plannedSplits?.length) return;

    const totalQtyMT = Number(this.shipmentData()?.shipment?.plannedQtyMT ?? this.totalQtyMT) || 0;
    if (totalQtyMT <= 0) return;

    const submittedActual = new Set(this.submittedActualIndices());

    // Sum all non-remainder rows (rows that are not auto-remainder rows)
    let allocatedMT = 0;
    let remainderRowIndex = -1;
    this.plannedSplits.controls.forEach((ctrl, i) => {
      if (ctrl.get('isRemainderRow')?.value) {
        remainderRowIndex = i;
      } else {
        allocatedMT += Number(ctrl.get('qtyMT')?.value) || 0;
      }
    });

    const remainderMT = Math.round((totalQtyMT - allocatedMT) * 100) / 100;

    if (remainderMT > 0) {
      // Need a remainder row
      if (remainderRowIndex >= 0) {
        // Update existing remainder row
        const remainderRow = this.plannedSplits.at(remainderRowIndex);
        const newFcl = Math.ceil(remainderMT / 25);
        this.isRebalancingPlannedRows = true;
        remainderRow.get('qtyMT')?.setValue(remainderMT, { emitEvent: false });
        remainderRow.get('FCL')?.setValue(newFcl, { emitEvent: false });
        this.isRebalancingPlannedRows = false;
      } else {
        // Add a new remainder row — copy most fields from last non-remainder row
        const lastRow = this.plannedSplits.controls
          .filter(c => !c.get('isRemainderRow')?.value)
          .slice(-1)[0];
        const lastVal = lastRow?.getRawValue() || {};
        const newFcl = Math.ceil(remainderMT / 25);
        this.isRebalancingPlannedRows = true;
        // We emit via parent — use @Output to add row
        this.addRemainderRow.emit({ qtyMT: remainderMT, fcl: newFcl, copyFrom: lastVal });
        this.isRebalancingPlannedRows = false;
      }
    } else if (remainderMT <= 0 && remainderRowIndex >= 0) {
      // Remainder is 0 or negative — remove the remainder row if not submitted as actual
      if (!submittedActual.has(remainderRowIndex)) {
        this.removeRemainderRow.emit(remainderRowIndex);
      }
    }

    // Update noOfShipments to reflect current count
    const totalRows = this.plannedSplits.length;
    this.noOfShipmentsControl.setValue(totalRows, { emitEvent: false });
  }

  onPlannedFclBlur(rowIndex: number): void {
    // If rebalancing is in progress, skip entirely
    if (!this.plannedSplits?.length || this.isRebalancingPlannedRows) {
      return;
    }

    const totalFcl = Number(this.shipmentData()?.shipment?.fcl) || 0;
    const totalQtyMT = Number(this.shipmentData()?.shipment?.plannedQtyMT ?? this.totalQtyMT) || 0;
    if (rowIndex < 0 || rowIndex >= this.plannedSplits.length) {
      return;
    }

    // POINT 6: QTY MT is now read-only and auto-calculated from FCL.
    // Formula: qtyMT = FCL × (totalQtyMT / totalFcl) — i.e. qty per container × FCL for this row.
    const row = this.plannedSplits.at(rowIndex);
    let rowFcl = Number(row.get('FCL')?.value) || 0;
    const maxAllowedFcl = this.getMaxAllowedPlannedFcl(rowIndex);

    if (rowFcl > maxAllowedFcl) {
      rowFcl = maxAllowedFcl;
      this.isRebalancingPlannedRows = true;
      row.get('FCL')?.setValue(maxAllowedFcl, { emitEvent: false });
      this.isRebalancingPlannedRows = false;
      this.messageService.add({
        severity: 'error',
        summary: 'FCL exceeds supported maximum',
        detail: `You cannot assign more than ${maxAllowedFcl} FCL for this row. Total shipment FCL supported is ${totalFcl}.`,
      });
    }

    if (totalFcl > 0 && totalQtyMT > 0 && rowFcl > 0) {
      const qtyPerContainer = totalQtyMT / totalFcl;
      const autoQtyMT = this.roundQty(rowFcl * qtyPerContainer);
      this.isRebalancingPlannedRows = true;
      row.get('qtyMT')?.setValue(autoQtyMT, { emitEvent: false });
      this.isRebalancingPlannedRows = false;
    } else if (rowFcl === 0) {
      this.isRebalancingPlannedRows = true;
      row.get('qtyMT')?.setValue(0, { emitEvent: false });
      this.isRebalancingPlannedRows = false;
    }

    // Recalculate remainder row after FCL change
    this.recalculateRemainderRow();
  }

  getMaxAllowedPlannedFcl(rowIndex: number): number {
    if (!this.plannedSplits?.length) return 0;
    const totalFcl = Number(this.shipmentData()?.shipment?.fcl) || 0;
    if (totalFcl <= 0) return 0;

    const row = this.plannedSplits.at(rowIndex);
    const currentRowFcl = Number(row?.get('FCL')?.value) || 0;
    const allocatedExcludingRow = this.plannedSplits.controls.reduce((sum, control, index) => {
      if (index === rowIndex) return sum;
      return sum + (Number(control.get('FCL')?.value) || 0);
    }, 0);

    return Math.max(0, totalFcl - allocatedExcludingRow + currentRowFcl);
  }

  private distributeRemainingFcl(totalFcl: number, rowCount: number): number[] {
    if (rowCount <= 0) return [];
    if (totalFcl <= 0) return Array.from({ length: rowCount }, () => 0);

    const base = Math.floor(totalFcl / rowCount);
    const remainder = totalFcl % rowCount;
    return Array.from({ length: rowCount }, (_, index) => base + (index < remainder ? 1 : 0));
  }

  private distributeQtyByFcl(totalQtyMT: number, fclValues: number[], totalFcl: number): number[] {
    if (!fclValues.length) return [];
    if (totalQtyMT <= 0 || totalFcl <= 0) return Array.from({ length: fclValues.length }, () => 0);

    const distributed: number[] = [];
    let allocated = 0;
    for (let index = 0; index < fclValues.length; index++) {
      if (index === fclValues.length - 1) {
        distributed.push(this.roundQty(totalQtyMT - allocated));
        continue;
      }

      const qty = this.roundQty(totalQtyMT * ((fclValues[index] || 0) / totalFcl));
      distributed.push(qty);
      allocated += qty;
    }

    return distributed;
  }

  private roundQty(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
  }

  private getDateKey(date: Date): string {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
  }

  private getShipmentTrackerBase(): string {
    const shipment = this.shipmentData()?.shipment as any;
    const shipmentNo = String(shipment?.shipmentNo || '').trim();
    const trackerPrefix = shipmentNo.match(/^(RHST-\d+\/[A-Z0-9-]+)/i)?.[1];
    return trackerPrefix || shipment?.poNumber || shipment?.fpoNo || shipment?.orderNumber || shipmentNo || shipment?._id || '';
  }

  getShipmentTrackerId(): string {
    return this.getShipmentTrackerBase();
  }

  getEtaShareText(): string {
    const shipmentNo = this.shipmentData()?.shipment?.shipmentNo || 'Shipment';
    const trackerId = this.getShipmentTrackerId();
    const trackerUrl = typeof window !== 'undefined' ? window.location.href : '';

    return [
      `Shipment Tracker: ${shipmentNo}`,
      trackerId ? `Tracker ID: ${trackerId}` : null,
      trackerUrl ? `Tracker URL: ${trackerUrl}` : null,
      '',
      'Scheduled ETA Dates',
      ...this.getEtaCalendarDateLabels().map((label) => `- ${label}`),
    ]
      .filter(Boolean)
      .join('\n');
  }

  async shareEtaCalendarDates(): Promise<void> {
    const labels = this.getEtaCalendarDateLabels();
    if (!labels.length) {
      this.messageService.add({
        severity: 'info',
        summary: 'No ETA dates',
        detail: 'Add ETA dates first to share them.',
      });
      return;
    }

    const shareText = this.getEtaShareText();

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Scheduled ETA Dates',
          text: shareText,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        this.messageService.add({
          severity: 'success',
          summary: 'Copied',
          detail: 'ETA dates copied to clipboard for sharing.',
        });
        return;
      }

      throw new Error('Sharing is not supported on this device.');
    } catch (error) {
      const err = error as Error & { name?: string };
      if (err?.name === 'AbortError') {
        return;
      }

      this.messageService.add({
        severity: 'warn',
        summary: 'Share unavailable',
        detail: err?.message || 'Could not share ETA dates on this device.',
      });
    }
  }

  shareEtaCalendarOnWhatsApp(): void {
    const labels = this.getEtaCalendarDateLabels();
    if (!labels.length) {
      this.messageService.add({
        severity: 'info',
        summary: 'No ETA dates',
        detail: 'Add ETA dates first to share them.',
      });
      return;
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(this.getEtaShareText())}`, '_blank', 'noopener');
  }

  shareEtaCalendarViaEmail(): void {
    const labels = this.getEtaCalendarDateLabels();
    if (!labels.length) {
      this.messageService.add({
        severity: 'info',
        summary: 'No ETA dates',
        detail: 'Add ETA dates first to share them.',
      });
      return;
    }

    const shipmentNo = this.shipmentData()?.shipment?.shipmentNo || 'Shipment';
    const subject = encodeURIComponent(`ETA Calendar - ${shipmentNo}`);
    const body = encodeURIComponent(this.getEtaShareText());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  openEtaShareModal(): void {
    const labels = this.getEtaCalendarDateLabels();
    if (!labels.length) {
      this.messageService.add({
        severity: 'info',
        summary: 'No ETA dates',
        detail: 'Add ETA dates first to share them.',
      });
      return;
    }

    this.showEtaShareModal.set(true);
  }

  closeEtaShareModal(): void {
    this.showEtaShareModal.set(false);
  }

  getShipmentNoForRow(index: number): string {
    const base = this.shipmentData()?.shipment?.shipmentNo || '';
    return base ? `${base}-${index + 1}` : `${index + 1}`;
  }

  getScheduledShipmentId(index: number): string {
    const base = this.getShipmentTrackerBase() || 'RHST';
    return `${base}/SCG${String(index + 1).padStart(2, '0')}`;
  }

  getActualShipmentId(index: number): string {
    const base = this.getShipmentTrackerBase() || 'RHST';
    return `${base}/ACT${String(index + 1).padStart(2, '0')}`;
  }

  private patchPlannedRowsAfterSave(containers: any[]): void {
    if (!Array.isArray(containers) || !containers.length) return;

    containers.forEach((container, index) => {
      const planned = this.plannedSplits.at(index) as FormGroup | null;
      if (planned) {
        planned.patchValue(
          {
            size: container?.planned?.size ?? planned.get('size')?.value,
            qtyMT: container?.planned?.qtyMT ?? planned.get('qtyMT')?.value,
            FCL: container?.planned?.FCL ?? planned.get('FCL')?.value,
            etd: container?.planned?.etd ? new Date(container.planned.etd) : planned.get('etd')?.value,
            eta: container?.planned?.eta ? new Date(container.planned.eta) : planned.get('eta')?.value,
            weekWiseShipment: container?.planned?.weekWiseShipment ?? planned.get('weekWiseShipment')?.value,
          },
          { emitEvent: false }
        );
      }

      const actualRowIndex = this.actualSplits.controls.findIndex((control) => {
        const rowContainerId = (control as FormGroup).get('containerId')?.value;
        return String(rowContainerId || '') === String(container?._id || '');
      });
      const actual = (
        actualRowIndex >= 0 ? this.actualSplits.at(actualRowIndex) : this.actualSplits.at(index)
      ) as FormGroup | null;
      const actualData = container?.actual || {};
      if (actual) {
        actual.patchValue(
          {
            containerId: container?._id ?? actual.get('containerId')?.value,
            FCL: container?.planned?.FCL ?? actual.get('FCL')?.value,
            size: container?.planned?.size ?? actual.get('size')?.value,
            qtyMT: container?.planned?.qtyMT ?? actual.get('qtyMT')?.value,
            updatedETD: actualData?.updatedETD
              ? new Date(actualData.updatedETD)
              : container?.planned?.etd
                ? new Date(container.planned.etd)
                : actual.get('updatedETD')?.value,
            updatedETA: actualData?.updatedETA
              ? new Date(actualData.updatedETA)
              : container?.planned?.eta
                ? new Date(container.planned.eta)
                : actual.get('updatedETA')?.value,
          },
          { emitEvent: false }
        );
      }
    });
  }

  private patchActualRowAfterSave(index: number, response: any): void {
    const row = this.actualSplits.at(index) as FormGroup | null;
    const actual = response?.container?.actual;
    if (!row || !actual) return;

    row.patchValue(
      {
        actualSerialNo: actual.actualSerialNo || this.getActualShipmentId(index),
        commercialInvoiceNo: actual.commercialInvoiceNo || '',
        shipOnBoardDate: actual.shipOnBoardDate ? new Date(actual.shipOnBoardDate) : null,
        qtyMT: actual.qtyMT ?? row.get('qtyMT')?.value,
        bags: actual.bags ?? row.get('bags')?.value,
        pallet: actual.pallet ?? row.get('pallet')?.value,
        portOfLoading: actual.portOfLoading || '',
        portOfDischarge: actual.portOfDischarge || '',
        noOfContainers: actual.noOfContainers ?? null,
        noOfBags: actual.noOfBags ?? null,
        quantityByMt: actual.quantityByMt ?? null,
        shippingLine: actual.shippingLine || '',
        freeDetentionDays: actual.freeDetentionDays ?? null,
        maximumDetentionDays: actual.maximumDetentionDays ?? null,
        freightPrepared: actual.freightPrepared || 'No',
        billExtractionData: actual.billExtractionData || null,
        extractedContainers: actual.extractedContainers || [],
        packagingList: actual.packagingList || null,
        packagingListDocumentUrl: actual.packagingListDocumentUrl || '',
        packagingListDocumentName: actual.packagingListDocumentName || '',
        updatedETD: actual.updatedETD ? new Date(actual.updatedETD) : row.get('updatedETD')?.value,
        updatedETA: actual.updatedETA ? new Date(actual.updatedETA) : row.get('updatedETA')?.value,
        receivedOn: actual.receivedOn ? new Date(actual.receivedOn) : null,
        status: 'Actual',
        BLNo: actual.BLNo || '',
      },
      { emitEvent: false }
    );
  }

  canDeletePlannedRow(index: number): boolean {
    if (this.isPlannedRowLocked(index)) return false;
    if (this.isPlannedLocked()) return false;
    if (this.plannedSplits.length <= 1) return false;
    const row = this.plannedSplits.at(index);
    return !!row?.get('isManualRow')?.value || !!row?.get('isRemainderRow')?.value;
  }

  isPlannedRowLocked(index: number): boolean {
    return this.submittedActualIndices().includes(index);
  }

  getActualRowDate(row: FormGroup, controlName: string): Date | null {
    const value = row.get(controlName)?.value;
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private strictMinDateCache = new WeakMap<FormGroup, Record<string, { baseTime: number; minDate: Date }>>();

  getStrictMinDate(row: FormGroup, controlName: string): Date | undefined {
    const baseDate = this.getActualRowDate(row, controlName);
    if (!baseDate) return undefined;
    // PrimeNG DatePicker uses object identity on minDate changes.
    // Returning a new Date() on every change detection can break month navigation.
    const baseTime = baseDate.getTime();
    const perRow = this.strictMinDateCache.get(row) || {};
    const cached = perRow[controlName];
    if (cached && cached.baseTime === baseTime) return cached.minDate;

    const minDate = new Date(baseDate);
    minDate.setDate(minDate.getDate() + 1);
    perRow[controlName] = { baseTime, minDate };
    this.strictMinDateCache.set(row, perRow);
    return minDate;
  }

  getActualDateError(group: FormGroup): string | null {
    if (group.hasError('shipOnBoardBeforePoDate')) {
      return 'Ship Onboard Date must be later than PO Date.';
    }

    if (group.hasError('etdBeforePoDate')) {
      return 'ETD must be later than PO Date.';
    }

    if (group.hasError('etaBeforePoDate')) {
      return 'ETA must be later than PO Date.';
    }

    if (group.hasError('etdBeforeShipOnBoard')) {
      return 'ETD must be later than Ship Onboard Date.';
    }

    if (group.hasError('etaBeforeShipOnBoard')) {
      return 'ETA must be later than Ship Onboard Date.';
    }

    if (group.hasError('etaBeforeEtd')) {
      return 'ETA must be later than ETD.';
    }

    return null;
  }

  getPlannedDateError(group: FormGroup): string | null {
    if (group.hasError('etdBeforePoDate')) {
      return 'ETD must be later than PO Date.';
    }

    if (group.hasError('etaBeforePoDate')) {
      return 'ETA must be later than PO Date.';
    }

    if (group.hasError('etaBeforeEtd')) {
      return 'ETA must be later than ETD.';
    }

    return null;
  }

  getPlannedTotals() {
    const splits = this.activeSplitTab() === 'actual' ? this.actualSplits : this.plannedSplits;
    return splits.getRawValue().reduce(
      (acc, curr) => ({
        mt: acc.mt + (Number(curr['qtyMT']) || 0),
        fcl: acc.fcl + (Number(curr['FCL']) || 0),
      }),
      { mt: 0, fcl: 0 }
    );
  }

  isRowSubmitted(index: number): boolean {
    return this.submittedActualIndices().includes(index);
  }

  onPackagingListFileSelected(event: Event, rowIndex: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.packagingListFiles.update((current) => ({ ...current, [rowIndex]: file }));
    this.setActualExtractionError(rowIndex, null);
    input.value = '';
  }

  onPackagingBrandChange(value: string, rowIndex: number): void {
    this.packagingBrands.update((current) => ({ ...current, [rowIndex]: value }));
  }

  canExtractDetails(rowIndex: number): boolean {
    return !!this.getBillDocumentFile(rowIndex) && !!this.getPackagingListFile(rowIndex);
  }

  private normalizeContainerNumber(value: any): string {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }

  private getBillContainerNumbers(billData: any): string[] {
    const containers = Array.isArray(billData?.containers) ? billData.containers : [];
    return containers
      .map((entry: any) => {
        if (typeof entry === 'string') return this.normalizeContainerNumber(entry);
        return this.normalizeContainerNumber(
          entry?.container_number ??
          entry?.containerNo ??
          entry?.container_no ??
          entry?.containerNumber ??
          ''
        );
      })
      .filter(Boolean);
  }

  private getPackagingContainerNumbers(pkgData: any): string[] {
    const explicitList = Array.isArray(pkgData?.container_number_list) ? pkgData.container_number_list : [];
    const infoList = Array.isArray(pkgData?.container_info) ? pkgData.container_info : [];
    const fromExplicit = explicitList.map((entry: any) => this.normalizeContainerNumber(entry)).filter(Boolean);
    const fromInfo = infoList
      .map((entry: any) => this.normalizeContainerNumber(entry?.container_number ?? entry?.containerNo ?? entry?.container_no ?? ''))
      .filter(Boolean);
    return (fromExplicit.length ? fromExplicit : fromInfo).filter(Boolean);
  }

  private validateExtractedContainers(billData: any, pkgData: any): string | null {
    const billContainers = this.getBillContainerNumbers(billData);
    const packagingContainers = this.getPackagingContainerNumbers(pkgData);

    if (!billContainers.length || !packagingContainers.length) {
      return 'Container lists could not be extracted from both the Bill of Lading and Packaging List. Please re-upload both documents.';
    }

    if (billContainers.length !== packagingContainers.length) {
      return `Container count mismatch: BL has ${billContainers.length} container(s) while Packaging List has ${packagingContainers.length}. Please re-upload both documents.`;
    }

    return null;
  }

  private setActualExtractionError(rowIndex: number, message: string | null): void {
    this.actualExtractionErrors.update((current) => ({ ...current, [rowIndex]: message }));
  }

  getActualExtractionError(rowIndex: number): string | null {
    return this.actualExtractionErrors()[rowIndex] || null;
  }

  canSaveActualRow(index: number, group: FormGroup): boolean {
    return !group.invalid && !this.getActualExtractionError(index) && !this.actualBagCapacityError();
  }

  closeExtractionValidationModal(): void {
    this.showExtractionValidationModal.set(false);
    this.extractionValidationMessage.set('');
  }

  /** Upload documents to extract details and autopopulate for the given row. */
  onExtractDetails(rowIndex: number): void {
    const blFile = this.billDocumentFiles()[rowIndex];
    const pkgFile = this.packagingListFiles()[rowIndex];
    const brand = this.packagingBrands()[rowIndex] || '';

    if (!blFile || !pkgFile) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Documents required',
        detail: 'Please upload both the Bill of Lading and Packaging List before extracting.'
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', blFile, blFile.name);
    formData.append('packaging_list_file', pkgFile, pkgFile.name);
    if (brand) {
      formData.append('packaging_brand', brand);
    }

    this.extractingBillNoRowIndex.set(rowIndex);
    this.startExtractionExperience();
    this.shipmentService.extractShipmentDetailsFromDocuments(formData).subscribe({
      next: (res: ExtractBillNoResponse) => {
        this.extractingBillNoRowIndex.set(null);
        this.stopExtractionExperience();
        
        const billData = res.bill_extracted_data || {};
        const pkgData = res.packaging_list || {};
        const billNo = billData.bill_no?.trim() || res.bill_no?.trim() || '';
        const invoiceNumber = billData.invoice_number?.trim() || res.invoice_number?.trim() || '';
        const containerValidationError = this.validateExtractedContainers(billData, pkgData);
        
        if (this.actualSplits?.at(rowIndex)) {
          const row = this.actualSplits.at(rowIndex);

          if (containerValidationError) {
            this.setActualExtractionError(rowIndex, containerValidationError);
            row.get('billExtractionData')?.setValue(null);
            row.get('packagingList')?.setValue(null);
            row.get('extractedContainers')?.setValue([]);
            this.extractionValidationMessage.set(containerValidationError);
            this.showExtractionValidationModal.set(true);
            return;
          }

          this.setActualExtractionError(rowIndex, null);
          
          if (billNo) row.get('BLNo')?.setValue(billNo);
          if (invoiceNumber) row.get('commercialInvoiceNo')?.setValue(invoiceNumber);
          
          // Bill data
          const shippedOnBoardRaw =
            billData.shipped_on_board_date ??
            billData.shipped_on_board ??
            billData.ship_on_board_date ??
            billData.ship_on_board ??
            billData.shipOnBoardDate ??
            (res as any).shipped_on_board_date ??
            (res as any).shipped_on_board ??
            (res as any).ship_on_board_date ??
            (res as any).ship_on_board ??
            null;
          if (shippedOnBoardRaw) row.get('shipOnBoardDate')?.setValue(new Date(shippedOnBoardRaw));
          if (billData.port_of_loading) row.get('portOfLoading')?.setValue(billData.port_of_loading);
          if (billData.port_of_discharge) row.get('portOfDischarge')?.setValue(billData.port_of_discharge);
          if (billData.number_of_containers != null) row.get('noOfContainers')?.setValue(billData.number_of_containers);
          if (billData.number_of_bags != null) row.get('noOfBags')?.setValue(billData.number_of_bags);
          if (billData.quantity_mt != null) row.get('quantityByMt')?.setValue(billData.quantity_mt);
          if (billData.shipping_line) row.get('shippingLine')?.setValue(billData.shipping_line);
          if (billData.free_detention_days != null) row.get('freeDetentionDays')?.setValue(billData.free_detention_days);
          if (billData.maximum_detention_days != null) row.get('maximumDetentionDays')?.setValue(billData.maximum_detention_days);
          if (typeof billData.freight_prepaid === 'boolean') row.get('freightPrepared')?.setValue(billData.freight_prepaid ? 'Yes' : 'No');
          
          row.get('billExtractionData')?.setValue(billData);
          
          // Extract brand from multiple possible locations in response
          const extractedBrand = 
            pkgData.brand || 
            billData.lineItems?.[0]?.brandName || 
            billData.brandName || 
            (res as any).brandName || 
            '';

          if (extractedBrand) {
            this.onPackagingBrandChange(extractedBrand, rowIndex);
          }

          // Packaging data
          row.get('packagingList')?.setValue(pkgData);
          if (Array.isArray(pkgData.container_info)) {
             row.get('extractedContainers')?.setValue(pkgData.container_info.map((c: any) => ({
                containerNo: c.container_number,
                pkgCt: c.no_of_bags
             })));
          } else if (Array.isArray(billData.containers)) {
             row.get('extractedContainers')?.setValue(billData.containers);
          }

          this.messageService.add({
            severity: 'success',
            summary: 'Details extracted',
            detail: 'Shipment and packaging details populated.'
          });
        }
      },
      error: (err: any) => {
        this.extractingBillNoRowIndex.set(null);
        this.stopExtractionExperience();
        this.messageService.add({
          severity: 'error',
          summary: 'Extraction failed',
          detail: err.error?.message ?? 'Could not extract details from documents.'
        });
      }
    });
  }

  /** Upload a document to extract bill number and autopopulate BL No for the given row. */
  onBillNoFileSelected(event: Event, rowIndex: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const allowedExt = /\.(pdf|jpg|jpeg|png|gif|webp)$/i;
    if (!allowedTypes.includes(file.type) && !allowedExt.test(file.name)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Invalid file',
        detail: 'Only PDF and image files (e.g. JPG, PNG) are allowed.'
      });
      input.value = '';
      return;
    }

    this.billDocumentFiles.update((current) => ({ ...current, [rowIndex]: file }));
    this.setActualExtractionError(rowIndex, null);
    input.value = '';
  }

  getBillDocumentFile(rowIndex: number): File | null {
    return this.billDocumentFiles()[rowIndex] ?? null;
  }

  getPackagingListFile(rowIndex: number): File | null {
    return this.packagingListFiles()[rowIndex] ?? null;
  }

  clearBillDocumentFile(rowIndex: number): void {
    this.billDocumentFiles.update((current) => ({ ...current, [rowIndex]: null }));
    this.setActualExtractionError(rowIndex, null);
  }

  clearPackagingListFile(rowIndex: number): void {
    this.packagingListFiles.update((current) => ({ ...current, [rowIndex]: null }));
    this.setActualExtractionError(rowIndex, null);
  }

  openLocalBillDocumentPreview(rowIndex: number): void {
    const file = this.getBillDocumentFile(rowIndex);
    if (!file) return;
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  openSavedBillDocumentPreview(rowIndex: number): void {
    const url = this.getSavedBillDocumentUrl(rowIndex);
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  getSavedBillDocumentUrl(index: number): string {
    return this.shipmentData()?.actual?.[index]?.blDocumentUrl || '';
  }

  getSavedBillDocumentName(index: number): string {
    return this.shipmentData()?.actual?.[index]?.blDocumentName || '';
  }

  openLocalPackagingListPreview(rowIndex: number): void {
    const file = this.getPackagingListFile(rowIndex);
    if (!file) return;
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  openSavedPackagingListPreview(rowIndex: number): void {
    const url = this.getSavedPackagingListUrl(rowIndex);
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  getSavedPackagingListUrl(index: number): string {
    return this.shipmentData()?.actual?.[index]?.packagingListDocumentUrl || '';
  }

  getSavedPackagingListName(index: number): string {
    return this.shipmentData()?.actual?.[index]?.packagingListDocumentName || '';
  }

  async confirmPlannedSubmission(): Promise<void> {
    if (this.plannedSplits.invalid) return;

    const shipmentData = this.shipmentData();
    if (!shipmentData) return;

    // Block save if scheduled MT exceeds total planned MT
    const totals = this.getPlannedTotals();
    const totalQtyMT = Number(shipmentData.shipment?.plannedQtyMT) || 0;
    if (totals.mt > totalQtyMT) {
      this.messageService.add({
        severity: 'error',
        summary: 'Cannot Save',
        detail: `Scheduled MT (${totals.mt}) exceeds Total MT (${totalQtyMT}). Please adjust the quantities before locking.`,
      });
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: 'Lock the scheduled ETA? This will submit to the server and cannot be undone.',
      header: 'Confirm Scheduled ETA',
      acceptLabel: 'Yes, Lock ETA',
      rejectLabel: 'Cancel',
      icon: 'pi pi-lock',
      severity: 'warning',
    });
    if (!confirmed) return;

    const targetNoOfShipments = Number(this.noOfShipmentsControl.value) || this.plannedSplits.length;
    const containers = this.plannedSplits.getRawValue().slice(0, targetNoOfShipments).map(c => ({
      ...c,
      etd: c.etd ? new Date(c.etd).toISOString().split('T')[0] : '',
      eta: c.eta ? new Date(c.eta).toISOString().split('T')[0] : '',
    }));
    const shipmentId = shipmentData.shipment._id || (shipmentData as any).shipment.id;

    if (!this.isPlannedLocked()) {
      this.store.dispatch(
        ShipmentActions.submitPlannedContainers({
          shipmentId,
          containers: containers,
          plannedQtyMT: shipmentData.shipment.plannedQtyMT || 0,
          noOfShipments: targetNoOfShipments,
          keepTab: this.isPlannedLocked(),
        })
      );
      this.editablePlannedRows.set([]);
      return;
    }

    this.localSubmittingPlanned.set(true);
    this.shipmentService.createPlannedContainers({
      shipmentId,
      plannedContainers: containers,
      noOfShipments: targetNoOfShipments,
    }).subscribe({
      next: (response: any) => {
        this.localSubmittingPlanned.set(false);
        this.patchPlannedRowsAfterSave(response?.containers || []);
        this.editablePlannedRows.set([]);
        this.messageService.add({
          severity: 'success',
          summary: 'Saved',
          detail: response?.message || 'Scheduled shipments updated successfully.',
        });
      },
      error: (error) => {
        this.localSubmittingPlanned.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.error?.message || 'Failed to save scheduled shipments.',
        });
      },
    });
  }

  getRowDiffs(entry: ScheduledHistoryEntry): HistoryDiffRow[] {
    const diffs: HistoryDiffRow[] = [];
    const before = entry.before || [];
    const after = entry.after || [];

    const maxLen = Math.max(before.length, after.length);

    for (let i = 0; i < maxLen; i++) {
        const bRow = before[i];
        const aRow = after[i];

        if (!bRow && aRow) {
            diffs.push({ index: i, shipmentId: this.getScheduledShipmentId(i), status: 'Added', changes: [] });
        } else if (bRow && !aRow) {
            diffs.push({ index: i, shipmentId: this.getScheduledShipmentId(i), status: 'Removed', changes: [] });
        } else if (bRow && aRow) {
            const rowChanges: HistoryDiffRow['changes'] = [];
            
            // Compare fields
            if (Number(bRow.qtyMT) !== Number(aRow.qtyMT)) {
                rowChanges.push({ field: 'Qty MT', before: bRow.qtyMT, after: aRow.qtyMT });
            }
            if (Number(bRow.FCL) !== Number(aRow.FCL)) {
                rowChanges.push({ field: 'FCL', before: bRow.FCL, after: aRow.FCL });
            }
            if (bRow.size !== aRow.size) {
                rowChanges.push({ field: 'Size', before: bRow.size, after: aRow.size });
            }
            
            const bEtd = this.stripTime(bRow.etd);
            const aEtd = this.stripTime(aRow.etd);
            if (bEtd !== aEtd) {
                rowChanges.push({ field: 'ETD', before: bEtd, after: aEtd });
            }

            const bEta = this.stripTime(bRow.eta);
            const aEta = this.stripTime(aRow.eta);
            if (bEta !== aEta) {
                rowChanges.push({ field: 'ETA', before: bEta, after: aEta });
            }

            if (rowChanges.length > 0) {
                diffs.push({ index: i, shipmentId: this.getScheduledShipmentId(i), status: 'Modified', changes: rowChanges });
            } else {
                diffs.push({ index: i, shipmentId: this.getScheduledShipmentId(i), status: 'Unchanged', changes: [] });
            }
        }
    }

    return diffs;
  }

  stripTime(val: any): string {
    if (!val) return '—';
    const date = val instanceof Date ? val : new Date(val);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatHistoryTimestamp(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  summarizeHistoryChange(entry: ScheduledHistoryEntry): string {
    const diffs = this.getRowDiffs(entry);
    const affectedIds = diffs
      .filter(d => d.status !== 'Unchanged')
      .map(d => d.shipmentId.split('/').pop())
      .filter(Boolean);

    const idList = affectedIds.length > 0 ? ` (${affectedIds.join(', ')})` : '';
    if (entry.action === 'ScheduledBaselineCreated') {
      return `ETA scheduled${idList}`;
    }
    return `ETA updated${idList}`;
  }

  async confirmActualSubmission(index: number): Promise<void> {
    const row = this.actualSplits.at(index);
    if (row.invalid) return;

    if (!this.isPlannedLocked()) return;

    const totalBagCapacity = this.getShipmentBagCapacity();
    const totalAssignedBags = this.getActualAssignedBagsTotal();

    if (totalBagCapacity > 0 && totalAssignedBags > totalBagCapacity) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Bag allocation exceeded',
        detail: `Assigned bags (${totalAssignedBags}) cannot be greater than shipment bag capacity (${totalBagCapacity}).`,
      });
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: `Finalize record for Container #${index + 1}? This cannot be undone.`,
      header: 'Submit Actual',
      acceptLabel: 'Yes, Submit',
      rejectLabel: 'Cancel',
    });
    if (!confirmed) return;

    const formValue = row.getRawValue();
    const containerId = formValue['containerId'];
    if (!containerId) return;

    const payload = new FormData();
    payload.append('actualSerialNo', this.getActualShipmentId(index));
    payload.append('commercialInvoiceNo', formValue['commercialInvoiceNo'] || '');
    payload.append('qtyMT', String(formValue['qtyMT'] || 0));
    payload.append('bags', String(formValue['bags'] || 0));
    payload.append('pallet', String(formValue['pallet'] || 0));
    payload.append('portOfLoading', formValue['portOfLoading'] || '');
    payload.append('portOfDischarge', formValue['portOfDischarge'] || '');
    payload.append('noOfContainers', String(formValue['noOfContainers'] || 0));
    payload.append('noOfBags', String(formValue['noOfBags'] || 0));
    payload.append('quantityByMt', String(formValue['quantityByMt'] || 0));
    payload.append('shippingLine', formValue['shippingLine'] || '');
    payload.append('freeDetentionDays', String(formValue['freeDetentionDays'] || 0));
    payload.append('maximumDetentionDays', String(formValue['maximumDetentionDays'] || 0));
    payload.append('freightPrepared', formValue['freightPrepared'] || 'No');
    payload.append('billExtractionData', JSON.stringify(formValue['billExtractionData'] || null));
    payload.append('extractedContainers', JSON.stringify(formValue['extractedContainers'] || []));
    payload.append('buyingUnit', 'MT');
    payload.append(
      'shipOnBoardDate',
      formValue['shipOnBoardDate'] ? new Date(formValue['shipOnBoardDate']).toISOString().split('T')[0] : ''
    );
    payload.append(
      'updatedETD',
      formValue['updatedETD'] ? new Date(formValue['updatedETD']).toISOString().split('T')[0] : ''
    );
    payload.append(
      'updatedETA',
      formValue['updatedETA'] ? new Date(formValue['updatedETA']).toISOString().split('T')[0] : ''
    );
    payload.append('BLNo', formValue['BLNo'] || '');

    const billDocument = this.getBillDocumentFile(index);
    
    // 🔥 VALIDATION: BL Document is required
    const existingBlDocumentUrl = this.shipmentData()?.actual?.[index]?.blDocumentUrl;
    if (!billDocument && !existingBlDocumentUrl) {
      this.messageService.add({
        severity: 'error',
        summary: 'BL Document Required',
        detail: 'Please upload the Bill of Lading (BL) document before submitting the actual container.',
      });
      return;
    }
    
    if (billDocument) {
      payload.append('blDocument', billDocument, billDocument.name);
    }

    const packagingListDocument = this.getPackagingListFile(index);
    if (packagingListDocument) {
      payload.append('packaging_list_document', packagingListDocument, packagingListDocument.name);
    }

    const packagingList = row.get('packagingList')?.value;
    if (packagingList) {
      payload.append('packagingList', JSON.stringify(packagingList));

      const rawProductionDate =
        packagingList.production_date ||
        packagingList.productionDate ||
        packagingList.packing_date ||
        packagingList.packingDate ||
        null;

      if (rawProductionDate) {
        const mmYyyyMatch = String(rawProductionDate).match(/^(\d{1,2})\/(\d{4})$/);
        if (mmYyyyMatch) {
          const parsedDate = new Date(Number(mmYyyyMatch[2]), Number(mmYyyyMatch[1]) - 1, 1);
          payload.append('packagingDate', parsedDate.toISOString().split('T')[0]);
        } else {
          const parsedDate = new Date(rawProductionDate);
          if (!isNaN(parsedDate.getTime())) {
            payload.append('packagingDate', parsedDate.toISOString().split('T')[0]);
          }
        }
      }
    }

    this.localSubmittingRowIndex.set(index);
    this.shipmentService.createActualContainer(containerId, payload).subscribe({
      next: (response: any) => {
        this.localSubmittingRowIndex.set(null);
        this.patchActualRowAfterSave(index, response);
        this.clearBillDocumentFile(index);
        this.clearPackagingListFile(index);
        this.setActualExtractionError(index, null);
        this.store.dispatch(ShipmentActions.submitActualSuccess({ index }));
        this.messageService.add({
          severity: 'success',
          summary: 'Saved',
          detail: response?.message || 'Actual container submitted successfully',
        });
      },
      error: (error) => {
        this.localSubmittingRowIndex.set(null);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.error?.message || 'Failed to submit actual container',
        });
      },
    });
  }

  // ─── Track Order Modal ────────────────────────────────────────────────────

  private readonly STAGE_ORDER = [
    'Shipment Entry',
    'Shipment Tracker',
    'BL Details',
    'Document Tracker',
    'Port and Customs Clearance Tracker',
    'Storage Allocation & Arrival',
    'Quality',
    'Payment & Costing',
  ] as const;

  openTrackOrderModal(rowIndex: number, group: FormGroup): void {
    const shipment = this.shipmentData()?.shipment as any;
    const actual = this.shipmentData()?.actual?.[rowIndex] as any;
    const planned = this.shipmentData()?.planned?.[rowIndex] as any;

    const formatDate = (value: unknown): string => {
      if (!value) return '—';
      const d = value instanceof Date ? value : new Date(value as string);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    this.trackOrderData.set({
      shipmentNo: this.getActualShipmentId(rowIndex),
      currentStage: this.getDisplayStageName(shipment?.currentStage || 'Shipment Entry'),
      shipmentStatus: this.getShipmentStatus(rowIndex),
      portOfLoading: actual?.portOfLoading || shipment?.portOfLoading || '',
      portOfDischarge: actual?.portOfDischarge || shipment?.portOfDischarge || '',
      etd: formatDate(actual?.updatedETD || planned?.etd || group.get('updatedETD')?.value),
      eta: formatDate(actual?.updatedETA || planned?.eta || group.get('updatedETA')?.value),
    });
    this.trackOrderModalVisible.set(true);
  }

  onTrackOrderModalVisibleChange(visible: boolean): void {
    this.trackOrderModalVisible.set(visible);
    if (!visible) this.trackOrderData.set(null);
  }

  getDisplayStageName(stage: string): string {
    return String(stage || '').trim() === 'Planned Split' ? 'Shipment Split' : String(stage || '');
  }

  getShipmentStatus(index: number): string {
    const shipment = this.shipmentData()?.shipment as any;
    const actual = this.shipmentData()?.actual?.[index] as any;
    const planned = this.shipmentData()?.planned?.[index] as any;
    return actual?.shipmentStatus || planned?.shipmentStatus || shipment?.shipmentStatus || getComputedShipmentStatus({
      shipmentCurrentStage: shipment?.currentStage,
      plannedRow: planned,
      actualRow: actual,
      fallbackStageLabel: this.getDisplayStageName(shipment?.currentStage || 'Shipment Entry'),
    });
  }

  getStatusBadgeClass(status: string): string {
    const severity: ShipmentStatusSeverity = getShipmentStatusSeverity(status);
    if (severity === 'success') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (severity === 'info') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (severity === 'secondary') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }

  /**
   * Returns 0–100 progress for the ship animation based on the current stage.
   * Stages map linearly from 0% (Shipment Entry) to 100% (Payment & Costing).
   */
  getShipProgress(currentStage: string): number {
    const index = this.STAGE_ORDER.indexOf(currentStage as any);
    if (index < 0) return 0;
    return Math.round((index / (this.STAGE_ORDER.length - 1)) * 100);
  }

  /** True when the shipment has reached or passed the Storage stage (ship has arrived). */
  isShipArrived(currentStage: string): boolean {
    const index = this.STAGE_ORDER.indexOf(currentStage as any);
    const storageIndex = this.STAGE_ORDER.indexOf('Storage Allocation & Arrival');
    return index >= storageIndex;
  }

  isStageCompleted(currentStage: string, stageIndex: number): boolean {
    const currentIndex = this.STAGE_ORDER.indexOf(currentStage as any);
    return stageIndex < currentIndex;
  }

  isCurrentStage(currentStage: string, stageIndex: number): boolean {
    return this.STAGE_ORDER[stageIndex] === currentStage;
  }
}
