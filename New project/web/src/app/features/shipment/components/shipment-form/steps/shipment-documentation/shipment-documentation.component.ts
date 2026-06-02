import { Component, Input, Output, EventEmitter, inject, effect, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormArray, AbstractControl, FormGroup } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { ConfirmDialogService } from '../../../../../../core/services/confirm-dialog.service';
import { RbacService } from '../../../../../../core/services/rbac.service';
import { ShipmentService } from '../../../../../../core/services/shipment.service';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { AccordionModule } from 'primeng/accordion';
import { DialogModule } from 'primeng/dialog';
import {
  selectShipmentData,
  selectSubmittedActualIndices,
  selectSubmittedStep3Indices,
  selectSubmittingRowIndex,
} from '../../../../../../store/shipment/shipment.selectors';
import * as ShipmentActions from '../../../../../../store/shipment/shipment.actions';
import { getComputedShipmentStatus, getShipmentStatusSeverity, type ShipmentStatusSeverity } from '../../shared/shipment-status';

@Component({
  selector: 'app-shipment-documentation',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    DatePickerModule,
    SelectModule,
    AccordionModule,
    DialogModule,
  ],
  providers: [],
  templateUrl: './shipment-documentation.component.html',
  styles: [`
    .primary-milestone-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      border-radius: 0.75rem;
      background-color: #3b82f6;
      padding: 0.625rem 1.25rem;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #ffffff;
      transition: all 0.2s ease-in-out;
      box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2);
      cursor: pointer;
    }
    .primary-milestone-btn:hover:not(:disabled) {
      background-color: #2563eb;
      transform: translateY(-1px);
      box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.25);
    }
    .primary-milestone-btn:active:not(:disabled) { transform: scale(0.98); }
    .primary-milestone-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .icon-btn-secondary {
      display: inline-flex;
      height: 2.5rem;
      width: 2.5rem;
      align-items: center;
      justify-content: center;
      border-radius: 0.5rem;
      border: 1px solid #e2e8f0;
      background-color: #ffffff;
      color: #64748b;
      transition: all 0.2s;
      cursor: pointer;
    }
    .icon-btn-secondary:hover { background-color: #f1f5f9; color: #3b82f6; border-color: #3b82f6; }

    .icon-btn-danger {
      display: inline-flex;
      height: 2.5rem;
      width: 2.5rem;
      align-items: center;
      justify-content: center;
      border-radius: 0.5rem;
      border: 1px solid #fee2e2;
      background-color: #fef2f2;
      color: #ef4444;
      transition: all 0.2s;
      cursor: pointer;
    }
    .icon-btn-danger:hover { background-color: #fee2e2; color: #dc2626; }

    @keyframes courierBounce {
      0%, 100% { transform: translateY(-50%) translateX(-50%) translateY(0); }
      50% { transform: translateY(-50%) translateX(-50%) translateY(-4px); }
    }
    .courier-parcel-bounce {
      animation: courierBounce 1.4s ease-in-out infinite;
    }
  `]
})
export class ShipmentDocumentationComponent {
  @Input({ required: true }) formArray!: FormArray;
  @Output() navigateToSplit = new EventEmitter<void>();

  @ViewChild('inwardAdviceFileInput') inwardAdviceFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('murabahaSubmittedFileInput') murabahaSubmittedFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('documentsReleasedFileInput') documentsReleasedFileInputRef?: ElementRef<HTMLInputElement>;

  /** Set right before programmatic .click() so (change) knows which row. */
  private pendingFileRow: number | null = null;
  private pendingFileKind: 'inwardAdvice' | 'murabahaSubmitted' | 'documentsReleased' | null = null;
  private restoredUiStateKey: string | null = null;

  private store = inject(Store);
  private confirmDialog = inject(ConfirmDialogService);
  private notificationService = inject(NotificationService);
  private sanitizer = inject(DomSanitizer);
  private rbacService = inject(RbacService);
  private shipmentService = inject(ShipmentService);

  private readonly DOCUMENT_MILESTONE_VIEW_KEYS: Record<string, string> = {
    courier: 'shipment.tab.document_tracker.milestone_1.view',
    receiving: 'shipment.tab.document_tracker.milestone_2.view',
    inward: 'shipment.tab.document_tracker.milestone_3.view',
    murabaha_process: 'shipment.tab.document_tracker.milestone_4.view',
    murabaha_submit: 'shipment.tab.document_tracker.milestone_5.view',
    release: 'shipment.tab.document_tracker.milestone_6.view',
  };

  private readonly DOCUMENT_MILESTONE_EDIT_KEYS: Record<string, string> = {
    courier: 'shipment.tab.document_tracker.milestone_1.edit',
    receiving: 'shipment.tab.document_tracker.milestone_2.edit',
    inward: 'shipment.tab.document_tracker.milestone_3.edit',
    murabaha_process: 'shipment.tab.document_tracker.milestone_4.edit',
    murabaha_submit: 'shipment.tab.document_tracker.milestone_5.edit',
    release: 'shipment.tab.document_tracker.milestone_6.edit',
  };

