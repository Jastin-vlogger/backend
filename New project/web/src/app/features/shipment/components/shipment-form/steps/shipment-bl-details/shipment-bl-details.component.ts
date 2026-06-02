import { Component, Input, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { ShipmentService } from '../../../../../../core/services/shipment.service';
import { WarehouseService } from '../../../../../../core/services/warehouse.service';
import { ConfirmDialogService } from '../../../../../../core/services/confirm-dialog.service';
import { AuthService } from '../../../../../../core/services/auth.service';
import { RbacService } from '../../../../../../core/services/rbac.service';
import * as ShipmentActions from '../../../../../../store/shipment/shipment.actions';
import { AccordionModule } from 'primeng/accordion';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TabsModule } from 'primeng/tabs';
import { DialogModule } from 'primeng/dialog';
import { ShipmentPaymentCostingComponent } from '../shipment-payment-costing/shipment-payment-costing.component';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { normalizeBlRole, normalizeBlVisibleTo, type BlVisibleRole } from '../../shared/bl-row-definitions';
import { downloadAdvanceRequestReportPdf } from '../../shared/advance-request-report';
import { getComputedShipmentStatus, getShipmentStatusSeverity, type ShipmentStatusSeverity } from '../../shared/shipment-status';
import {
  selectIsPlannedLocked,
  selectShipmentData,
  selectSubmittedActualIndices,
  selectSubmittedStep3Indices,
  selectSubmittedStep4Indices,
  selectSubmittedStep5Indices,
  selectSubmittedStep6Indices,
  selectSubmittedStep7Indices,
} from '../../../../../../store/shipment/shipment.selectors';

@Component({
  selector: 'app-shipment-bl-details',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AccordionModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectButtonModule,
    SelectModule,
    ToggleSwitchModule,
    TabsModule,
    DialogModule,
    ShipmentPaymentCostingComponent,
  ],
  templateUrl: './shipment-bl-details.component.html',
  styleUrl: './shipment-bl-details.component.scss',
})
export class ShipmentBlDetailsComponent {
  @Input({ required: true }) formArray!: FormArray;
  /** POINT 7: Payment Allocation + Payment Costing form array (moved from Step 8) */
  @Input() paymentFormArray: FormArray | null = null;

  private sanitizer = inject(DomSanitizer);
  private store = inject(Store);
  private shipmentService = inject(ShipmentService);
  private warehouseService = inject(WarehouseService);
  private notificationService = inject(NotificationService);
  private confirmDialog = inject(ConfirmDialogService);
  private authService = inject(AuthService);
  private rbacService = inject(RbacService);

  readonly shipmentData = toSignal(this.store.select(selectShipmentData));
  readonly isPlannedLocked = toSignal(this.store.select(selectIsPlannedLocked), { initialValue: false });
  readonly submittedActualIndices = toSignal(this.store.select(selectSubmittedActualIndices), { initialValue: [] });
  readonly submittedStep3Indices = toSignal(this.store.select(selectSubmittedStep3Indices), { initialValue: [] });
  readonly submittedStep4Indices = toSignal(this.store.select(selectSubmittedStep4Indices), { initialValue: [] });
  readonly submittedStep5Indices = toSignal(this.store.select(selectSubmittedStep5Indices), { initialValue: [] });
  readonly submittedStep6Indices = toSignal(this.store.select(selectSubmittedStep6Indices), { initialValue: [] });
  readonly submittedStep7Indices = toSignal(this.store.select(selectSubmittedStep7Indices), { initialValue: [] });

  readonly warehouseOptions = signal<Array<{ label: string; value: string }>>([]);
  readonly costSheetSearchTerm = signal<Record<number, string>>({});
  readonly editingCostSheet = signal<Record<number, boolean>>({});
  readonly activeTabs = signal<Record<number, 'cost' | 'storage' | 'packaging' | 'payment_allocation' | 'payment_costing'>>({});
  readonly expandedCostSheet = signal<Record<number, boolean>>({});
  readonly bookingFiles = signal<Record<number, File | null>>({});
  readonly costSheetAttachmentFiles = signal<Record<string, File | null>>({});
  readonly statusModalVisible = signal(false);
  readonly statusModalShipmentIndex = signal<number | null>(null);
  readonly savingKey = signal<string | null>(null);
  readonly actualOverrides = signal<Record<number, any>>({});
  readonly storageValidationModalVisible = signal(false);
  readonly storageValidationMessage = signal('');
  readonly storageValidationDetails = signal<Array<{ storage: string; packaging: string }>>([]);

  // POINT 8: Track open accordion panels so they stay open after save
  readonly activeAccordionValues = signal<string[]>([]);
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

  showPreviewModal = signal(false);
  previewUrl = signal<string | null>(null);
  previewTitle = signal('');
  previewIsImage = signal(false);
  previewZoom = signal(1);
  previewTransformOrigin = signal('center center');
  previewSafeUrl = computed(() => {
    const url = this.previewUrl();
    if (!url || this.previewIsImage()) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  constructor() {
    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        const activeWarehouses = warehouses
          .filter((warehouse) => warehouse.status === 'Active')
          .map((warehouse) => {
            const codeSuffix = warehouse.code ? ` - ${warehouse.code}` : '';
            const label = `${warehouse.name}${codeSuffix}`;
            return { label, value: label };
          });
        this.warehouseOptions.set(activeWarehouses);
      },
    });

