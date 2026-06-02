import { Component, Input, effect, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormGroup, ReactiveFormsModule, AbstractControl } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { selectShipmentData } from '../../../../../../store/shipment/shipment.selectors';
import * as ShipmentActions from '../../../../../../store/shipment/shipment.actions';
import { AccordionModule } from 'primeng/accordion';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ShipmentService } from '../../../../../../core/services/shipment.service';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { WarehouseService } from '../../../../../../core/services/warehouse.service';
import { ConfirmDialogService } from '../../../../../../core/services/confirm-dialog.service';
import { RbacService } from '../../../../../../core/services/rbac.service';
import { AuthService } from '../../../../../../core/services/auth.service';
import { StorageAllocationApprovalState, StorageArrivalApprovalState } from '../../../../../../core/models/shipment.model';

@Component({
  selector: 'app-shipment-storage',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AccordionModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    DialogModule,
  ],
  templateUrl: './shipment-storage.component.html',
})
export class ShipmentStorageComponent {
  @Input({ required: true }) formArray!: FormArray;
  @Input() visibleShipmentIndices: number[] = [];

  @ViewChild('storageRowFileInput') storageRowFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('storageGlobalFileInput') storageGlobalFileInputRef?: ElementRef<HTMLInputElement>;
  private restoredUiStateKey: string | null = null;

  private store = inject(Store);
  private sanitizer = inject(DomSanitizer);
  private shipmentService = inject(ShipmentService);
  private notificationService = inject(NotificationService);
  private warehouseService = inject(WarehouseService);
  private confirmDialog = inject(ConfirmDialogService);
  private rbacService = inject(RbacService);
  private authService = inject(AuthService);
  readonly shipmentData = toSignal(this.store.select(selectShipmentData));

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
      const data = this.shipmentData();
      if (!data || !this.formArray || this.formArray.length === 0) return;