  canViewMilestone(milestone: string): boolean {
    const permissionKey = this.DOCUMENT_MILESTONE_VIEW_KEYS[milestone];
    return permissionKey ? this.rbacService.hasPermission(permissionKey) : false;
  }

  /** Returns true if the current user can edit the given milestone */
  canEditMilestone(milestone: string): boolean {
    const permissionKey = this.DOCUMENT_MILESTONE_EDIT_KEYS[milestone];
    return permissionKey ? this.rbacService.hasPermission(permissionKey) : false;
  }

  readonly shipmentData = toSignal(this.store.select(selectShipmentData));

  // Document preview modal
  showPreviewModal = signal(false);
  previewUrl = signal<string | null>(null);
  previewTitle = signal('');
  previewIsImage = signal(false);
  previewSafeUrl = computed(() => {
    const url = this.previewUrl();
    if (!url || this.previewIsImage()) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  readonly inwardAdviceFile = signal<Record<number, File | null>>({});
  readonly murabahaSubmittedFile = signal<Record<number, File | null>>({});
  readonly documentsReleasedFile = signal<Record<number, File | null>>({});
  readonly statusModalVisible = signal(false);
  readonly statusModalShipmentIndex = signal<number | null>(null);
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
  
  // Dropdown Options
  readonly receiverOptions = [
    { label: 'Direct', value: 'Direct' },
    { label: 'Bank', value: 'Bank' }
  ];

  readonly bankOptions = [
    { label: 'ADIB', value: 'ADIB' },
    { label: 'RAK BANK', value: 'RAK BANK' },
    { label: 'ENBD', value: 'ENBD' },
    { label: 'FAB', value: 'FAB' },
    { label: 'HSBC', value: 'HSBC' },
    { label: 'MASHREQ', value: 'MASHREQ' },
    { label: 'OTHERS', value: 'OTHERS' }
  ];

  // Track which accordion panels are open so they stay open after milestone saves
  readonly openAccordionPanels = signal<string[]>([]);
  // Per-row and per-milestone edit states
  readonly editingMilestones = signal<Record<number, Record<string, boolean>>>({});
  readonly savedMilestoneOverrides = signal<Record<number, Record<string, boolean>>>({});
  readonly savingMilestone = signal<{row: number, milestone: string} | null>(null);

  // POINT 10: Bulk save modal state
  readonly bulkSaveModalVisible = signal(false);
  readonly bulkSaveRowIndex = signal<number | null>(null);
  readonly bulkSaving = signal(false);

  openBulkSaveModal(index: number): void {
    this.bulkSaveRowIndex.set(index);
    this.bulkSaveModalVisible.set(true);
  }

  closeBulkSaveModal(): void {
    this.bulkSaveModalVisible.set(false);
    this.bulkSaveRowIndex.set(null);
  }

  async executeBulkSave(index: number): Promise<void> {
    const milestones = ['courier', 'receiving', 'inward', 'murabaha_process', 'murabaha_submit', 'release'];
    const group = this.formArray.at(index) as FormGroup;
    if (!group) return;

    const editableMilestones = milestones.filter(m =>
      this.isMilestoneVisible(index, m, group) &&
      this.canEditMilestone(m) &&
      !this.isMilestoneSaved(index, m)
    );

    if (editableMilestones.length === 0) {
      this.notificationService.info('Nothing to save', 'All visible milestones are already saved.');
      this.closeBulkSaveModal();
      return;
    }

    this.bulkSaving.set(true);
    let savedCount = 0;

    for (const milestone of editableMilestones) {
      if (this.isMilestoneSectionValid(index, milestone)) {
        await this.saveMilestoneQuiet(index, milestone);
        savedCount++;
      }
    }

    this.bulkSaving.set(false);
    this.closeBulkSaveModal();

    if (savedCount > 0) {
      this.notificationService.success('Bulk Save Complete', `${savedCount} milestone(s) saved successfully.`);
    }
  }

  /** Save a milestone without confirmation dialog (used in bulk save) */
  private async saveMilestoneQuiet(index: number, milestone: string): Promise<void> {
    const request = this.buildMilestoneRequest(index, milestone);
    if (!request?.containerId) return;

    this.savingMilestone.set({ row: index, milestone });
    this.ensureAccordionOpen(`doc-${index}`);
    return new Promise<void>((resolve) => {
      this.shipmentService.submitDocumentationPayment(request.containerId, request.payload).subscribe({
        next: (response) => {
          this.applyDocumentationResponse(index, response?.container?.actual, milestone);
          resolve();
        },
        error: () => {
          this.savingMilestone.set(null);
          resolve();
        },
      });
    });
  }

  /** Checks if a specific milestone has data saved from the server (Source of Truth). */
  isMilestoneSaved(index: number, milestone: string): boolean {
    if (this.savedMilestoneOverrides()[index]?.[milestone]) {
      return true;
    }
    const shipment = this.shipmentData()?.actual?.[index];
    if (!shipment) return false;

    switch (milestone) {
      case 'courier':
        return !!(shipment.courierTrackNo || shipment.courierServiceProvider || shipment.docArrivalNotes);
      case 'receiving':
        return !!(shipment.expectedDocDate || (shipment.receiver && shipment.bankName));
      case 'inward':
        return !!(shipment.inwardCollectionAdviceDate || shipment.inwardCollectionAdviceDocumentUrl);
      case 'murabaha_process':
        return !!(shipment.murabahaContractReleasedDate || shipment.murabahaContractApprovedDate);
      case 'murabaha_submit':
        return !!(shipment.murabahaContractSubmittedDate || shipment.murabahaContractSubmittedDocumentUrl);
      case 'release':
        return !!(shipment.documentsReleasedDate || shipment.documentsReleasedDocumentUrl);
      default:
        return false;
    }
  }

  isMilestoneEditing(index: number, milestone: string): boolean {
    if (!this.canEditMilestone(milestone)) return false;
    const rowEditing = this.editingMilestones()[index];
    if (rowEditing?.[milestone]) return true;
    return !this.isMilestoneSaved(index, milestone);
  }

  isMilestoneVisible(index: number, milestone: string, group: FormGroup): boolean {
    if (!this.canViewMilestone(milestone)) return false;
    const hasMilestone1 =
      String(group.get('BLNo')?.value || '').trim().length > 0 &&
      String(group.get('courierTrackNo')?.value || '').trim().length > 0 &&
      String(group.get('courierServiceProvider')?.value || '').trim().length > 0;
    const hasMilestone2 = this.isMilestoneFilled(group, 'receiving');
    const isBank = this.isBankReceiver(group);

    // For Direct receiver: skip milestones 3, 4, 5 — go straight to 6 after M2
    // For Bank receiver: full chain M1 → M2 → M3 → M4 → M5 → M6

    if (milestone === 'receiving') return hasMilestone1;

    if (milestone === 'inward') {
      // Only show for Bank receiver
      return hasMilestone2 && isBank;
    }

    if (milestone === 'murabaha_process') {
      // Only show for Bank receiver, after inward is filled
      return isBank && this.isMilestoneFilled(group, 'inward');
    }

    if (milestone === 'murabaha_submit') {
      // Only show for Bank receiver, after murabaha_process is filled
      return isBank && this.isMilestoneFilled(group, 'murabaha_process');
    }

    if (milestone === 'release') {
      if (!hasMilestone2) return false;
      if (isBank) {
        // Bank: require murabaha_submit to be filled before release
        return this.isMilestoneFilled(group, 'murabaha_submit');
      }
      // Direct: show release directly after M2 is filled
      return true;
    }

    return true;
  }

  hasEditableVisibleMilestones(index: number, group: FormGroup): boolean {
    const milestones = ['courier', 'receiving', 'inward', 'murabaha_process', 'murabaha_submit', 'release'];
    return milestones.some((milestone) =>
      this.isMilestoneVisible(index, milestone, group) &&
      this.canEditMilestone(milestone)
    );
  }

  private isMilestoneFilled(group: FormGroup, milestone: string): boolean {
    switch (milestone) {
      case 'receiving':
        return String(group.get('receiver')?.value || '').trim().length > 0;
      case 'inward':
        return !!group.get('inwardCollectionAdviceDate')?.value || !!this.getSavedFileUrl(group, 'inwardAdvice');
      case 'murabaha_process':
        return !!group.get('murabahaContractReleasedDate')?.value || !!group.get('murabahaContractApprovedDate')?.value;
      case 'murabaha_submit':
        return !!group.get('murabahaContractSubmittedDate')?.value || !!this.getSavedFileUrl(group, 'murabahaSubmitted');
      case 'release':
        return !!group.get('documentsReleasedDate')?.value || !!this.getSavedFileUrl(group, 'documentsReleased');
      default:
        return false;
    }
  }

  toggleEditMilestone(index: number, milestone: string, editing: boolean = true): void {
    this.editingMilestones.update(current => {
      const row = current[index] || {};
      return {
        ...current,
        [index]: { ...row, [milestone]: editing }
      };
    });
    this.persistUiState();
  }

  onFilesSelected(event: Event, containerIndex: number, kind: 'inwardAdvice' | 'murabahaSubmitted' | 'documentsReleased'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    const targetSignal =
      kind === 'inwardAdvice'
        ? this.inwardAdviceFile
        : kind === 'murabahaSubmitted'
          ? this.murabahaSubmittedFile
          : this.documentsReleasedFile;

    targetSignal.update((current) => ({
      ...current,
      [containerIndex]: file,
    }));

    input.value = '';
  }

  clickFileInput(index: number, kind: 'inwardAdvice' | 'murabahaSubmitted' | 'documentsReleased'): void {
    this.pendingFileRow = index;
    this.pendingFileKind = kind;
    const refs = {
      inwardAdvice: this.inwardAdviceFileInputRef,
      murabahaSubmitted: this.murabahaSubmittedFileInputRef,
      documentsReleased: this.documentsReleasedFileInputRef,
    };
    const el = refs[kind]?.nativeElement;
    if (el) el.click();
  }

  onFileInputChange(event: Event, kind: 'inwardAdvice' | 'murabahaSubmitted' | 'documentsReleased'): void {
    const row = this.pendingFileRow;
    if (row !== null && this.pendingFileKind === kind) this.onFilesSelected(event, row, kind);
    this.pendingFileRow = null;
    this.pendingFileKind = null;
  }

  getFile(containerIndex: number, kind: 'inwardAdvice' | 'murabahaSubmitted' | 'documentsReleased'): File | null {
    const source =
      kind === 'inwardAdvice'
        ? this.inwardAdviceFile()
        : kind === 'murabahaSubmitted'
          ? this.murabahaSubmittedFile()
          : this.documentsReleasedFile();
    return source[containerIndex] ?? null;
  }

  clearFile(containerIndex: number, kind: 'inwardAdvice' | 'murabahaSubmitted' | 'documentsReleased'): void {
    const targetSignal =
      kind === 'inwardAdvice'
        ? this.inwardAdviceFile
        : kind === 'murabahaSubmitted'
          ? this.murabahaSubmittedFile
          : this.documentsReleasedFile;

    targetSignal.update((current) => ({
      ...current,
      [containerIndex]: null,
    }));
  }

  getSavedFileUrl(group: AbstractControl, kind: 'inwardAdvice' | 'murabahaSubmitted' | 'documentsReleased'): string {
    const controlName =
      kind === 'inwardAdvice'
        ? 'inwardCollectionAdviceDocumentUrl'
        : kind === 'murabahaSubmitted'
          ? 'murabahaContractSubmittedDocumentUrl'
          : 'documentsReleasedDocumentUrl';
    return group.get(controlName)?.value || '';
  }

  getSavedFileName(group: AbstractControl, kind: 'inwardAdvice' | 'murabahaSubmitted' | 'documentsReleased'): string {
    const controlName =
      kind === 'inwardAdvice'
        ? 'inwardCollectionAdviceDocumentName'
        : kind === 'murabahaSubmitted'
          ? 'murabahaContractSubmittedDocumentName'
          : 'documentsReleasedDocumentName';
    return group.get(controlName)?.value || '';
  }

  openRemoteDocumentPreview(url: string, title: string): void {
    this.previewUrl.set(url);
    this.previewTitle.set(title);
    this.previewIsImage.set(/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url));
    this.showPreviewModal.set(true);
  }

  openDocumentPreview(file: File, title: string): void {
    const url = URL.createObjectURL(file);
    this.previewUrl.set(url);
    this.previewTitle.set(title);
    this.previewIsImage.set(file.type.startsWith('image/'));
    this.showPreviewModal.set(true);
  }

  closeDocumentPreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
    this.previewTitle.set('');
    this.showPreviewModal.set(false);
  }