    effect(() => {
      this.formArray?.controls.forEach((_, index) => {
        const currentTab = this.activeTabs()[index];
        const defaultTab = this.getDefaultVisibleTab();
        if (!currentTab) {
          this.activeTabs.update((current) => ({ ...current, [index]: defaultTab }));
        } else if (!this.canViewBlTab(currentTab)) {
          this.activeTabs.update((current) => ({ ...current, [index]: defaultTab }));
        }
        if (this.expandedCostSheet()[index] == null) {
          this.expandedCostSheet.update((current) => ({ ...current, [index]: false }));
        }
      });
    });
  }

  isCostSheetSaved(index: number): boolean {
    const shipment = this.getActualShipment(index);
    if (!shipment) return false;
    const rows = shipment.costSheetBookings || [];
    return rows.some((entry: any) =>
      Number(entry?.requestAmount || 0) > 0 ||
      String(entry?.remarks || '').trim().length > 0 ||
      String(entry?.attachmentDocumentUrl || '').trim().length > 0
    );
  }

  isCostSheetEditing(index: number): boolean {
    if (this.editingCostSheet()[index]) return true;
    return !this.isCostSheetSaved(index);
  }

  enableCostSheetEdit(index: number): void {
    if (!this.canEditClearingAdvance()) return;
    this.editingCostSheet.update((current) => ({ ...current, [index]: true }));
  }

  cancelCostSheetEdit(index: number): void {
    if (!this.canEditClearingAdvance()) return;
    this.editingCostSheet.update((current) => ({ ...current, [index]: false }));
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (shipmentId) {
      this.store.dispatch(ShipmentActions.loadShipmentDetail({ id: shipmentId }));
    }
  }

  recalculateCostSheetRequestAmount(row: AbstractControl): void {
    const qty = Number(row.get('defaultQty')?.value) || 0;
    const rate = Number(row.get('defaultRate')?.value) || 0;
    row.get('requestAmount')?.setValue(Number((qty * rate).toFixed(2)), { emitEvent: false });
  }

  /** POINT 8: Ensure accordion panel stays open after save */
  private ensureAccordionOpen(index: number): void {
    const panelValue = `bl-${index}`;
    const current = this.activeAccordionValues();
    if (!current.includes(panelValue)) {
      this.activeAccordionValues.set([...current, panelValue]);
    }
  }

  private applyActualOverride(index: number, actual: any): void {
    if (!actual) return;
    this.actualOverrides.update((current) => ({ ...current, [index]: actual }));
  }

  private patchCostSheetFromActual(index: number, actual: any): void {
    const row = this.formArray.at(index);
    if (!row || !actual) return;

    row.patchValue({
      costSheetBookingDocumentUrl: actual.costSheetBookingDocumentUrl || '',
      costSheetBookingDocumentName: actual.costSheetBookingDocumentName || '',
    }, { emitEvent: false });

    const rows = this.getCostSheetRows(row);
    const actualRows = Array.isArray(actual.costSheetBookings) ? actual.costSheetBookings : [];
    rows.controls.forEach((control, rowIndex) => {
      const saved = actualRows[rowIndex];
      if (!saved) return;
      control.patchValue({
        sn: Number(saved.sn) || rowIndex + 1,
        description: control.get('description')?.value || saved.description || '',
        visibleTo: normalizeBlVisibleTo(control.get('visibleTo')?.value ?? ['logistic', 'fas']),
        defaultQty: Number(saved.defaultQty ?? control.get('defaultQty')?.value ?? 1),
        defaultRate: Number(saved.defaultRate ?? control.get('defaultRate')?.value ?? 0),
        requestAmount: Number(saved.requestAmount ?? 0),
        remarks: saved.remarks ?? '',
        attachmentDocumentUrl: saved.attachmentDocumentUrl || '',
        attachmentDocumentName: saved.attachmentDocumentName || '',
      }, { emitEvent: false });
    });
  }

  private patchStorageAllocationsFromActual(index: number, actual: any): void {
    const row = this.formArray.at(index);
    if (!row || !actual) return;

    const rows = this.getStorageRows(row);
    const actualRows = Array.isArray(actual.storageAllocations) ? actual.storageAllocations : [];
    rows.controls.forEach((control, rowIndex) => {
      const saved = actualRows[rowIndex];
      if (!saved) return;
      control.patchValue({
        sn: Number(saved.sn) || rowIndex + 1,
        containerSerialNo: saved.containerSerialNo || '',
        bags: Number(saved.bags ?? 0),
        warehouse: saved.warehouse || '',
        storageAvailability: Number(saved.storageAvailability ?? 0),
      }, { emitEvent: false });
    });
  }

  setCostSheetSearchTerm(index: number, term: string): void {
    this.costSheetSearchTerm.update((current) => ({ ...current, [index]: term }));
  }

  getShipmentNoLabel(index: number): string {
    if (this.formArray?.controls[index] == null) return '–';
    const base = this.shipmentData()?.shipment?.shipmentNo?.replace(/\([^)]*\)/g, '').trim();
    return base?.trim() ? `${base}-${index + 1}` : '–';
  }

  setActiveTab(index: number, tab: 'cost' | 'storage' | 'packaging' | 'payment_allocation' | 'payment_costing'): void {
    if (!this.canViewBlTab(tab)) return;
    this.activeTabs.update((current) => ({ ...current, [index]: tab }));
  }

  getActiveTab(index: number): 'cost' | 'storage' | 'packaging' | 'payment_allocation' | 'payment_costing' {
    const tab = this.activeTabs()[index];
    if (tab && this.canViewBlTab(tab)) return tab;
    return this.getDefaultVisibleTab();
  }

  private getDefaultVisibleTab(): 'cost' | 'storage' | 'packaging' | 'payment_allocation' | 'payment_costing' {
    const tabs: Array<'cost' | 'storage' | 'packaging' | 'payment_allocation' | 'payment_costing'> = [
      'cost',
      'storage',
      'packaging',
      'payment_allocation',
      'payment_costing',
    ];
    return tabs.find((tab) => this.canViewBlTab(tab)) ?? 'cost';
  }

  canViewClearingAdvance(): boolean {
    if (this.authService.isAdminLevelRole()) return true;
    return this.rbacService.hasPermission('shipment.tab.bl_details.clearing_advance.view');
  }

  canEditClearingAdvance(index?: number): boolean {
    if (index != null && this.isClearingAdvanceApproved(index)) return false;
    if (this.authService.isAdminLevelRole()) return true;
    return this.canViewClearingAdvance() && this.rbacService.hasPermission('shipment.tab.bl_details.clearing_advance.edit');
  }

  canViewStorageAllocations(): boolean {
    if (this.authService.isAdminLevelRole()) return true;
    return this.rbacService.hasPermission('shipment.tab.bl_details.storage_allocations.view');
  }

  canEditStorageAllocations(index?: number): boolean {
    if (index != null && this.isStorageAllocationsApproved(index)) return false;
    if (this.authService.isAdminLevelRole()) return true;
    return this.canViewStorageAllocations() && this.rbacService.hasPermission('shipment.tab.bl_details.storage_allocations.edit');
  }

  canViewPackagingList(): boolean {
    if (this.authService.isAdminLevelRole()) return true;
    return this.rbacService.hasPermission('shipment.tab.bl_details.packaging_list.view');
  }

  canEditPackagingList(): boolean {
    if (this.authService.isAdminLevelRole()) return true;
    return this.canViewPackagingList() && this.rbacService.hasPermission('shipment.tab.bl_details.packaging_list.edit');
  }

  /** Returns true if the current user can see the Payment Allocation tab */
  canViewPaymentAllocation(): boolean {
    if (this.authService.isAdminLevelRole()) return true;
    return this.rbacService.hasPermission('shipment.tab.payment_costing.payment_allocation.view');
  }

  canEditPaymentAllocation(): boolean {
    if (this.authService.isAdminLevelRole()) return true;
    return this.canViewPaymentAllocation() && this.rbacService.hasPermission('shipment.tab.payment_costing.payment_allocation.edit');
  }

  /** Returns true if the current user can see the Payment Costing tab */
  canViewPaymentCosting(): boolean {
    if (this.authService.isAdminLevelRole()) return true;
    return this.rbacService.hasPermission('shipment.tab.payment_costing.costing_table.view');
  }

  canEditPaymentCosting(index?: number): boolean {
    if (index != null && this.isPaymentCostingApproved(index)) return false;
    if (this.authService.isAdminLevelRole()) return true;
    return this.canViewPaymentCosting() && this.rbacService.hasPermission('shipment.tab.payment_costing.costing_table.edit');
  }

  canEditBlDetails(): boolean {
    if (this.authService.isAdminLevelRole()) return true;
    return this.rbacService.hasPermission('shipment.tab.bl_details.edit');
  }

  canViewBlTab(tab: 'cost' | 'storage' | 'packaging' | 'payment_allocation' | 'payment_costing'): boolean {
    switch (tab) {
      case 'cost':
        return this.canViewClearingAdvance();
      case 'storage':
        return this.canViewStorageAllocations();
      case 'packaging':
        return this.canViewPackagingList();
      case 'payment_allocation':
        return this.canViewPaymentAllocation();
      case 'payment_costing':
        return this.canViewPaymentCosting();
    }
  }

  private getActualShipment(index: number): any {
    return this.actualOverrides()[index] || this.shipmentData()?.actual?.[index] || null;
  }

  private getEffectiveClearingAdvanceStatus(index: number): 'draft' | 'pending_fas' | 'pending_fas_manager' | 'approved' {
    const actual = this.getActualShipment(index);
    const rawStatus = actual?.clearingAdvanceApproval?.status || 'draft';
    if (rawStatus === 'pending_fas_manager') return 'approved';
    if (rawStatus !== 'draft') return rawStatus;
    const rows = actual?.costSheetBookings || [];
    const hasSavedData = Array.isArray(rows) && rows.some((entry: any) =>
      Number(entry?.requestAmount || 0) > 0 ||
      String(entry?.remarks || '').trim().length > 0 ||
      String(entry?.attachmentDocumentUrl || '').trim().length > 0
    );
    return hasSavedData ? 'pending_fas' : 'draft';
  }

  private getEffectivePaymentCostingStatus(index: number): 'draft' | 'pending_fas_manager' | 'approved' {
    const actual = this.getActualShipment(index);
    const rawStatus = actual?.paymentCostingApproval?.status || 'draft';
    if (rawStatus !== 'draft') return rawStatus;
    const rows = actual?.paymentCostings || [];
    const hasSavedData = Array.isArray(rows) && rows.some((entry: any) =>
      String(entry?.refBillNo || '').trim().length > 0 ||
      String(entry?.refBillVendor || '').trim().length > 0 ||
      !!entry?.refBillDate
    );
    return hasSavedData ? 'pending_fas_manager' : 'draft';
  }

  private getEffectiveStorageAllocationStatus(index: number): 'draft' | 'pending_warehouse_manager' | 'approved' {
    const actual = this.getActualShipment(index);
    const rawStatus = actual?.storageAllocationApproval?.status || 'draft';
    if (rawStatus !== 'draft') return rawStatus;
    const rows = actual?.storageAllocations || [];
    const hasSavedData = Array.isArray(rows) && rows.some((entry: any) =>
      String(entry?.containerSerialNo || '').trim().length > 0 ||
      Number(entry?.bags || 0) > 0 ||
      String(entry?.warehouse || '').trim().length > 0
    );
    return hasSavedData ? 'pending_warehouse_manager' : 'draft';
  }

  isClearingAdvanceApproved(index: number): boolean {
    return this.getEffectiveClearingAdvanceStatus(index) === 'approved';
  }

  isPaymentCostingApproved(index: number): boolean {
    return this.getEffectivePaymentCostingStatus(index) === 'approved';
  }

  isStorageAllocationsApproved(index: number): boolean {
    return this.getEffectiveStorageAllocationStatus(index) === 'approved';
  }

  getClearingAdvanceApproval(index: number): any {
    return this.getActualShipment(index)?.clearingAdvanceApproval || { status: 'draft' };
  }

  getPaymentCostingApproval(index: number): any {
    return this.getActualShipment(index)?.paymentCostingApproval || { status: 'draft' };
  }

  getStorageAllocationApproval(index: number): any {
    return this.getActualShipment(index)?.storageAllocationApproval || { status: 'draft' };
  }

  getClearingAdvanceApprovalLabel(index: number): string {
    const status = this.getEffectiveClearingAdvanceStatus(index);
    switch (status) {
      case 'pending_fas':
        return 'Pending FAS Approval';
      case 'approved':
        return 'Approved by FAS';
      default:
        return 'Draft';
    }
  }

  getPaymentCostingApprovalLabel(index: number): string {
    const status = this.getEffectivePaymentCostingStatus(index);
    switch (status) {
      case 'pending_fas_manager':
        return 'Pending FAS Manager Approval';
      case 'approved':
        return 'Approved';
      default:
        return 'Draft';
    }
  }

  getStorageAllocationApprovalLabel(index: number): string {
    const status = this.getEffectiveStorageAllocationStatus(index);
    switch (status) {
      case 'pending_warehouse_manager':
        return 'Pending Warehouse Manager Approval';
      case 'approved':
        return 'Approved';
      default:
        return 'Draft';
    }
  }

  getApprovalBadgeClasses(label: string): string {
    if (label === 'Approved' || label === 'Approved by FAS') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    if (label.includes('Pending')) {
      return 'border-amber-200 bg-amber-50 text-amber-700';
    }
    return 'border-slate-200 bg-slate-50 text-slate-600';
  }

  private isFasRole(): boolean {
    return (this.authService.getCurrentUser()?.role || '') === 'FAS';
  }

  private getCurrentBlVisibleRole(): BlVisibleRole | null {
    return normalizeBlRole(this.authService.getCurrentUser()?.role);
  }

  private canCurrentUserSeeBlRow(row: AbstractControl | any): boolean {
    if (this.authService.isAdminLevelRole()) return true;
    const role = this.getCurrentBlVisibleRole();
    if (!role) return true;
    const visibleTo = row instanceof AbstractControl ? row.get('visibleTo')?.value : row?.visibleTo;
    if (!Array.isArray(visibleTo) || visibleTo.length === 0) return true;
    return visibleTo.includes(role);
  }

  private isFasManagerRole(): boolean {
    const role = this.authService.getCurrentUser()?.role || '';
    return role === 'FasManager' || role === 'Fas manager';
  }

  private isWarehouseManagerRole(): boolean {
    const role = this.authService.getCurrentUser()?.role || '';
    return role === 'warehouse' || role === 'Warehouse' || role === 'Warehouse manager';
  }

  canApproveClearingAdvance(index: number): boolean {
    const status = this.getEffectiveClearingAdvanceStatus(index);
    if (status === 'pending_fas') {
      return this.authService.isAdminLevelRole() || this.isFasRole() || this.isFasManagerRole();
    }
    return false;
  }

  canApprovePaymentCosting(index: number): boolean {
    const status = this.getEffectivePaymentCostingStatus(index);
    return status === 'pending_fas_manager' && (
      this.authService.isAdminLevelRole() ||
      this.isFasManagerRole()
    );
  }

  canApproveStorageAllocations(index: number): boolean {
    const status = this.getEffectiveStorageAllocationStatus(index);
    return status === 'pending_warehouse_manager' && (
      this.authService.isAdminLevelRole() ||
      this.isWarehouseManagerRole()
    );
  }

  isPaymentAllocationUnlocked(index: number): boolean {
    return this.getEffectiveClearingAdvanceStatus(index) === 'approved';
  }

  getPaymentAllocationWaitingMessage(index: number): string {
    const status = this.getEffectiveClearingAdvanceStatus(index);
    if (status === 'pending_fas_manager') return 'Waiting for FAS manager approval';
    return 'Waiting for FAS approval';
  }

  getCostSheetRows(group: AbstractControl): FormArray {
    return group.get('costSheetBookings') as FormArray;
  }

  getStorageRows(group: AbstractControl): FormArray {
    return group.get('storageAllocations') as FormArray;
  }

  private normalizeContainerNumber(value: unknown): string {
    return String(value ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }

  private isCloseContainerMismatch(left: string, right: string): boolean {
    if (!left || !right || left === right || left.length !== right.length) {
      return false;
    }

    let diffCount = 0;
    for (let index = 0; index < left.length; index++) {
      if (left[index] !== right[index]) {
        diffCount += 1;
        if (diffCount > 1) return false;
      }
    }

    return diffCount === 1;
  }

  private getPackagingContainerEntries(group: AbstractControl): Array<{ raw: string; normalized: string }> {
    const packagingList = group.get('packagingList')?.value;
    const containerInfo =
      packagingList?.containerInfo ||
      packagingList?.container_info ||
      [];
    const containerNumberList = packagingList?.container_number_list || [];
    const extractedContainers = group.get('extractedContainers')?.value || [];

    const entrySource = Array.isArray(containerInfo) && containerInfo.length
      ? containerInfo
      : Array.isArray(containerNumberList) && containerNumberList.length
        ? containerNumberList
        : extractedContainers;

    return entrySource
      .map((entry: any) => {
        const raw = typeof entry === 'string'
          ? entry.trim()
          : String(
              entry?.container_number ||
              entry?.containerNo ||
              entry?.container_no ||
              entry?.containerNumber ||
              ''
            ).trim();
        return { raw, normalized: this.normalizeContainerNumber(raw) };
      })
      .filter((entry: { raw: string; normalized: string }) => !!entry.normalized);
  }

  private getStorageContainerEntries(group: AbstractControl): Array<{ raw: string; normalized: string }> {
    return this.getStorageRows(group)
      .getRawValue()
      .map((entry: any) => {
        const raw = String(entry?.containerSerialNo || '').trim();
        return { raw, normalized: this.normalizeContainerNumber(raw) };
      })
      .filter((entry: { raw: string; normalized: string }) => !!entry.normalized);
  }

  private getStorageContainerValidationState(group: AbstractControl): {
    valid: boolean;
    message: string;
    mismatches: Array<{ storage: string; packaging: string }>;
    warnings: Array<{ storage: string; packaging: string }>;
  } {
    const packagingEntries = this.getPackagingContainerEntries(group);
    const storageEntries = this.getStorageContainerEntries(group);

    if (!packagingEntries.length || !storageEntries.length) {
      return {
        valid: false,
        message: 'Container names are required in both Packaging List and Storage Allocations before saving.',
        mismatches: [],
        warnings: [],
      };
    }

    if (packagingEntries.length !== storageEntries.length) {
      return {
        valid: false,
        message: `Container count mismatch: Packaging List has ${packagingEntries.length}, while Storage Allocations has ${storageEntries.length}. Please update the container rows before saving.`,
        mismatches: [],
        warnings: [],
      };
    }

    const mismatches: Array<{ storage: string; packaging: string }> = [];
    const warnings: Array<{ storage: string; packaging: string }> = [];

    for (let index = 0; index < packagingEntries.length; index++) {
      const packagingEntry = packagingEntries[index];
      const storageEntry = storageEntries[index];

      if (packagingEntry.normalized === storageEntry.normalized) {
        continue;
      }

      const mismatch = {
        storage: storageEntry.raw || '—',
        packaging: packagingEntry.raw || '—',
      };

      mismatches.push(mismatch);

      if (this.isCloseContainerMismatch(storageEntry.normalized, packagingEntry.normalized)) {
        warnings.push(mismatch);
      }
    }

    if (!mismatches.length) {
      return { valid: true, message: '', mismatches: [], warnings: [] };
    }

    return {
      valid: false,
      message: 'Storage Allocation container names do not match the Packaging List. Please update the container names before saving.',
      mismatches,
      warnings,
    };
  }

  getStorageCloseMismatchWarnings(group: AbstractControl): Array<{ storage: string; packaging: string }> {
    return this.getStorageContainerValidationState(group).warnings;
  }

  getStorageContainerMismatches(group: AbstractControl): Array<{ storage: string; packaging: string }> {
    return this.getStorageContainerValidationState(group).mismatches;
  }

  getStorageRowMismatch(
    group: AbstractControl,
    rowIndex: number
  ): { storage: string; packaging: string } | null {
    return this.getStorageContainerValidationState(group).mismatches[rowIndex] ?? null;
  }

  private validateStorageAllocationContainers(group: AbstractControl): {
    valid: boolean;
    message: string;
    mismatches: Array<{ storage: string; packaging: string }>;
  } {
    const state = this.getStorageContainerValidationState(group);
    return {
      valid: state.valid,
      message: state.message,
      mismatches: state.mismatches,
    };
  }

  closeStorageValidationModal(): void {
    this.storageValidationModalVisible.set(false);
    this.storageValidationMessage.set('');
    this.storageValidationDetails.set([]);
  }

  getVisibleCostSheetRows(group: AbstractControl, shipmentIndex: number): Array<{ control: AbstractControl; index: number }> {
    const rows = this.getCostSheetRows(group).controls
      .map((control, index) => ({ control, index }))
      .filter(({ control }) => this.canCurrentUserSeeBlRow(control));
    const term = String(this.costSheetSearchTerm()[shipmentIndex] || '').trim().toLowerCase();
    const filteredRows = term
      ? rows.filter(({ control }) => String(control.get('description')?.value || '').toLowerCase().includes(term))
      : rows;
    return this.expandedCostSheet()[shipmentIndex] ? filteredRows : filteredRows.slice(0, 5);
  }

  hasHiddenCostSheetRows(group: AbstractControl, shipmentIndex: number): boolean {
    const term = String(this.costSheetSearchTerm()[shipmentIndex] || '').trim().toLowerCase();
    const total = term
      ? this.getCostSheetRows(group).controls.filter((row) =>
          this.canCurrentUserSeeBlRow(row) &&
          String(row.get('description')?.value || '').toLowerCase().includes(term)
        ).length
      : this.getCostSheetRows(group).controls.filter((row) => this.canCurrentUserSeeBlRow(row)).length;
    return !this.expandedCostSheet()[shipmentIndex] && total > 5;
  }

  toggleCostSheetRows(shipmentIndex: number): void {
    this.expandedCostSheet.update((current) => ({
      ...current,
      [shipmentIndex]: !current[shipmentIndex],
    }));
  }

  onBookingFileSelected(event: Event, shipmentIndex: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    this.bookingFiles.update((current) => ({ ...current, [shipmentIndex]: file }));
    input.value = '';
  }

  getBookingFile(shipmentIndex: number): File | null {
    return this.bookingFiles()[shipmentIndex] ?? null;
  }

  clearBookingFile(shipmentIndex: number): void {
    this.bookingFiles.update((current) => ({ ...current, [shipmentIndex]: null }));
  }

  private costSheetAttachmentKey(shipmentIndex: number, rowIndex: number): string {
    return `${shipmentIndex}:${rowIndex}`;
  }

  onCostSheetAttachmentSelected(event: Event, shipmentIndex: number, rowIndex: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    this.costSheetAttachmentFiles.update((current) => ({
      ...current,
      [this.costSheetAttachmentKey(shipmentIndex, rowIndex)]: file,
    }));
    input.value = '';
  }

  getCostSheetAttachmentFile(shipmentIndex: number, rowIndex: number): File | null {
    return this.costSheetAttachmentFiles()[this.costSheetAttachmentKey(shipmentIndex, rowIndex)] ?? null;
  }

  clearCostSheetAttachmentFile(shipmentIndex: number, rowIndex: number): void {
    this.costSheetAttachmentFiles.update((current) => ({
      ...current,
      [this.costSheetAttachmentKey(shipmentIndex, rowIndex)]: null,
    }));
  }

  getSavedBookingUrl(group: AbstractControl): string {
    return group.get('costSheetBookingDocumentUrl')?.value || '';
  }

  getSavedBookingName(group: AbstractControl): string {
    return group.get('costSheetBookingDocumentName')?.value || '';
  }

  getSavedBlDocumentUrl(group: AbstractControl): string {
    return group.get('blDocumentUrl')?.value || '';
  }

  getSavedBlDocumentName(group: AbstractControl): string {
    return group.get('blDocumentName')?.value || '';
  }

  private formatCurrency(value: unknown): string {
    return Number(value ?? 0).toFixed(2);
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatDateForReport(value: unknown): string {
    if (!value) return '—';
    const date = new Date(value as string | Date);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  private downloadCostingSheetPdf(config: {
    shipmentNo: string;
    date: string;
    csNo: string;
    vendor: string;
    country: string;
    invoiceAmountFC: string;
    exchangeRate: string;
    invoiceAmountAED: string;
    incoTerms: string;
    paymentTerms: string;
    comInv: string;
    profNo: string;
    murabahaNo: string;
    shipmentNo2: string;
    shippingLine: string;
    blNo: string;
    noOfContainers: string;
    loadingPort: string;
    despatchPort: string;
    arrivedAtPort: string;
    arrivedAtWH: string;
    noOfDaysAtPort: string;
    grvNo: string;
    decNo: string;
    decValue: string;
    downloadedBy: string;
    costRows: Array<{ sn: number | string; description: string; requestAmount: string; actualCostDH: string; billRef: string; remarks: string }>;
    itemRows: Array<{
      slNo: number | string; item: string; packing: string; qty: string; uom: string;
      unitCostFC: string; unitCostDH: string; totalCostFC: string; totalCostDH: string;
      allocationFactor: string; expensesAllocated: string; totalValueWithExpenses: string; landedCostPerUnit: string;
    }>;
  }): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 28;
    const CW = pageW - M * 2;
    const fmtN = (v: unknown) => this.formatCurrency(v);

    // ── HEADER ───────────────────────────────────────────────────────────────
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('ROYAL HORIZON GENERAL TRADING', M, 22);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('COSTING SHEET', M, 31);

    const bW = 120, bH = 22, bX = pageW - M - bW, bY = 14;
    doc.setDrawColor(0); doc.setLineWidth(0.4);
    doc.rect(bX, bY, bW, bH);
    doc.line(bX, bY + 11, bX + bW, bY + 11);
    doc.line(bX + 38, bY, bX + 38, bY + bH);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    doc.text('Date', bX + 3, bY + 8);
    doc.text('C.S No.', bX + 3, bY + 19);
    doc.setFont('helvetica', 'normal');
    doc.text(config.date, bX + 42, bY + 8);
    doc.text(config.csNo, bX + 42, bY + 19);

    // ── IMPORT DETAILS TABLE ─────────────────────────────────────────────────
    const leftFields: [string, string][] = [
      ['Vendor', config.vendor], ['Country', config.country],
      ['Invoice Amount FC', config.invoiceAmountFC], ['Exchange Rate', config.exchangeRate],
      ['Invoice Amount AED', config.invoiceAmountAED], ['Inco Terms', config.incoTerms],
      ['Payment Terms', config.paymentTerms], ['Com Inv', config.comInv],
      ['Prof No', config.profNo], ['Murabaha/TT No', config.murabahaNo],
    ];
    const rightFields: [string, string][] = [
      ['Shipment No', config.shipmentNo2], ['Shipping Line', config.shippingLine],
      ['BL No', config.blNo], ['No of Containers', config.noOfContainers],
      ['Loading Port', config.loadingPort], ['Despatch Port', config.despatchPort],
      ['Arrived at Port', config.arrivedAtPort], ['Arrived at WH', config.arrivedAtWH],
      ['No of Days at Port', config.noOfDaysAtPort], ['GRV No', config.grvNo],
      ['Dec No', config.decNo], ['Dec Value', config.decValue],
    ];
    const nRows = Math.max(leftFields.length, rightFields.length);
    const importBody: any[][] = [];
    for (let i = 0; i < nRows; i++) {
      importBody.push([
        leftFields[i]?.[0] ?? '', leftFields[i]?.[1] ?? '',
        rightFields[i]?.[0] ?? '', rightFields[i]?.[1] ?? '',
      ]);
    }

    autoTable(doc, {
      startY: 36,
      body: importBody,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 }, lineColor: [180, 180, 180], lineWidth: 0.2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: CW * 0.13, fillColor: [245, 247, 250] },
        1: { cellWidth: CW * 0.24 },
        2: { fontStyle: 'bold', cellWidth: CW * 0.13, fillColor: [245, 247, 250] },
        3: { cellWidth: 'auto' },
      },
      margin: { left: M, right: M },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.4,
    });

    let y = (doc as any).lastAutoTable.finalY + 6;

    // ── COST BREAKDOWN + CUSTOM VALUE (side by side) ─────────────────────────
    const costTotal = config.costRows.reduce((s, r) => s + (Number(r.actualCostDH) || 0), 0);
    const costBody: any[][] = config.costRows.map((r) => [
      r.sn, r.description, r.actualCostDH ? fmtN(r.actualCostDH) : '', r.billRef || '', r.remarks || '',
    ]);
    costBody.push(['', 'TOTAL', fmtN(costTotal), '', '']);

    const customBody: any[][] = config.costRows.map((r) => {
      const dh = Number(r.actualCostDH) || 0;
      const vat = dh * 0.05;
      return [vat ? fmtN(vat) : '', '', '', vat ? fmtN(vat) : ''];
    });
    const totalVat = config.costRows.reduce((s, r) => s + (Number(r.actualCostDH) || 0) * 0.05, 0);
    customBody.push([fmtN(totalVat), '', '', fmtN(totalVat)]);

    const costTW = CW * 0.555;
    const custTW = CW - costTW - 4;
    const custX = M + costTW + 4;

    doc.setFontSize(6); doc.setFont('helvetica', 'bold');
    doc.text('CUSTOM VALUE TAKEN WITHOUT DISCOUNT', custX + 2, y + 5);
    y += 7;

    autoTable(doc, {
      startY: y,
      head: [['Sn', 'Description', 'Cost DH', 'Bill Ref.', 'Payment Ref./Remarks']],
      body: costBody,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', fontSize: 6.5, lineColor: [0, 0, 0], lineWidth: 0.3 },
      columnStyles: {
        0: { cellWidth: 18, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { halign: 'right', cellWidth: 58 },
        3: { cellWidth: 52 },
        4: { cellWidth: 68 },
      },
      didParseCell: (data: any) => {
        if (data.row.index === costBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
      tableWidth: costTW,
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.4,
      margin: { left: M, right: M + custTW + 4 },
    });

    const costFinalY = (doc as any).lastAutoTable.finalY;

    const customBody2: any[][] = config.costRows.map((r) => {
      const dh = Number(r.actualCostDH) || 0;
      const paidRH = dh; // Paid WD Vat For RH = Costed DH
      const totalPaid = paidRH; // Total Paid Frm Adv = Paid WD Vat For RH + 0
      return [
        '',                          // VAT Applied RH — blank
        paidRH ? fmtN(paidRH) : '', // Paid WD Vat For RH = Costed DH
        '',                          // Paid WD Vat For Supplier AC — blank
        totalPaid ? fmtN(totalPaid) : '', // Total Paid Frm Adv
      ];
    });
    const totPaidRH2 = config.costRows.reduce((s, r) => s + (Number(r.actualCostDH) || 0), 0);
    customBody2.push(['', fmtN(totPaidRH2), '', fmtN(totPaidRH2)]);

    autoTable(doc, {
      startY: y,
      head: [['Vat Applied\nRH', 'Paid WD Vat\nFor RH', 'Paid WD Vat\nFor Supplier Ac', 'Totl Paid\nFrm Adv']],
      body: customBody2,
      theme: 'grid',
      styles: { fontSize: 6, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, halign: 'right', lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', fontSize: 6, lineColor: [0, 0, 0], lineWidth: 0.3 },
      columnStyles: {
        0: { halign: 'right', cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 'auto' },
        2: { halign: 'right', cellWidth: 'auto' },
        3: { halign: 'right', cellWidth: 'auto' },
      },
      didParseCell: (data: any) => {
        if (data.row.index === customBody2.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
      tableWidth: custTW,
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.4,
      margin: { left: custX, right: M },
    });

    y = Math.max(costFinalY, (doc as any).lastAutoTable.finalY) + 6;

    // ── ITEM COSTING TABLE ───────────────────────────────────────────────────
    if (y > pageH - 90) { doc.addPage(); y = M; }

    const exRate = Number(config.exchangeRate) || 3.67;
    const totalCostDHSum = config.itemRows.reduce((s, r) => s + (Number(r.totalCostDH) || 0), 0);
    const totalCostFCSum = config.itemRows.reduce((s, r) => s + (Number(r.totalCostFC) || 0), 0);
    const totalExpAllocated = config.itemRows.reduce((s, r) => s + (Number(r.expensesAllocated) || 0), 0);
    const grandTotalValue = config.itemRows.reduce((s, r) => s + (Number(r.totalValueWithExpenses) || 0), 0);
    const totalQty = config.itemRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);

    const itemBody: any[][] = config.itemRows.map((r) => {
      const unitFC = Number(r.unitCostFC) || 0;
      const unitDH = unitFC * exRate;
      const qty = Number(r.qty) || 0;
      const totFC = unitFC * qty;
      const totDH = unitDH * qty;
      const allocFactor = totalCostDHSum > 0 ? totDH / totalCostDHSum : 0;
      const expAlloc = allocFactor * costTotal;
      const totWithExp = totDH + expAlloc;
      const landedCost = qty > 0 ? totWithExp / qty : 0;
      return [
        r.slNo, r.item, r.packing,
        qty ? fmtN(qty) : '', r.uom,
        unitFC ? fmtN(unitFC) : '', unitDH ? fmtN(unitDH) : '',
        totFC ? fmtN(totFC) : '', totDH ? fmtN(totDH) : '',
        allocFactor ? (allocFactor * 100).toFixed(4) + '%' : '0.0000%',
        expAlloc ? fmtN(expAlloc) : '',
        totWithExp ? fmtN(totWithExp) : '',
        landedCost ? fmtN(landedCost) : '',
      ];
    });
    itemBody.push([
      'TOTAL', '', '',
      totalQty ? fmtN(totalQty) : '', '',
      '', '',
      totalCostFCSum ? fmtN(totalCostFCSum) : '', totalCostDHSum ? fmtN(totalCostDHSum) : '',
      '1.00',
      totalExpAllocated ? fmtN(totalExpAllocated) : '',
      grandTotalValue ? fmtN(grandTotalValue) : '',
      '',
    ]);

    autoTable(doc, {
      startY: y,
      head: [[
        'Sl No', 'Item', 'Packing', 'Qty', 'UOM',
        { content: 'Unit Cost', colSpan: 2 } as any,
        { content: 'Total Cost', colSpan: 2 } as any,
        'Expenses\nAllocation\nFactor', 'Expenses\nAllocated', 'Total Value\nWith Expenses', 'Landed\nCost/Unit',
      ], [
        '', '', '', '', '',
        'FC', 'DH', 'FC', 'DH',
        '', '', '', '',
      ]],
      body: itemBody.length ? itemBody : [['—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—']],
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', fontSize: 6.5, lineColor: [0, 0, 0], lineWidth: 0.3, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 90 },
        2: { cellWidth: 55 },
        3: { halign: 'right', cellWidth: 40 },
        4: { cellWidth: 28 },
        5: { halign: 'right', cellWidth: 42 },
        6: { halign: 'right', cellWidth: 42 },
        7: { halign: 'right', cellWidth: 42 },
        8: { halign: 'right', cellWidth: 42 },
        9: { halign: 'right', cellWidth: 46 },
        10: { halign: 'right', cellWidth: 46 },
        11: { halign: 'right', cellWidth: 52 },
        12: { halign: 'right', cellWidth: 'auto' },
      },
      didParseCell: (data: any) => {
        if (data.row.index === itemBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.4,
      margin: { left: M, right: M },
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    // ── APPROVALS ────────────────────────────────────────────────────────────
    if (y > pageH - 44) { doc.addPage(); y = M; }

    const sigs = ['AP', 'FC', 'CFO', 'CEO'];
    const sigW = CW / sigs.length;
    sigs.forEach((label, i) => {
      const sx = M + i * sigW;
      doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.text(label, sx + 4, y + 8);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
      doc.setDrawColor(150); doc.setLineWidth(0.3);
      doc.line(sx + 4, y + 22, sx + sigW - 8, y + 22);
    });

    // Footer
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(150);
    const now = new Date();
    doc.text(
      `Generated by Royal Shipment Tracker — ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}   |   Downloaded by: ${config.downloadedBy}`,
      pageW / 2, pageH - 10, { align: 'center' }
    );
    doc.setTextColor(0);

    doc.save(`${config.shipmentNo.replace(/[^a-z0-9_-]/gi, '_')}-costing-sheet.pdf`);
  }

  openRemoteDocumentPreview(url: string, title: string): void {
    this.previewUrl.set(url);
    this.previewTitle.set(title);
    this.previewIsImage.set(/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url));
    this.resetPreviewZoom();
    this.showPreviewModal.set(true);
  }

  openDocumentPreview(file: File, title: string): void {
    const url = URL.createObjectURL(file);
    this.previewUrl.set(url);
    this.previewTitle.set(title);
    this.previewIsImage.set(file.type.startsWith('image/'));
    this.resetPreviewZoom();
    this.showPreviewModal.set(true);
  }

  closeDocumentPreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
    this.previewTitle.set('');
    this.resetPreviewZoom();
    this.showPreviewModal.set(false);
  }

  onPreviewVisibleChange(visible: boolean): void {
    if (!visible) this.closeDocumentPreview();
  }

  zoomInPreview(): void {
    this.previewZoom.update((zoom) => Math.min(zoom + 0.25, 4));
  }

  zoomOutPreview(): void {
    this.previewZoom.update((zoom) => Math.max(zoom - 0.25, 1));
  }

  resetPreviewZoom(): void {
    this.previewZoom.set(1);
    this.previewTransformOrigin.set('center center');
  }

  onPreviewImageDoubleClick(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    this.previewTransformOrigin.set(`${x}% ${y}%`);
    this.previewZoom.update((zoom) => (zoom > 1 ? 1 : 2));
  }

  openStatusModal(index: number): void {
    if (!this.canEditBlDetails()) return;
    this.statusModalShipmentIndex.set(index);
    this.statusModalVisible.set(true);
  }

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

  /** 0–100 progress for the ship animation based on current stage */
  getShipProgress(currentStage: string): number {
    const index = this.STAGE_ORDER.indexOf(currentStage as any);
    if (index < 0) return 0;
    return Math.round((index / (this.STAGE_ORDER.length - 1)) * 100);
  }

  /** True when the shipment has reached or passed Storage stage */
  isShipArrived(currentStage: string): boolean {
    const index = this.STAGE_ORDER.indexOf(currentStage as any);
    const storageIndex = this.STAGE_ORDER.indexOf('Storage Allocation & Arrival');
    return index >= storageIndex;
  }

  isSaving(index: number, section: 'bl' | 'cost' | 'storage'): boolean {
    return this.savingKey() === `${section}-${index}`;
  }

  async saveBLDetails(index: number): Promise<void> {
    if (!this.canEditBlDetails()) return;
    const row = this.formArray.at(index);
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (!row || !shipmentId) return;

    if (this.getActiveTab(index) === 'storage') {
      const validation = this.validateStorageAllocationContainers(row);
      if (!validation.valid) {
        this.storageValidationMessage.set(validation.message);
        this.storageValidationDetails.set(validation.mismatches);
        this.storageValidationModalVisible.set(true);
        return;
      }
    }

    const containerId = row.get('containerId')?.value;
    if (!containerId) {
      this.notificationService.warn('Missing container', 'This shipment row is not linked to a container yet.');
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: `Save B/L details for Shipment ${index + 1}?`,
      header: 'Save B/L Details',
      acceptLabel: 'Yes, Save',
    });
    if (!confirmed) return;

    // Validate required BL fields
    const blNo = String(row.get('blNo')?.value || '').trim();
    const shippedOnBoard = row.get('shippedOnBoard')?.value;
    const portOfLoading = String(row.get('portOfLoading')?.value || '').trim();
    const portOfDischarge = String(row.get('portOfDischarge')?.value || '').trim();
    const noOfContainers = row.get('noOfContainers')?.value;
    const noOfBags = row.get('noOfBags')?.value;
    const quantityByMt = row.get('quantityByMt')?.value;
    const shippingLine = String(row.get('shippingLine')?.value || '').trim();
    const freeDetentionDays = row.get('freeDetentionDays')?.value;
    const maximumDetentionDays = row.get('maximumDetentionDays')?.value;

    const missingBLFields: string[] = [];
    if (!blNo) missingBLFields.push('B/L No');
    if (!shippedOnBoard) missingBLFields.push('Shipped On Board');
    if (!portOfLoading) missingBLFields.push('Port of Loading');
    if (!portOfDischarge) missingBLFields.push('Port of Discharge');
    if (noOfContainers == null || noOfContainers === '') missingBLFields.push('No of Containers');
    if (noOfBags == null || noOfBags === '') missingBLFields.push('No of Bags');
    if (quantityByMt == null || quantityByMt === '') missingBLFields.push('Quantity by MT');
    if (!shippingLine) missingBLFields.push('Shipping Line');
    if (freeDetentionDays == null || freeDetentionDays === '') missingBLFields.push('Free Detention Days');
    if (maximumDetentionDays == null || maximumDetentionDays === '') missingBLFields.push('Maximum Detention Days');

    if (missingBLFields.length > 0) {
      this.notificationService.error('Required Fields Missing', `Please fill: ${missingBLFields.join(', ')}`);
      return;
    }

    const toDate = (value: unknown) =>
      value ? new Date(value as string | Date).toISOString().split('T')[0] : '';

    this.savingKey.set(`bl-${index}`);
    const formData = new FormData();
    formData.append('blNo', row.get('blNo')?.value || '');
    formData.append('shippedOnBoard', toDate(row.get('shippedOnBoard')?.value));
    formData.append('portOfLoading', row.get('portOfLoading')?.value || '');
    formData.append('portOfDischarge', row.get('portOfDischarge')?.value || '');
    formData.append('noOfContainers', String(Number(row.get('noOfContainers')?.value) || 0));
    formData.append('noOfBags', String(Number(row.get('noOfBags')?.value) || 0));
    formData.append('quantityByMt', String(Number(row.get('quantityByMt')?.value) || 0));
    formData.append('shippingLine', row.get('shippingLine')?.value || '');
    formData.append('freeDetentionDays', String(Number(row.get('freeDetentionDays')?.value) || 0));
    formData.append('maximumDetentionDays', String(Number(row.get('maximumDetentionDays')?.value) || 0));
    formData.append('freightPrepared', row.get('freightPrepared')?.value || 'No');

    formData.append('actualBags', String(Number(row.get('actualBags')?.value) || 0));
    formData.append('expiryDate', toDate(row.get('expiryDate')?.value));
    formData.append('hsCode', row.get('hsCode')?.value || '');
    formData.append('packagingDate', toDate(row.get('packagingDate')?.value));
    formData.append('grossWeight', row.get('grossWeight')?.value || '');
    formData.append('netWeight', row.get('netWeight')?.value || '');

    this.shipmentService.submitBLDetails(containerId, formData).subscribe({
      next: (response) => {
        this.savingKey.set(null);
        this.applyActualOverride(index, response?.container?.actual);
        this.notificationService.success('Saved', 'B/L details saved successfully.');
        this.ensureAccordionOpen(index); // POINT 8: keep accordion open
      },
      error: (error) => {
        this.savingKey.set(null);
        this.notificationService.error('Save failed', error.error?.message || 'Could not save B/L details.');
      }
    });
  }

  async saveCostSheet(index: number): Promise<void> {
    if (!this.canEditClearingAdvance()) return;
    const row = this.formArray.at(index);
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (!row || !shipmentId) return;

    const containerId = row.get('containerId')?.value;
    if (!containerId) {
      this.notificationService.warn('Missing container', 'This shipment row is not linked to a container yet.');
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: `Save cost sheet for Shipment ${index + 1}?`,
      header: 'Save Cost Sheet',
      acceptLabel: 'Yes, Save',
    });
    if (!confirmed) return;

    const costSheetBookings = this.getCostSheetRows(row).getRawValue().map((entry: any) => ({
      sn: Number(entry.sn) || 0,
      description: entry.description || '',
      visibleTo: normalizeBlVisibleTo(entry.visibleTo),
      defaultQty: Number(entry.defaultQty ?? 0),
      defaultRate: Number(entry.defaultRate ?? 0),
      requestAmount: Number(entry.requestAmount ?? 0),
      // POINT 5: paidAmount removed, replaced with remarks
      remarks: entry.remarks ?? '',
      attachmentDocumentUrl: entry.attachmentDocumentUrl ?? '',
      attachmentDocumentName: entry.attachmentDocumentName ?? '',
    }));

    this.savingKey.set(`cost-${index}`);
    const formData = new FormData();
    formData.append('costSheetBookings', JSON.stringify(costSheetBookings));

    const bookingFile = this.getBookingFile(index);
    if (bookingFile) {
      formData.append('costSheetBookingDocument', bookingFile, bookingFile.name);
    }
    this.getCostSheetRows(row).controls.forEach((_, rowIndex) => {
      const attachmentFile = this.getCostSheetAttachmentFile(index, rowIndex);
      if (attachmentFile) {
        formData.append(`costSheetBookings_${rowIndex}_attachment`, attachmentFile, attachmentFile.name);
      }
    });

    this.shipmentService.submitBLDetails(containerId, formData).subscribe({
      next: (response) => {
        this.savingKey.set(null);
        this.applyActualOverride(index, response?.container?.actual);
        this.patchCostSheetFromActual(index, response?.container?.actual);
        if (bookingFile) this.clearBookingFile(index);
        this.getCostSheetRows(row).controls.forEach((_, rowIndex) => this.clearCostSheetAttachmentFile(index, rowIndex));
        this.editingCostSheet.update((current) => ({ ...current, [index]: false }));
        this.notificationService.success('Saved', 'Cost sheet booking saved successfully.');
        this.ensureAccordionOpen(index); // POINT 8: keep accordion open
      },
      error: (error) => {
        this.savingKey.set(null);
        this.notificationService.error('Save failed', error.error?.message || 'Could not save cost sheet booking.');
      }
    });
  }

  async saveStorageAllocations(index: number): Promise<void> {
    if (!this.canEditStorageAllocations()) return;
    const row = this.formArray.at(index);
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (!row || !shipmentId) return;

    const containerId = row.get('containerId')?.value;
    if (!containerId) {
      this.notificationService.warn('Missing container', 'This shipment row is not linked to a container yet.');
      return;
    }

    const validation = this.validateStorageAllocationContainers(row);
    if (!validation.valid) {
      this.storageValidationMessage.set(validation.message);
      this.storageValidationDetails.set(validation.mismatches);
      this.storageValidationModalVisible.set(true);
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: `Save storage allocations for Shipment ${index + 1}?`,
      header: 'Save Storage Allocations',
      acceptLabel: 'Yes, Save',
    });
    if (!confirmed) return;

    // Validate storage allocation required fields
    const storageRows = this.getStorageRows(row).getRawValue();
    const invalidStorageRows = storageRows.filter((entry: any) =>
      !String(entry.containerSerialNo || '').trim() ||
      (entry.bags == null || entry.bags === '') ||
      !String(entry.warehouse || '').trim()
    );
    if (invalidStorageRows.length > 0) {
      this.notificationService.error('Required Fields Missing', 'Container Serial No, Bags, and Warehouse are required for all storage allocation rows.');
      return;
    }

    const storageAllocations = this.getStorageRows(row).getRawValue().map((entry: any) => ({
      sn: Number(entry.sn) || 0,
      containerSerialNo: entry.containerSerialNo || '',
      bags: Number(entry.bags ?? 0) || 0,
      warehouse: entry.warehouse || '',
      storageAvailability: Number(entry.storageAvailability) || 0,
    }));

    this.savingKey.set(`storage-${index}`);
    const formData = new FormData();
    formData.append('storageAllocations', JSON.stringify(storageAllocations));

    this.shipmentService.submitBLDetails(containerId, formData).subscribe({
      next: (response) => {
        this.savingKey.set(null);
        this.applyActualOverride(index, response?.container?.actual);
        this.patchStorageAllocationsFromActual(index, response?.container?.actual);
        this.notificationService.success('Saved', 'Storage allocations saved successfully.');
        this.ensureAccordionOpen(index); // POINT 8: keep accordion open
      },
      error: (error) => {
        this.savingKey.set(null);
        this.notificationService.error('Save failed', error.error?.message || 'Could not save storage allocations.');
      }
    });
  }

  async approveClearingAdvance(index: number): Promise<void> {
    if (!this.canApproveClearingAdvance(index)) return;
    const row = this.formArray.at(index);
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (!row || !shipmentId) return;

    const containerId = row.get('containerId')?.value;
    if (!containerId) {
      this.notificationService.warn('Missing container', 'This shipment row is not linked to a container yet.');
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: `Approve clearing advance for Shipment ${index + 1}?`,
      header: 'Approve Clearing Advance',
      acceptLabel: 'Yes, Approve',
    });
    if (!confirmed) return;

    this.savingKey.set(`cost-${index}`);
    this.shipmentService.approveClearingAdvance(containerId).subscribe({
      next: (response) => {
        this.savingKey.set(null);
        this.notificationService.success('Approved', response.message || 'Clearing advance approved successfully.');
        this.ensureAccordionOpen(index);
        this.store.dispatch(ShipmentActions.loadShipmentDetail({ id: shipmentId }));
      },
      error: (error) => {
        this.savingKey.set(null);
        this.notificationService.error('Approval failed', error.error?.message || 'Could not approve clearing advance.');
      }
    });
  }

  async approveStorageAllocations(index: number): Promise<void> {
    if (!this.canApproveStorageAllocations(index)) return;
    const row = this.formArray.at(index);
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (!row || !shipmentId) return;

    const containerId = row.get('containerId')?.value;
    if (!containerId) {
      this.notificationService.warn('Missing container', 'This shipment row is not linked to a container yet.');
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: `Approve storage allocations for Shipment ${index + 1}?`,
      header: 'Approve Storage Allocations',
      acceptLabel: 'Yes, Approve',
    });
    if (!confirmed) return;

    this.savingKey.set(`storage-${index}`);
    this.shipmentService.approveStorageAllocations(containerId).subscribe({
      next: () => {
        this.savingKey.set(null);
        this.notificationService.success('Approved', 'Storage allocations approved successfully.');
        this.ensureAccordionOpen(index);
        this.store.dispatch(ShipmentActions.loadShipmentDetail({ id: shipmentId }));
      },
      error: (error) => {
        this.savingKey.set(null);
        this.notificationService.error('Approval failed', error.error?.message || 'Could not approve storage allocations.');
      }
    });
  }

  async approvePaymentCosting(index: number): Promise<void> {
    if (!this.canApprovePaymentCosting(index)) return;
    const row = this.formArray.at(index);
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (!row || !shipmentId) return;

    const containerId = row.get('containerId')?.value;
    if (!containerId) {
      this.notificationService.warn('Missing container', 'This shipment row is not linked to a container yet.');
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: `Approve payment costing for Shipment ${index + 1}?`,
      header: 'Approve Payment Costing',
      acceptLabel: 'Yes, Approve',
    });
    if (!confirmed) return;

    this.savingKey.set(`cost-${index}`);
    this.shipmentService.approvePaymentCosting(containerId).subscribe({
      next: (response) => {
        this.savingKey.set(null);
        this.notificationService.success('Approved', response.message || 'Payment costing approved successfully.');
        this.ensureAccordionOpen(index);
        this.store.dispatch(ShipmentActions.loadShipmentDetail({ id: shipmentId }));
      },
      error: (error) => {
        this.savingKey.set(null);
        this.notificationService.error('Approval failed', error.error?.message || 'Could not approve payment costing.');
      }
    });
  }

  generateCostSheetReport(index: number): void {
    const row = this.formArray.at(index);
    if (!row) return;

    const shipment = this.shipmentData()?.shipment as any;
    const actual = this.shipmentData()?.actual?.[index] as any;
    const visibleCostRows = this.getCostSheetRows(row).controls.filter((entry) => this.canCurrentUserSeeBlRow(entry));
    const totalFC = Number(shipment?.totalFC) || 0;
    const amountAED = Number(shipment?.amountAED) || 0;
    const exchangeRate = totalFC > 0 && amountAED > 0 ? this.formatCurrency(amountAED / totalFC) : '3.67';
    const arrivedAtPort = actual?.arrivalOn ? this.formatDateForReport(actual.arrivalOn) : '';
    const clearedOn = actual?.clearedOn || actual?.clearance?.clearedOn;
    let noOfDaysAtPort = '';
    if (actual?.arrivalOn && clearedOn) {
      const diff = Math.round((new Date(clearedOn).getTime() - new Date(actual.arrivalOn).getTime()) / (1000 * 60 * 60 * 24));
      noOfDaysAtPort = String(diff);
    }

    const currentUser = this.authService.getCurrentUser();
    const downloadedBy = currentUser
      ? `${currentUser.name} (${currentUser.role}) — ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
      : 'Unknown';

    const preparedBy = currentUser ? `${currentUser.name} (${currentUser.role})` : 'Unknown';
    const approval = actual?.clearingAdvanceApproval;
    const approvedBy = approval?.fasApprovedAt ? `FAS - ${this.formatDateForReport(approval.fasApprovedAt)}` : '';

    const storage = Array.from(
      new Set(
        [
          ...(Array.isArray(actual?.storageAllocations) ? actual.storageAllocations : []),
          ...(Array.isArray(actual?.storageSplits) ? actual.storageSplits : []),
        ]
          .map((entry: any) => String(entry?.warehouse || '').trim())
          .filter(Boolean)
      )
    ).join(', ');

    downloadAdvanceRequestReportPdf({
      fileStem: `${this.getShipmentNoLabel(index)}-clearing-advance-report`,
      sourceLabel: 'Clearing Advance',
      reportDate: this.formatDateForReport(new Date()),
      boeDate: this.formatDateForReport(actual?.boePassingDate || actual?.customsClearanceDate),
      vendor: shipment?.supplierName || shipment?.supplier || '',
      country: shipment?.countryOfOrigin || '',
      shipmentNo: this.getShipmentNoLabel(index),
      shippingLine: row.get('shippingLine')?.value || actual?.shippingLine || '',
      invoiceAmountFC: this.formatCurrency(shipment?.totalFC ?? 0),
      blNo: row.get('blNo')?.value || actual?.BLNo || '',
      exchangeRate,
      noOfContainers: String(row.get('noOfContainers')?.value || actual?.noOfContainers || ''),
      invoiceAmountAED: this.formatCurrency(shipment?.amountAED ?? (Number(shipment?.totalFC ?? 0) * 3.67)),
      loadingPort: row.get('portOfLoading')?.value || actual?.portOfLoading || shipment?.portOfLoading || '',
      despatchPort: row.get('portOfDischarge')?.value || actual?.portOfDischarge || shipment?.portOfDischarge || '',
      incoTerms: shipment?.incoterms || '',
      supplierInvoiceNo: actual?.commercialInvoiceNo || shipment?.piNo || '',
      eta: arrivedAtPort,
      item: shipment?.item || shipment?.itemDescription || '',
      planningToReleaseDate: this.formatDateForReport(actual?.documentsReleasedDate),
      noOfDaysAtPort,
      storage,
      downloadedBy,
      preparedBy,
      approvedBy,
      lines: visibleCostRows.map((entry, visibleIndex) => ({
        sn: visibleIndex + 1,
        description: entry.get('description')?.value ?? '',
        qty: entry.get('defaultQty')?.value ?? 1,
        rate: entry.get('defaultRate')?.value ?? 0,
        amount: Number(entry.get('requestAmount')?.value) || 0,
        paymentReference: entry.get('remarks')?.value ?? '',
      })),
    });
  }

  getCostSheetTotal(group: AbstractControl, field: 'requestAmount' | 'paidAmount'): string {
    const total = this.getCostSheetRows(group)
      .getRawValue()
      .filter((row: any) => this.canCurrentUserSeeBlRow(row))
      .reduce((sum: number, row: any) => sum + (Number(row?.[field]) || 0), 0);
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total);
  }

  onStatusModalVisibleChange(visible: boolean): void {
    this.statusModalVisible.set(visible);
    if (!visible) this.statusModalShipmentIndex.set(null);
  }

  getShipmentReachedStage(index: number): string {
    if (this.submittedStep7Indices().includes(index)) return 'Payment & Costing';
    if (this.submittedStep6Indices().includes(index)) return 'Quality';
    if (this.submittedStep5Indices().includes(index)) return 'Storage Allocation & Arrival';
    if (this.submittedStep4Indices().includes(index)) return 'Port and Customs Clearance Tracker';
    if (this.submittedStep3Indices().includes(index)) return 'Document Tracker';
    if (this.submittedActualIndices().includes(index)) return 'BL Details';
    if (this.isPlannedLocked()) return 'Shipment Tracker';
    return 'Shipment Entry';
  }

  getShipmentStatus(index: number): string {
    const shipment = this.shipmentData()?.shipment as any;
    const actual = this.shipmentData()?.actual?.[index] as any;
    const planned = this.shipmentData()?.planned?.[index] as any;
    return actual?.shipmentStatus || planned?.shipmentStatus || shipment?.shipmentStatus || getComputedShipmentStatus({
      shipmentCurrentStage: shipment?.currentStage,
      plannedRow: planned,
      actualRow: actual,
      fallbackStageLabel: this.getShipmentReachedStage(index),
    });
  }

  getStatusBadgeClass(status: string): string {
    const severity: ShipmentStatusSeverity = getShipmentStatusSeverity(status);
    if (severity === 'success') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (severity === 'info') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (severity === 'secondary') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }

  isStageCompletedForShipment(index: number, stageIndex: number): boolean {
    if (stageIndex === 0) return true;
    if (stageIndex === 1) return this.isPlannedLocked();
    if (stageIndex === 2) return this.submittedActualIndices().includes(index);
    if (stageIndex === 3) return this.submittedStep3Indices().includes(index);
    if (stageIndex === 4) return this.submittedStep4Indices().includes(index);
    if (stageIndex === 5) return this.submittedStep5Indices().includes(index);
    if (stageIndex === 6) return this.submittedStep6Indices().includes(index);
    if (stageIndex === 7) return this.submittedStep7Indices().includes(index);
    return false;
  }

  isCurrentStageForShipment(index: number, stageIndex: number): boolean {
    const reached = this.getShipmentReachedStage(index);
    return this.shipmentStages[stageIndex] === reached;
  }
}