      const now = new Date();
      this.formArray.controls.forEach((group: AbstractControl, i: number) => {
        const containers = this.getContainersArray(group);
        const actualRow = data.actual?.[i];
        if (!actualRow) return;

        containers.forEach((rowGroup: AbstractControl) => {
          const row = rowGroup as FormGroup;
          
          // 1. Default Received On Date/Time
          if (!row.get('receivedOnDate')?.value) {
            row.get('receivedOnDate')?.patchValue(now, { emitEvent: false });
          }
          if (!row.get('receivedOnTime')?.value) {
            row.get('receivedOnTime')?.patchValue(now, { emitEvent: false });
          }

          // 2. Populate Production/Expiry from actual data (Packaging List source)
          if (!row.get('productionDate')?.value && actualRow.packagingDate) {
            row.get('productionDate')?.patchValue(new Date(actualRow.packagingDate), { emitEvent: false });
          }
          
          // Check expiry in ActualContainer level or inside packagingList object
          const expirySource = actualRow.expiryDate || actualRow.packagingList?.expiryDate;
          if (!row.get('expiryDate')?.value && expirySource) {
            row.get('expiryDate')?.patchValue(new Date(expirySource), { emitEvent: false });
          }
        });
      });
    });

    effect(() => {
      const shipmentId = this.shipmentData()?.shipment?._id;
      if (!shipmentId || !this.formArray || this.formArray.length === 0) return;
      this.restoreUiState();
    });
  }

  // Tab state uses compound key "shipmentIndex-containerIndex"
  readonly activeTabs = signal<Record<string, 'allocation' | 'arrival'>>({});
  readonly openAccordionPanels = signal<string[]>([]);
  readonly expandedContainers = signal<Record<number, boolean>>({});
  readonly savingRowKey = signal<string | null>(null);
  readonly rowFiles = signal<Record<string, File | null>>({});
  readonly globalFiles = signal<Record<number, File | null>>({});

  // POINT 13: Global save all state
  readonly savingAllRows = signal(false);
  readonly saveAllProgress = signal<{ current: number; total: number } | null>(null);
  readonly storageArrivalStatusOverrides = signal<Record<number, 'draft' | 'pending_warehouse_manager' | 'approved'>>({});
  readonly actualOverrides = signal<Record<number, any>>({});
  readonly previewUrl = signal<string | null>(null);
  readonly previewTitle = signal('');
  readonly previewIsImage = signal(false);
  readonly previewZoom = signal(1);
  readonly previewTransformOrigin = signal('center center');
  readonly showPreviewModal = signal(false);
  readonly previewSafeUrl = computed(() => {
    const url = this.previewUrl();
    if (!url || this.previewIsImage()) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  private pendingRowUpload: { shipmentIndex: number; containerIndex: number } | null = null;

  readonly warehouseOptions = signal<Array<{ label: string; value: string }>>([]);

  hasVisibleShipments(): boolean {
    return this.visibleShipmentIndices.length > 0;
  }

  shouldShowShipment(index: number): boolean {
    return this.visibleShipmentIndices.includes(index);
  }

  /** Returns the nested containers FormArray for a given shipment group */
  getContainersArray(group: AbstractControl): AbstractControl[] {
    const containers = (group as FormGroup).get('containers') as FormArray;
    return containers ? containers.controls : [];
  }

  getVisibleContainers(group: AbstractControl, shipmentIndex: number): AbstractControl[] {
    const all = this.getContainersArray(group);
    return this.expandedContainers()[shipmentIndex] ? all : all.slice(0, 5);
  }

  hasHiddenContainers(group: AbstractControl): boolean {
    return this.getContainersArray(group).length > 5;
  }

  toggleContainers(shipmentIndex: number): void {
    this.expandedContainers.update((cur) => ({ ...cur, [shipmentIndex]: !cur[shipmentIndex] }));
  }

  getShipmentNoLabel(index: number): string {
    if (this.formArray?.controls[index] == null) return '–';
    const base = this.shipmentData()?.shipment?.shipmentNo?.replace(/\([^)]*\)/g, '').trim();
    return base?.trim() ? `${base}-${index + 1}` : '–';
  }

  private shouldEnforceTabPermissions(): boolean {
    const role = this.authService.getCurrentUser()?.role;
    return role !== 'Admin' && role !== 'Manager';
  }

  private getActualRow(index: number): any {
    return this.actualOverrides()[index] || this.shipmentData()?.actual?.[index] || null;
  }

  private applyActualOverride(index: number, actual: any): void {
    if (!actual) return;
    this.actualOverrides.update((current) => ({ ...current, [index]: actual }));
  }

  private patchStorageArrivalFromActual(index: number, actual: any): void {
    const group = this.formArray.at(index) as FormGroup | null;
    if (!group || !actual) return;

    group.patchValue(
      {
        storageDocumentUrl: actual.storageDocumentUrl || '',
        storageDocumentName: actual.storageDocumentName || '',
      },
      { emitEvent: false }
    );

    const rows = this.getContainersArray(group);
    const actualRows = Array.isArray(actual.storageSplits) ? actual.storageSplits : [];
    rows.forEach((control, rowIndex) => {
      const saved = actualRows[rowIndex];
      if (!saved) return;
      (control as FormGroup).patchValue(
        {
          containerSerialNo: saved.containerSerialNo || '',
          bags: Number(saved.bags ?? 0),
          warehouse: saved.warehouse || '',
          storageAvailability: Number(saved.storageAvailability ?? 0),
          receivedOnDate: saved.receivedOnDate ? new Date(saved.receivedOnDate) : null,
          receivedOnTime: saved.receivedOnTime || '',
          customsInspection: saved.customsInspection || 'No',
          grn: saved.grn || '',
          batch: saved.batch || '',
          productionDate: saved.productionDate ? new Date(saved.productionDate) : null,
          expiryDate: saved.expiryDate ? new Date(saved.expiryDate) : null,
          remarks: saved.remarks || '',
          documentUrl: saved.documentUrl || '',
          documentName: saved.documentName || '',
        },
        { emitEvent: false }
      );
    });
  }

  getStorageAllocationApproval(index: number): StorageAllocationApprovalState | null {
    return this.getActualRow(index)?.storageAllocationApproval || null;
  }

  getStorageArrivalApproval(index: number): StorageArrivalApprovalState | null {
    return this.getActualRow(index)?.storageArrivalApproval || null;
  }

  getStorageAllocationApprovalStatus(index: number): 'draft' | 'pending_warehouse_manager' | 'approved' {
    return this.getStorageAllocationApproval(index)?.status || 'draft';
  }

  getStorageArrivalApprovalStatus(index: number): 'draft' | 'pending_warehouse_manager' | 'approved' {
    return this.storageArrivalStatusOverrides()[index] || this.getStorageArrivalApproval(index)?.status || 'draft';
  }

  getStorageAllocationApprovalLabel(index: number): string {
    const status = this.getStorageAllocationApprovalStatus(index);
    return status === 'approved'
      ? 'Approved'
      : status === 'pending_warehouse_manager'
        ? 'Pending Warehouse Manager Approval'
        : 'Draft';
  }

  getStorageArrivalApprovalLabel(index: number): string {
    const status = this.getStorageArrivalApprovalStatus(index);
    return status === 'approved'
      ? 'Approved'
      : status === 'pending_warehouse_manager'
        ? 'Pending for Approval'
        : 'Draft';
  }

  isStorageAllocationApproved(index: number): boolean {
    return this.getStorageAllocationApprovalStatus(index) === 'approved';
  }

  isStorageArrivalApproved(index: number): boolean {
    return this.getStorageArrivalApprovalStatus(index) === 'approved';
  }

  isStorageArrivalPending(index: number): boolean {
    return this.getStorageArrivalApprovalStatus(index) === 'pending_warehouse_manager';
  }

  isStorageArrivalLocked(index: number): boolean {
    const status = this.getStorageArrivalApprovalStatus(index);
    return status === 'pending_warehouse_manager' || status === 'approved';
  }

  canApproveStorageArrival(index: number): boolean {
    if (this.getStorageArrivalApprovalStatus(index) !== 'pending_warehouse_manager') {
      return false;
    }
    const role = this.authService.getCurrentUser()?.role;
    if (role === 'warehouse' || role === 'Admin' || role === 'Manager' || role === 'Management') {
      return true;
    }
    return this.rbacService.hasPermission('shipment.tab.storage.storage_arrival.approve_warehouse_manager');
  }

  async approveStorageArrival(index: number): Promise<void> {
    const actualRow = this.getActualRow(index);
    const containerId = actualRow?.containerId || (this.formArray.at(index) as FormGroup | null)?.get('containerId')?.value;
    if (!containerId || !this.canApproveStorageArrival(index)) return;

    const confirmed = await this.confirmDialog.ask({
      message: `Approve storage arrival for Shipment ${index + 1}?`,
      header: 'Approve Storage Arrival',
      acceptLabel: 'Yes, Approve',
    });
    if (!confirmed) return;

    this.savingRowKey.set(`approve:${index}`);
    this.shipmentService.approveStorageArrival(containerId).subscribe({
      next: (response) => {
        const actual = (response as any)?.container?.actual;
        this.applyActualOverride(index, actual);
        this.patchStorageArrivalFromActual(index, actual);
        this.storageArrivalStatusOverrides.update((current) => ({ ...current, [index]: 'approved' }));
        this.savingRowKey.set(null);
        this.notificationService.success('Approved', 'Storage arrival approved successfully.');
      },
      error: (error) => {
        this.savingRowKey.set(null);
        this.notificationService.error('Approval failed', error.error?.message || 'Could not approve storage arrival.');
      }
    });
  }

  canViewShipmentTab(tab: 'allocation' | 'arrival'): boolean {
    if (!this.shouldEnforceTabPermissions()) {
      return true;
    }

    if (tab === 'allocation') {
      return this.rbacService.hasPermission('shipment.tab.storage.storage_allocation.view');
    }

    return (
      this.rbacService.hasPermission('shipment.tab.storage.storage_arrival.view') ||
      this.rbacService.hasPermission('shipment.tab.storage_arrival.view')
    );
  }

  private getDefaultShipmentTab(): 'allocation' | 'arrival' {
    if (this.canViewShipmentTab('allocation')) return 'allocation';
    if (this.canViewShipmentTab('arrival')) return 'arrival';
    return 'allocation';
  }

  setActiveTab(shipmentIndex: number, containerIndex: number, tab: 'allocation' | 'arrival'): void {
    const key = `${shipmentIndex}-${containerIndex}`;
    this.activeTabs.update((current) => ({ ...current, [key]: tab }));
  }

  getActiveTab(shipmentIndex: number, containerIndex: number): 'allocation' | 'arrival' {
    const key = `${shipmentIndex}-${containerIndex}`;
    return this.activeTabs()[key] ?? 'allocation';
  }

  /** Per-shipment tab (single toggle for all containers in that shipment) */
  setShipmentTab(shipmentIndex: number, tab: 'allocation' | 'arrival'): void {
    if (!this.canViewShipmentTab(tab)) {
      return;
    }
    this.activeTabs.update((current) => ({ ...current, [`s-${shipmentIndex}`]: tab }));
    this.persistUiState();
  }

  getShipmentTab(shipmentIndex: number): 'allocation' | 'arrival' {
    const current = this.activeTabs()[`s-${shipmentIndex}`] as 'allocation' | 'arrival' | undefined;
    if (current && this.canViewShipmentTab(current)) {
      return current;
    }
    return this.getDefaultShipmentTab();
  }

  private normalizeAccordionValues(values: string | string[] | null | undefined): string[] {
    if (Array.isArray(values)) return values.filter(Boolean);
    if (typeof values === 'string' && values.trim()) return [values];
    return [];
  }

  private getUiStateStorageKey(): string | null {
    const shipmentId = this.shipmentData()?.shipment?._id;
    return shipmentId ? `shipment-storage-ui:${shipmentId}` : null;
  }

  private persistUiState(): void {
    if (typeof window === 'undefined') return;
    const key = this.getUiStateStorageKey();
    if (!key) return;

    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        openAccordionPanels: this.normalizeAccordionValues(this.openAccordionPanels()),
        activeTabs: this.activeTabs(),
      })
    );
  }

  private restoreUiState(): void {
    if (typeof window === 'undefined') return;
    const key = this.getUiStateStorageKey();
    if (!key || this.restoredUiStateKey === key) return;

    this.restoredUiStateKey = key;
    const rawState = window.sessionStorage.getItem(key);
    if (!rawState) return;

    try {
      const parsed = JSON.parse(rawState) as {
        openAccordionPanels?: string[] | null;
        activeTabs?: Record<string, 'allocation' | 'arrival'> | null;
      };
      this.openAccordionPanels.set(this.normalizeAccordionValues(parsed.openAccordionPanels));
      const restoredTabs = parsed.activeTabs ?? {};
      const sanitizedTabs = Object.fromEntries(
        Object.entries(restoredTabs).filter(([, tab]) => this.canViewShipmentTab(tab))
      ) as Record<string, 'allocation' | 'arrival'>;
      this.activeTabs.set(sanitizedTabs);
    } catch {
      window.sessionStorage.removeItem(key);
    }
  }

  onAccordionChange(values: string | string[] | null | undefined): void {
    const normalized = this.normalizeAccordionValues(values);
    if (normalized.length === 0 && (this.savingRowKey() !== null || this.savingAllRows())) {
      return;
    }
    this.openAccordionPanels.set(normalized);
    this.persistUiState();
  }

  private ensureAccordionOpen(shipmentIndex: number): void {
    const panelValue = `storage-${shipmentIndex}`;
    const current = this.normalizeAccordionValues(this.openAccordionPanels());
    if (!current.includes(panelValue)) {
      this.openAccordionPanels.set([...current, panelValue]);
      this.persistUiState();
    }
  }

  private rowFileKey(shipmentIndex: number, containerIndex: number): string {
    return `${shipmentIndex}:${containerIndex}`;
  }

  private saveRowKey(shipmentIndex: number, containerIndex: number): string {
    return `${shipmentIndex}:${containerIndex}`;
  }

  clickRowFileInput(shipmentIndex: number, containerIndex: number): void {
    this.pendingRowUpload = { shipmentIndex, containerIndex };
    this.storageRowFileInputRef?.nativeElement?.click();
  }

  onRowFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const pendingUpload = this.pendingRowUpload;
    if (file && pendingUpload) {
      this.rowFiles.update((cur) => ({
        ...cur,
        [this.rowFileKey(pendingUpload.shipmentIndex, pendingUpload.containerIndex)]: file
      }));
    }
    this.pendingRowUpload = null;
    input.value = '';
  }

  getRowFile(shipmentIndex: number, containerIndex: number): File | null {
    return this.rowFiles()[this.rowFileKey(shipmentIndex, containerIndex)] ?? null;
  }

  clearRowFile(shipmentIndex: number, containerIndex: number): void {
    this.rowFiles.update((cur) => ({
      ...cur,
      [this.rowFileKey(shipmentIndex, containerIndex)]: null
    }));
  }

  clickGlobalFileInput(shipmentIndex: number): void {
    const input = this.storageGlobalFileInputRef?.nativeElement;
    if (input) {
      input.dataset['shipmentIndex'] = String(shipmentIndex);
      input.click();
    }
  }

  onGlobalFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const shipmentIndex = Number(input.dataset['shipmentIndex']);
    if (file && Number.isFinite(shipmentIndex)) {
      this.globalFiles.update((cur) => ({ ...cur, [shipmentIndex]: file }));
    }
    input.value = '';
    delete input.dataset['shipmentIndex'];
  }

  getGlobalFile(shipmentIndex: number): File | null {
    return this.globalFiles()[shipmentIndex] ?? null;
  }

  clearGlobalFile(shipmentIndex: number): void {
    this.globalFiles.update((cur) => ({ ...cur, [shipmentIndex]: null }));
  }

  openDocumentPreview(file: File, title: string): void {
    this.previewUrl.set(URL.createObjectURL(file));
    this.previewTitle.set(title);
    this.previewIsImage.set(file.type.startsWith('image/'));
    this.resetPreviewZoom();
    this.showPreviewModal.set(true);
  }

  openRemoteDocumentPreview(url: string, title: string): void {
    this.previewUrl.set(url);
    this.previewTitle.set(title);
    this.previewIsImage.set(/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url));
    this.resetPreviewZoom();
    this.showPreviewModal.set(true);
  }

  closeDocumentPreview(): void {
    const url = this.previewUrl();
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
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

  getSavedRowDocumentUrl(group: AbstractControl): string {
    return (group as FormGroup).get('documentUrl')?.value || '';
  }

  getSavedRowDocumentName(group: AbstractControl): string {
    return (group as FormGroup).get('documentName')?.value || '';
  }

  getSavedGlobalDocumentUrl(group: AbstractControl): string {
    return (group as FormGroup).get('storageDocumentUrl')?.value || '';
  }

  getSavedGlobalDocumentName(group: AbstractControl): string {
    return (group as FormGroup).get('storageDocumentName')?.value || '';
  }

  private toDate(value: unknown): string {
    return value ? new Date(value as string | Date).toISOString().split('T')[0] : '';
  }

  private toTime(value: unknown): string {
    if (!value) return '';
    if (value instanceof Date) {
      const hours = String(value.getHours()).padStart(2, '0');
      const minutes = String(value.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return String(value);
  }

  isSavingArrivalRow(shipmentIndex: number, containerIndex: number): boolean {
    return this.savingRowKey() === this.saveRowKey(shipmentIndex, containerIndex);
  }

  isApprovingStorageArrival(shipmentIndex: number): boolean {
    return this.savingRowKey() === `approve:${shipmentIndex}`;
  }

  async saveArrivalRow(index: number, containerIndex: number): Promise<void> {
    if (this.isStorageArrivalLocked(index)) return;
    this.ensureAccordionOpen(index);
    this.setShipmentTab(index, 'arrival');
    const group = this.formArray.at(index) as FormGroup | null;
    if (!group) return;

    const containerId = group.get('containerId')?.value;
    if (!containerId) {
      this.notificationService.warn('Missing container', 'This shipment row is not linked to a container yet.');
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: `Save storage arrival details for Container ${containerIndex + 1}?`,
      header: 'Save Storage Arrival',
      acceptLabel: 'Yes, Save',
    });
    if (!confirmed) return;

    const row = this.getContainersArray(group)[containerIndex] as FormGroup | undefined;
    if (!row) return;

    // Validate required storage arrival fields
    const receivedOnDate = row.get('receivedOnDate')?.value;
    const receivedOnTime = row.get('receivedOnTime')?.value;
    const grn = String(row.get('grn')?.value || '').trim();
    const batch = String(row.get('batch')?.value || '').trim();
    const productionDate = row.get('productionDate')?.value;
    const expiryDate = row.get('expiryDate')?.value;

    const missingArrivalFields: string[] = [];
    if (!receivedOnDate) missingArrivalFields.push('Received On Date');
    if (!receivedOnTime) missingArrivalFields.push('Received On Time');
    if (!grn) missingArrivalFields.push('GRN #');
    if (!batch) missingArrivalFields.push('Batch #');
    if (!productionDate) missingArrivalFields.push('Production Date');
    if (!expiryDate) missingArrivalFields.push('Expiry Date');

    if (missingArrivalFields.length > 0) {
      this.notificationService.error('Required Fields Missing', `Please fill: ${missingArrivalFields.join(', ')}`);
      return;
    }

    const formData = new FormData();
    const rowFile = this.getRowFile(index, containerIndex);
    if (rowFile) {
      formData.append('storageRowDocument', rowFile, rowFile.name);
    }
    formData.append('containerSerialNo', row.get('containerSerialNo')?.value || '');
    formData.append('bags', String(Number(row.get('bags')?.value) || 0));
    formData.append('warehouse', row.get('warehouse')?.value || '');
    formData.append('storageAvailability', String(Number(row.get('storageAvailability')?.value) || 0));
    formData.append('receivedOnDate', this.toDate(row.get('receivedOnDate')?.value));
    formData.append('receivedOnTime', this.toTime(row.get('receivedOnTime')?.value));
    formData.append('customsInspection', row.get('customsInspection')?.value || 'No');
    formData.append('grn', row.get('grn')?.value || '');
    formData.append('batch', row.get('batch')?.value || '');
    formData.append('productionDate', this.toDate(row.get('productionDate')?.value));
    formData.append('expiryDate', this.toDate(row.get('expiryDate')?.value));
    formData.append('remarks', row.get('remarks')?.value || '');
    formData.append('documentUrl', row.get('documentUrl')?.value || '');
    formData.append('documentName', row.get('documentName')?.value || '');

    this.savingRowKey.set(this.saveRowKey(index, containerIndex));
    this.shipmentService.submitStorageArrivalRow(containerId, containerIndex, formData).subscribe({
      next: (response) => {
        const actual = (response as any)?.container?.actual;
        this.applyActualOverride(index, actual);
        this.patchStorageArrivalFromActual(index, actual);
        this.storageArrivalStatusOverrides.update((current) => ({ ...current, [index]: 'pending_warehouse_manager' }));
        this.savingRowKey.set(null);
        if (rowFile) this.clearRowFile(index, containerIndex);
        this.notificationService.success('Saved', `Storage arrival row ${containerIndex + 1} saved successfully.`);
        this.store.dispatch(ShipmentActions.submitClearanceFinalSuccess({ index }));
      },
      error: (error) => {
        this.savingRowKey.set(null);
        this.notificationService.error('Save failed', error.error?.message || 'Could not save storage arrival row.');
      }
    });
  }

  /**
   * POINT 13: Save all arrival rows for a shipment at once (global save).
   * Single-row save is preserved alongside this.
   */
  async saveAllArrivalRows(shipmentIndex: number): Promise<void> {
    if (this.isStorageArrivalLocked(shipmentIndex)) return;
    this.ensureAccordionOpen(shipmentIndex);
    this.setShipmentTab(shipmentIndex, 'arrival');
    const group = this.formArray.at(shipmentIndex) as FormGroup | null;
    if (!group) return;

    const containerId = group.get('containerId')?.value;
    if (!containerId) {
      this.notificationService.warn('Missing container', 'This shipment row is not linked to a container yet.');
      return;
    }

    const containers = this.getContainersArray(group);
    if (containers.length === 0) {
      this.notificationService.info('No rows', 'No storage arrival rows to save.');
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: `Save all ${containers.length} storage arrival row(s) for this shipment?`,
      header: 'Save All Storage Arrival',
      acceptLabel: 'Yes, Save All',
    });
    if (!confirmed) return;

    this.savingAllRows.set(true);
    this.saveAllProgress.set({ current: 0, total: containers.length });

    const missingRows: string[] = [];
    const storageSplits = containers.map((control, containerIndex) => {
      const row = control as FormGroup;
      const receivedOnDate = row.get('receivedOnDate')?.value;
      const receivedOnTime = row.get('receivedOnTime')?.value;
      const grn = String(row.get('grn')?.value || '').trim();
      const batch = String(row.get('batch')?.value || '').trim();
      const productionDate = row.get('productionDate')?.value;
      const expiryDate = row.get('expiryDate')?.value;

      const missingArrivalFields: string[] = [];
      if (!receivedOnDate) missingArrivalFields.push('Received On Date');
      if (!receivedOnTime) missingArrivalFields.push('Received On Time');
      if (!grn) missingArrivalFields.push('GRN #');
      if (!batch) missingArrivalFields.push('Batch #');
      if (!productionDate) missingArrivalFields.push('Production Date');
      if (!expiryDate) missingArrivalFields.push('Expiry Date');

      if (missingArrivalFields.length > 0) {
        missingRows.push(`Row ${containerIndex + 1}: ${missingArrivalFields.join(', ')}`);
      }

      return {
        containerSerialNo: row.get('containerSerialNo')?.value || '',
        bags: Number(row.get('bags')?.value) || 0,
        warehouse: row.get('warehouse')?.value || '',
        storageAvailability: Number(row.get('storageAvailability')?.value) || 0,
        receivedOnDate: this.toDate(receivedOnDate),
        receivedOnTime: this.toTime(receivedOnTime),
        customsInspection: row.get('customsInspection')?.value || 'No',
        grn,
        batch,
        productionDate: this.toDate(productionDate),
        expiryDate: this.toDate(expiryDate),
        remarks: row.get('remarks')?.value || '',
        documentUrl: row.get('documentUrl')?.value || '',
        documentName: row.get('documentName')?.value || '',
      };
    });

    if (missingRows.length > 0) {
      this.savingAllRows.set(false);
      this.saveAllProgress.set(null);
      this.notificationService.error('Required Fields Missing', missingRows.join(' | '));
      return;
    }

    const payload = new FormData();
    payload.append('storageSplits', JSON.stringify(storageSplits));

    const globalFile = this.getGlobalFile(shipmentIndex);
    if (globalFile) {
      payload.append('storageDocument', globalFile, globalFile.name);
    }

    containers.forEach((_, containerIndex) => {
      const rowFile = this.getRowFile(shipmentIndex, containerIndex);
      if (rowFile) {
        payload.append(`storageSplits_${containerIndex}_document`, rowFile, rowFile.name);
      }
    });

    this.shipmentService.submitStorageDetails(containerId, payload).subscribe({
      next: (response) => {
        const actual = (response as any)?.container?.actual;
        this.applyActualOverride(shipmentIndex, actual);
        this.patchStorageArrivalFromActual(shipmentIndex, actual);
        this.storageArrivalStatusOverrides.update((current) => ({ ...current, [shipmentIndex]: 'pending_warehouse_manager' }));
        containers.forEach((_, containerIndex) => {
          if (this.getRowFile(shipmentIndex, containerIndex)) {
            this.clearRowFile(shipmentIndex, containerIndex);
          }
        });
        if (globalFile) {
          this.clearGlobalFile(shipmentIndex);
        }
        this.saveAllProgress.set({ current: containers.length, total: containers.length });
        this.savingAllRows.set(false);
        this.saveAllProgress.set(null);
        this.notificationService.success('All Saved', `${containers.length} storage arrival row(s) saved successfully.`);
        this.store.dispatch(ShipmentActions.submitClearanceFinalSuccess({ index: shipmentIndex }));
      },
      error: (error) => {
        this.savingAllRows.set(false);
        this.saveAllProgress.set(null);
        this.notificationService.error('Save failed', error.error?.message || 'Could not save storage arrival rows.');
      }
    });
  }
}