  onPreviewVisibleChange(visible: boolean): void {
    if (!visible) this.closeDocumentPreview();
  }

  getShipmentNoLabel(index: number): string {
    if (this.formArray?.controls[index] == null) return '–';
    const base = this.shipmentData()?.shipment?.shipmentNo?.replace(/\([^)]*\)/g, '').trim();
    const num = base?.trim() ? `${base}-${index + 1}` : '–';
    return num;
  }

  private normalizeAccordionValues(values: string | string[] | null | undefined): string[] {
    if (Array.isArray(values)) return values.filter(Boolean);
    if (typeof values === 'string' && values.trim()) return [values];
    return [];
  }

  private getUiStateStorageKey(): string | null {
    const shipmentId = this.shipmentData()?.shipment?._id;
    return shipmentId ? `shipment-documentation-ui:${shipmentId}` : null;
  }

  private persistUiState(): void {
    if (typeof window === 'undefined') return;
    const key = this.getUiStateStorageKey();
    if (!key) return;

    const state = {
      openAccordionPanels: this.normalizeAccordionValues(this.openAccordionPanels()),
      editingMilestones: this.editingMilestones(),
    };

    window.sessionStorage.setItem(key, JSON.stringify(state));
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
        editingMilestones?: Record<number, Record<string, boolean>> | null;
      };

      this.openAccordionPanels.set(this.normalizeAccordionValues(parsed.openAccordionPanels));
      this.editingMilestones.set(parsed.editingMilestones ?? {});
    } catch {
      window.sessionStorage.removeItem(key);
    }
  }

  /** Called when the accordion active value changes — keeps panels open after saves */
  onAccordionChange(values: string | string[] | null | undefined): void {
    const normalized = this.normalizeAccordionValues(values);

    // Prime can briefly emit an empty value while the form reloads after save.
    // Do not wipe the remembered open panels during that transient refresh.
    if (
      normalized.length === 0 &&
      (this.savingMilestone() !== null || this.submittingRowIndex() !== null)
    ) {
      return;
    }

    this.openAccordionPanels.set(normalized);
    this.persistUiState();
  }

  /** Open a specific accordion panel (called after milestone save to keep it open) */
  ensureAccordionOpen(panelValue: string): void {
    const current = this.normalizeAccordionValues(this.openAccordionPanels());
    if (!current.includes(panelValue)) {
      this.openAccordionPanels.set([...current, panelValue]);
      this.persistUiState();
    }
  }

  readonly submittedIndices = toSignal(this.store.select(selectSubmittedStep3Indices), { initialValue: [] });
  readonly precedingIndices = toSignal(this.store.select(selectSubmittedActualIndices), { initialValue: [] });
  readonly submittingRowIndex = toSignal(this.store.select(selectSubmittingRowIndex), { initialValue: null });

  constructor() {
    effect(() => {
      const data = this.shipmentData();
      if (!data || !this.formArray) return;
      this.formArray.controls.forEach((group) => {
        if (!group.get('bankName')?.value && data.shipment?.bankName) {
          group.get('bankName')?.patchValue(data.shipment.bankName, { emitEvent: false });
          if (!group.get('receiver')?.value) group.get('receiver')?.patchValue('Bank', { emitEvent: false });
        }
      });
    });

    effect(() => {
      const shipmentId = this.shipmentData()?.shipment?._id;
      if (!shipmentId || !this.formArray) return;
      this.restoreUiState();
    });

    effect(() => {
      const submittingIndex = this.submittingRowIndex();
      const currentSaving = this.savingMilestone();
      if (currentSaving && submittingIndex === null) {
        this.toggleEditMilestone(currentSaving.row, currentSaving.milestone, false);
        this.savingMilestone.set(null);
      }
    });

  }

  isPrecedingSubmitted(index: number): boolean {
    return this.precedingIndices().includes(index);
  }

  isRowSubmitted(index: number): boolean {
    return this.submittedIndices().includes(index);
  }

  isBankReceiver(group: FormGroup): boolean {
    const raw = group.get('receiver')?.value as any;
    const receiver =
      typeof raw === 'string'
        ? raw
        : typeof raw?.value === 'string'
          ? raw.value
          : typeof raw?.label === 'string'
            ? raw.label
            : '';
    return receiver.trim().toLowerCase() === 'bank';
  }

  getBlDocumentUrl(index: number): string {
    return this.shipmentData()?.actual?.[index]?.blDocumentUrl || '';
  }

  getBlDocumentName(index: number): string {
    return this.shipmentData()?.actual?.[index]?.blDocumentName || 'B/L Document';
  }

  isMilestoneSaving(index: number, milestone: string): boolean {
    const s = this.savingMilestone();
    return s?.row === index && s?.milestone === milestone;
  }

  /** Header shortcut: Saves the currently active/editing milestone. */
  saveActivePhase(index: number): void {
    const milestones = ['courier', 'receiving', 'inward', 'murabaha_process', 'murabaha_submit', 'release'];
    const activeMilestone = milestones.find(m => this.isMilestoneEditing(index, m));
    if (activeMilestone) {
      this.saveMilestone(index, activeMilestone);
    } else {
      this.notificationService.info('Information', 'No active phase to save.');
    }
  }

  isMilestoneSectionValid(index: number, milestone: string): boolean {
    const group = this.formArray.at(index) as FormGroup;
    if (!group) return false;

    // Check baseline requirement: BL Number
    if (!group.get('BLNo')?.value) {
      this.notificationService.error('Validation Error', 'B/L Number is required for any save action.');
      return false;
    }

    switch (milestone) {
      case 'courier': {
        const missing: string[] = [];
        if (!String(group.get('courierTrackNo')?.value || '').trim())
          missing.push('Courier Track No');
        if (!String(group.get('courierServiceProvider')?.value || '').trim())
          missing.push('Courier Provider');
        if (!String(group.get('docArrivalNotes')?.value || '').trim())
          missing.push('Document Arrival Notes');
        if (missing.length > 0) {
          this.notificationService.error('Required Fields Missing', `Please fill: ${missing.join(', ')}.`);
          return false;
        }
        return true;
      }
      case 'receiving': {
        const missing: string[] = [];
        if (!group.get('receiver')?.value)
          missing.push('Receiver');
        if (this.isBankReceiver(group) && !group.get('bankName')?.value)
          missing.push('Bank Name');
        if (!group.get('expectedDocDate')?.value)
          missing.push('Expected Date of Doc Arrival');
        if (missing.length > 0) {
          this.notificationService.error('Required Fields Missing', `Please fill: ${missing.join(', ')}.`);
          return false;
        }
        return true;
      }
      case 'inward': {
        const inwardDate = group.get('inwardCollectionAdviceDate')?.value;
        const inwardFile = this.getFile(index, 'inwardAdvice');
        const inwardSavedUrl = this.getSavedFileUrl(group, 'inwardAdvice');
        if (!inwardDate) {
          this.notificationService.error('Validation Error', 'Inward Collection Advice Date is required.');
          return false;
        }
        if (!inwardFile && !inwardSavedUrl) {
          this.notificationService.error('Validation Error', 'Inward Collection Advice document is required.');
          return false;
        }
        return true;
      }
      case 'murabaha_process': {
        const releasedDate = group.get('murabahaContractReleasedDate')?.value;
        const approvedDate = group.get('murabahaContractApprovedDate')?.value;
        const missingDates: string[] = [];
        if (!releasedDate) missingDates.push('Murabaha Contract Released Date');
        if (!approvedDate) missingDates.push('Murabaha Contract Approved Date');
        if (missingDates.length > 0) {
          this.notificationService.error('Required Fields Missing', `Please fill: ${missingDates.join(' and ')}.`);
          return false;
        }
        return true;
      }
      case 'murabaha_submit': {
        const submittedDate = group.get('murabahaContractSubmittedDate')?.value;
        const submittedFile = this.getFile(index, 'murabahaSubmitted');
        const submittedSavedUrl = this.getSavedFileUrl(group, 'murabahaSubmitted');
        if (!submittedDate) {
          this.notificationService.error('Validation Error', 'Contract Submission Date is required.');
          return false;
        }
        if (!submittedFile && !submittedSavedUrl) {
          this.notificationService.error('Validation Error', 'Contract Submission document is required.');
          return false;
        }
        return true;
      }
      case 'release': {
        const releasedDate = group.get('documentsReleasedDate')?.value;
        const releasedFile = this.getFile(index, 'documentsReleased');
        const releasedSavedUrl = this.getSavedFileUrl(group, 'documentsReleased');
        if (!releasedDate) {
          this.notificationService.error('Validation Error', 'Documents Release Date is required.');
          return false;
        }
        if (!releasedFile && !releasedSavedUrl) {
          this.notificationService.error('Validation Error', 'Documents Release document is required.');
          return false;
        }
        return true;
      }
      default:
        return true;
    }
  }

  async saveMilestone(index: number, milestone: string): Promise<void> {
    const row = this.formArray.at(index);
    if (!this.isPrecedingSubmitted(index)) {
      this.notificationService.warn('Step Blocked', 'Please complete the BL Details step first.');
      return;
    }

    if (!this.isMilestoneSectionValid(index, milestone)) return;

    const milestoneLabel: Record<string, string> = {
      courier: 'Courier Logistics',
      receiving: 'Receiver & Bank Setup',
      inward: 'Inward Collection Advice',
      murabaha_process: 'Murabaha Contract Phase',
      murabaha_submit: 'Contract Submission',
      release: 'Final Documents Release',
    };

    const confirmed = await this.confirmDialog.ask({
      message: `Save ${milestoneLabel[milestone] || milestone} for Shipment #${index + 1}?`,
      header: 'Save Milestone',
      acceptLabel: 'Yes, Save',
    });
    if (!confirmed) return;

    this.savingMilestone.set({ row: index, milestone });

    // Keep the accordion panel open after the save reloads data
    this.ensureAccordionOpen(`doc-${index}`);
    const request = this.buildMilestoneRequest(index, milestone);
    if (!request?.containerId) return;

    this.shipmentService.submitDocumentationPayment(request.containerId, request.payload).subscribe({
      next: (response) => {
        this.applyDocumentationResponse(index, response?.container?.actual, milestone);
        this.notificationService.success('Saved', `${milestoneLabel[milestone] || milestone} saved successfully.`);
      },
      error: (error) => {
        this.savingMilestone.set(null);
        this.notificationService.error('Save failed', error.error?.message || 'Could not save milestone.');
      },
    });
  }

  // Row-level save for legacy support
  async confirmSubmit(index: number): Promise<void> {
    if (!this.isMilestoneSectionValid(index, 'all')) return;
    const confirmed = await this.confirmDialog.ask({
      message: `Save all documentation for Shipment #${index + 1}?`,
      header: 'Save Documentation',
      acceptLabel: 'Yes, Save',
    });
    if (!confirmed) return;

    const row = this.formArray.at(index);
    const formValue = row.getRawValue();
    const payload = new FormData();
    const toDate = (v: any) => v ? (v instanceof Date ? v.toISOString().split('T')[0] : new Date(v).toISOString().split('T')[0]) : '';

    payload.append('BLNo', formValue['BLNo'] || '');
    payload.append('courierTrackNo', formValue['courierTrackNo'] || '');
    payload.append('courierServiceProvider', formValue['courierServiceProvider'] || '');
    payload.append('docArrivalNotes', formValue['docArrivalNotes'] || '');
    payload.append('expectedDocDate', toDate(formValue['expectedDocDate']));
    payload.append('receiver', formValue['receiver'] || '');
    payload.append('bankName', formValue['bankName'] || '');
    payload.append('inwardCollectionAdviceDate', toDate(formValue['inwardCollectionAdviceDate']));
    payload.append('murabahaContractReleasedDate', toDate(formValue['murabahaContractReleasedDate']));
    payload.append('murabahaContractApprovedDate', toDate(formValue['murabahaContractApprovedDate']));
    payload.append('murabahaContractSubmittedDate', toDate(formValue['murabahaContractSubmittedDate']));
    payload.append('documentsReleasedDate', toDate(formValue['documentsReleasedDate']));

    const fl1 = this.getFile(index, 'inwardAdvice');
    const fl2 = this.getFile(index, 'murabahaSubmitted');
    const fl3 = this.getFile(index, 'documentsReleased');
    if (fl1) payload.append('inwardCollectionAdviceDocument', fl1, fl1.name);
    if (fl2) payload.append('murabahaContractSubmittedDocument', fl2, fl2.name);
    if (fl3) payload.append('documentsReleasedDocument', fl3, fl3.name);

    this.savingMilestone.set({ row: index, milestone: 'all' });
    this.shipmentService.submitDocumentationPayment(formValue['containerId'], payload).subscribe({
      next: (response) => {
        this.applyDocumentationResponse(index, response?.container?.actual, 'all');
        this.notificationService.success('Saved', 'Documentation saved successfully.');
      },
      error: (error) => {
        this.savingMilestone.set(null);
        this.notificationService.error('Save failed', error.error?.message || 'Could not save documentation.');
      },
    });
  }

  private buildMilestoneRequest(index: number, milestone: string): { containerId: string; payload: FormData } | null {
    const row = this.formArray.at(index);
    const formValue = row.getRawValue();
    const containerId = formValue['containerId'];
    if (!containerId) return null;

    const toDate = (val: any) =>
      val ? (val instanceof Date ? val.toISOString().split('T')[0] : new Date(val).toISOString().split('T')[0]) : '';

    const payload = new FormData();
    payload.append('BLNo', formValue['BLNo'] || '');

    switch (milestone) {
      case 'courier':
        payload.append('courierTrackNo', formValue['courierTrackNo'] || '');
        payload.append('courierServiceProvider', formValue['courierServiceProvider'] || '');
        payload.append('DHL', formValue['courierTrackNo'] || '');
        payload.append('docArrivalNotes', formValue['docArrivalNotes'] || '');
        break;
      case 'receiving':
        payload.append('receiver', formValue['receiver'] || '');
        payload.append('bankName', formValue['bankName'] || '');
        payload.append('expectedDocDate', toDate(formValue['expectedDocDate']));
        break;
      case 'inward': {
        payload.append('inwardCollectionAdviceDate', toDate(formValue['inwardCollectionAdviceDate']));
        const inf = this.getFile(index, 'inwardAdvice');
        if (inf) payload.append('inwardCollectionAdviceDocument', inf, inf.name);
        break;
      }
      case 'murabaha_process':
        payload.append('murabahaContractReleasedDate', toDate(formValue['murabahaContractReleasedDate']));
        payload.append('murabahaContractApprovedDate', toDate(formValue['murabahaContractApprovedDate']));
        break;
      case 'murabaha_submit': {
        payload.append('murabahaContractSubmittedDate', toDate(formValue['murabahaContractSubmittedDate']));
        const msf = this.getFile(index, 'murabahaSubmitted');
        if (msf) payload.append('murabahaContractSubmittedDocument', msf, msf.name);
        break;
      }
      case 'release': {
        payload.append('documentsReleasedDate', toDate(formValue['documentsReleasedDate']));
        const drf = this.getFile(index, 'documentsReleased');
        if (drf) payload.append('documentsReleasedDocument', drf, drf.name);
        break;
      }
    }

    return { containerId, payload };
  }

  private applyDocumentationResponse(index: number, actual: any, milestone: string): void {
    const row = this.formArray.at(index) as FormGroup | null;
    if (!row || !actual) {
      this.savingMilestone.set(null);
      return;
    }

    row.patchValue({
      BLNo: actual.BLNo || '',
      courierTrackNo: actual.courierTrackNo || actual.DHL || '',
      courierServiceProvider: actual.courierServiceProvider || '',
      docArrivalNotes: actual.docArrivalNotes || '',
      expectedDocDate: actual.expectedDocDate ? new Date(actual.expectedDocDate) : null,
      receiver: actual.receiver || '',
      bankName: actual.bankName || '',
      inwardCollectionAdviceDate: actual.inwardCollectionAdviceDate ? new Date(actual.inwardCollectionAdviceDate) : null,
      inwardCollectionAdviceDocumentUrl: actual.inwardCollectionAdviceDocumentUrl || '',
      inwardCollectionAdviceDocumentName: actual.inwardCollectionAdviceDocumentName || '',
      murabahaContractReleasedDate: actual.murabahaContractReleasedDate ? new Date(actual.murabahaContractReleasedDate) : null,
      murabahaContractApprovedDate: actual.murabahaContractApprovedDate ? new Date(actual.murabahaContractApprovedDate) : null,
      murabahaContractSubmittedDate: actual.murabahaContractSubmittedDate ? new Date(actual.murabahaContractSubmittedDate) : null,
      murabahaContractSubmittedDocumentUrl: actual.murabahaContractSubmittedDocumentUrl || '',
      murabahaContractSubmittedDocumentName: actual.murabahaContractSubmittedDocumentName || '',
      documentsReleasedDate: actual.documentsReleasedDate ? new Date(actual.documentsReleasedDate) : null,
      documentsReleasedDocumentUrl: actual.documentsReleasedDocumentUrl || '',
      documentsReleasedDocumentName: actual.documentsReleasedDocumentName || '',
    }, { emitEvent: false });

    const milestoneKeys = milestone === 'all'
      ? ['courier', 'receiving', 'inward', 'murabaha_process', 'murabaha_submit', 'release']
      : [milestone];

    this.savedMilestoneOverrides.update((current) => {
      const rowState = current[index] || {};
      const next = { ...rowState };
      milestoneKeys.forEach((key) => {
        next[key] = true;
      });
      return { ...current, [index]: next };
    });

    if (milestoneKeys.includes('inward')) this.clearFile(index, 'inwardAdvice');
    if (milestoneKeys.includes('murabaha_submit')) this.clearFile(index, 'murabahaSubmitted');
    if (milestoneKeys.includes('release')) this.clearFile(index, 'documentsReleased');
    if (milestone !== 'all') this.toggleEditMilestone(index, milestone, false);

    this.savingMilestone.set(null);

    if (this.isDocumentationCompleteFromActual(actual) && !this.submittedIndices().includes(index)) {
      this.store.dispatch(ShipmentActions.submitDocumentationSuccess({ index }));
    }
  }

  private isDocumentationCompleteFromActual(actual: any): boolean {
    const receiver = String(actual?.receiver || '').trim().toLowerCase();
    const isDirect = receiver === 'direct';
    const hasCourier = !!(actual?.courierTrackNo || actual?.courierServiceProvider || actual?.docArrivalNotes);
    const hasReceiving = !!(actual?.expectedDocDate || (actual?.receiver && actual?.bankName));
    const hasRelease = !!(actual?.documentsReleasedDate || actual?.documentsReleasedDocumentUrl);
    if (isDirect) return hasCourier && hasReceiving && hasRelease;

    const hasInward = !!(actual?.inwardCollectionAdviceDate || actual?.inwardCollectionAdviceDocumentUrl);
    const hasMurabahaProcess = !!(actual?.murabahaContractReleasedDate || actual?.murabahaContractApprovedDate);
    const hasMurabahaSubmit = !!(actual?.murabahaContractSubmittedDate || actual?.murabahaContractSubmittedDocumentUrl);
    return hasCourier && hasReceiving && hasInward && hasMurabahaProcess && hasMurabahaSubmit && hasRelease;
  }

  openStatusModal(index: number): void {
    this.statusModalShipmentIndex.set(index);
    this.statusModalVisible.set(true);
  }

  onStatusModalVisibleChange(v: boolean): void {
    this.statusModalVisible.set(v);
    if (!v) this.statusModalShipmentIndex.set(null);
  }

  /**
   * Returns 0–100 progress for the courier animation.
   * For Direct receiver: 4 milestones (courier, receiving, release + courier delivery).
   * For Bank receiver: all 6 milestones.
   */
  getCourierProgressPercent(index: number): number {
    const group = this.formArray?.at(index) as FormGroup | null;
    const isBank = group ? this.isBankReceiver(group) : true;

    if (isBank) {
      const milestones = ['courier', 'receiving', 'inward', 'murabaha_process', 'murabaha_submit', 'release'];
      const completed = milestones.filter((m) => this.isMilestoneSaved(index, m)).length;
      return Math.round((completed / milestones.length) * 100);
    } else {
      // Direct path: courier, receiving, release
      const milestones = ['courier', 'receiving', 'release'];
      const completed = milestones.filter((m) => this.isMilestoneSaved(index, m)).length;
      return Math.round((completed / milestones.length) * 100);
    }
  }

  /** Returns true when all 6 milestones are saved (documents fully released). */
  isCourierDelivered(index: number): boolean {
    return this.getCourierProgressPercent(index) === 100;
  }

  getShipmentReachedStage(index: number): string {
    const shipment = this.shipmentData()?.actual?.[index];
    if (shipment?.paymentCostingDocumentUrl || shipment?.paymentAllocations?.length || shipment?.paymentCostings?.length) return 'Payment & Costing';
    if (shipment?.qualityRows?.length || shipment?.qualityReports?.length) return 'Quality';
    if (shipment?.storageSplits?.length) return 'Storage Allocation & Arrival';
    if (shipment?.arrivalOn || shipment?.arrivalNoticeDate || shipment?.arrivalNoticeDocumentUrl) return 'Port and Customs Clearance Tracker';
    if (this.submittedIndices().includes(index)) return 'Document Tracker';
    return 'Shipment Tracker';
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
    if (stageIndex <= 1) return true;
    if (stageIndex === 2) return this.precedingIndices().includes(index);
    if (stageIndex === 3) return this.submittedIndices().includes(index);
    const reached = this.getShipmentReachedStage(index);
    return stageIndex < this.shipmentStages.indexOf(reached as any);
  }

  isCurrentStageForShipment(index: number, stageIndex: number): boolean {
    return this.shipmentStages[stageIndex] === this.getShipmentReachedStage(index);
  }
}
