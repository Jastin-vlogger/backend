import { Component, Input, computed, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, AbstractControl } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { AccordionModule } from 'primeng/accordion';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { selectShipmentData } from '../../../../../../store/shipment/shipment.selectors';
import * as ShipmentActions from '../../../../../../store/shipment/shipment.actions';
import { ShipmentService } from '../../../../../../core/services/shipment.service';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { ConfirmDialogService } from '../../../../../../core/services/confirm-dialog.service';

type QualityDocKind = 'inhouse' | 'strategic' | 'thirdParty' | 'attachment' | 'report';

@Component({
  selector: 'app-shipment-quality',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AccordionModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TableModule,
  ],
  templateUrl: './shipment-quality.component.html',
  styleUrls: ['./shipment-quality.component.scss'],
})
export class ShipmentQualityComponent {
  @Input({ required: true }) formArray!: FormArray;
  @Input() visibleShipmentIndices: number[] = [];

  @ViewChild('qualityDocInput') qualityDocInputRef?: ElementRef<HTMLInputElement>;

  private fb = inject(FormBuilder);
  private sanitizer = inject(DomSanitizer);
  private store = inject(Store);
  private shipmentService = inject(ShipmentService);
  private notificationService = inject(NotificationService);
  private confirmDialog = inject(ConfirmDialogService);

  readonly shipmentData = toSignal(this.store.select(selectShipmentData));
  readonly phaseOptions = [
    { label: 'S1', value: 'S1' },
    { label: 'S2', value: 'S2' },
    { label: 'S3', value: 'S3' },
  ];

  private pendingUpload:
    | { shipmentIndex: number; rowIndex: number; kind: QualityDocKind; table: 'qualityRows' | 'qualityReports' }
    | null = null;

  readonly uploadedFiles = signal<Record<string, File | null>>({});
  readonly savingRowIndex = signal<number | null>(null);
  readonly actualOverrides = signal<Record<number, any>>({});

  hasVisibleShipments(): boolean {
    return this.visibleShipmentIndices.length > 0;
  }

  shouldShowShipment(index: number): boolean {
    return this.visibleShipmentIndices.includes(index);
  }

  showPreviewModal = signal(false);
  previewUrl = signal<string | null>(null);
  previewTitle = signal('');
  previewIsImage = signal(false);
  previewSafeUrl = computed(() => {
    const url = this.previewUrl();
    if (!url || this.previewIsImage()) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  getShipmentNoLabel(index: number): string {
    if (this.formArray?.controls[index] == null) return '–';
    const base = this.shipmentData()?.shipment?.shipmentNo?.replace(/\([^)]*\)/g, '').trim();
    return base?.trim() ? `${base}-${index + 1}` : '–';
  }

  getQualityRows(group: AbstractControl): FormArray {
    return (group as FormGroup).get('qualityRows') as FormArray;
  }

  getQualityReports(group: AbstractControl): FormArray {
    return (group as FormGroup).get('qualityReports') as FormArray;
  }

  getPrimaryQualityRow(group: AbstractControl): FormGroup | null {
    const rows = this.getQualityRows(group);
    return (rows?.at(0) as FormGroup) || null;
  }

  addQualityRow(group: AbstractControl): void {
    const rows = this.getQualityRows(group);
    rows.push(
      this.fb.group({
        sn: [rows.length + 1],
        sampleNo: [''],
        phase: ['S1'],
        purpose: [''],
        date: [null],
        inhouseReportNo: [''],
        inhouseReportDate: [null],
        inhouseReportDocumentUrl: [''],
        inhouseReportDocumentName: [''],
        strategicReportNo: [''],
        strategicReportDate: [null],
        strategicReportDocumentUrl: [''],
        strategicReportDocumentName: [''],
        thirdPartyReportNo: [''],
        thirdPartyReportDate: [null],
        thirdPartyReportDocumentUrl: [''],
        thirdPartyReportDocumentName: [''],
        remarks: [''],
        attachmentDocumentUrl: [''],
        attachmentDocumentName: [''],
      })
    );
  }

  removeQualityRow(group: AbstractControl, rowIndex: number): void {
    const rows = this.getQualityRows(group);
    if (rows.length <= 1) return;
    rows.removeAt(rowIndex);
    rows.controls.forEach((ctrl, idx) => {
      (ctrl as FormGroup).get('sn')?.setValue(idx + 1, { emitEvent: false });
    });
  }

  addQualityReportRow(group: AbstractControl): void {
    const rows = this.getQualityReports(group);
    rows.push(
      this.fb.group({
        phase: ['S1'],
        reportDate: [null],
        remarks: [''],
        documentUrl: [''],
        documentName: [''],
      })
    );
  }

  removeQualityReportRow(group: AbstractControl, rowIndex: number): void {
    const rows = this.getQualityReports(group);
    if (rows.length <= 1) return;
    rows.removeAt(rowIndex);
  }

  private key(shipmentIndex: number, rowIndex: number, kind: QualityDocKind, table: 'qualityRows' | 'qualityReports'): string {
    return `${shipmentIndex}:${table}:${rowIndex}:${kind}`;
  }

  getFile(shipmentIndex: number, rowIndex: number, kind: QualityDocKind, table: 'qualityRows' | 'qualityReports'): File | null {
    return this.uploadedFiles()[this.key(shipmentIndex, rowIndex, kind, table)] ?? null;
  }

  clickFileInput(shipmentIndex: number, rowIndex: number, kind: QualityDocKind, table: 'qualityRows' | 'qualityReports'): void {
    this.pendingUpload = { shipmentIndex, rowIndex, kind, table };
    this.qualityDocInputRef?.nativeElement?.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && this.pendingUpload) {
      const { shipmentIndex, rowIndex, kind, table } = this.pendingUpload;
      const key = this.key(shipmentIndex, rowIndex, kind, table);
      this.uploadedFiles.update((cur) => ({ ...cur, [key]: file }));
    }
    this.pendingUpload = null;
    input.value = '';
  }

  clearFile(shipmentIndex: number, rowIndex: number, kind: QualityDocKind, table: 'qualityRows' | 'qualityReports'): void {
    const key = this.key(shipmentIndex, rowIndex, kind, table);
    this.uploadedFiles.update((cur) => ({ ...cur, [key]: null }));
  }

  getSavedUrl(row: AbstractControl, kind: QualityDocKind, table: 'qualityRows' | 'qualityReports'): string {
    if (table === 'qualityReports') {
      return row.get('documentUrl')?.value || '';
    }
    const controlName =
      kind === 'inhouse'
        ? 'inhouseReportDocumentUrl'
        : kind === 'strategic'
          ? 'strategicReportDocumentUrl'
          : kind === 'thirdParty'
            ? 'thirdPartyReportDocumentUrl'
            : 'attachmentDocumentUrl';
    return row.get(controlName)?.value || '';
  }

  getSavedName(row: AbstractControl, kind: QualityDocKind, table: 'qualityRows' | 'qualityReports'): string {
    if (table === 'qualityReports') {
      return row.get('documentName')?.value || '';
    }
    const controlName =
      kind === 'inhouse'
        ? 'inhouseReportDocumentName'
        : kind === 'strategic'
          ? 'strategicReportDocumentName'
          : kind === 'thirdParty'
            ? 'thirdPartyReportDocumentName'
            : 'attachmentDocumentName';
    return row.get(controlName)?.value || '';
  }

  openRemoteDocumentPreview(url: string, title: string): void {
    this.previewUrl.set(url);
    this.previewTitle.set(title);
    this.previewIsImage.set(/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url));
    this.showPreviewModal.set(true);
  }

  hasS1Report(): boolean {
    return !!this.shipmentData()?.shipment?.s1QualityReportUrl;
  }

  getQ1ReportData(): any {
    return this.shipmentData()?.shipment?.q1Report || null;
  }

  /** Returns quality_parameters array from q1Report if present */
  getQ1QualityParameters(): string[] {
    const q1 = this.getQ1ReportData();
    const params = q1?.quality_parameters;
    if (!params) return [];
    if (Array.isArray(params)) return params.map((p: any) => String(p));
    if (typeof params === 'string') return params.split(',').map((s: string) => s.trim()).filter(Boolean);
    return [];
  }

  /** Returns quality_parameters as structured rows (array of objects with criteria etc.) */
  getQ1QualityParameterRows(): Array<{ sNo: number; criteria: string; preferredStandard: string; actual: string; remark: string }> {
    const q1 = this.getQ1ReportData();
    const params = q1?.quality_parameters;
    if (!Array.isArray(params)) return [];
    return params.map((p: any, i: number) => ({
      sNo: p.s_no ?? i + 1,
      criteria: p.criteria || '—',
      preferredStandard: p.preferred_standard || '—',
      actual: p.actual != null ? String(p.actual) : '—',
      remark: p.remark || '—',
    }));
  }

  /** Returns purpose from sample_details */
  getQ1Purpose(): string {
    const q1 = this.getQ1ReportData();
    return q1?.sample_details?.purpose || '';
  }

  /** Returns cooking_result from q1Report — handles both string and object formats */
  getQ1CookingResult(): string {
    const q1 = this.getQ1ReportData();
    if (!q1?.cooking_result) return '';
    const cr = q1.cooking_result;
    // Handle object: { result_options: "...", selected_result: "NORMAL" }
    if (typeof cr === 'object' && cr !== null) {
      return String(cr.selected_result || '');
    }
    return String(cr);
  }

  /** Returns cooking result options string */
  getQ1CookingResultOptions(): string {
    const q1 = this.getQ1ReportData();
    const cr = q1?.cooking_result;
    if (typeof cr === 'object' && cr !== null) {
      return String(cr.result_options || '');
    }
    return '';
  }

  /** Returns remarks from q1Report if present */
  getQ1Remarks(): string {
    const q1 = this.getQ1ReportData();
    return q1?.remarks || q1?.analysis_details?.remarks || '';
  }

  /** Returns analysis date + time from q1Report */
  getQ1AnalysisDateTime(): string {
    const q1 = this.getQ1ReportData();
    const date = q1?.analysis_details?.date || '';
    const time = q1?.analysis_details?.time || '';
    if (!date) return '';
    return time ? `${date}, ${time}` : date;
  }

  openS1Report(): void {
    const url = this.shipmentData()?.shipment?.s1QualityReportUrl;
    const name = this.shipmentData()?.shipment?.s1QualityReportName || 'S1 Quality Report';
    if (!url) return;
    this.openRemoteDocumentPreview(url, name);
  }

  openDocumentPreview(file: File, title: string): void {
    this.previewUrl.set(URL.createObjectURL(file));
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

  private applyActualOverride(index: number, actual: any): void {
    if (!actual) return;
    this.actualOverrides.update((current) => ({ ...current, [index]: actual }));
  }

  private clearUploadedFilesForShipment(index: number): void {
    const prefix = `${index}:`;
    this.uploadedFiles.update((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(prefix)))
    );
  }

  private patchQualityFromActual(index: number, actual: any): void {
    const group = this.formArray.at(index) as FormGroup | null;
    if (!group || !actual) return;

    const qualityRows = this.getQualityRows(group);
    const actualRows = Array.isArray(actual.qualityRows) ? actual.qualityRows : [];
    while (qualityRows.length < actualRows.length) {
      this.addQualityRow(group);
    }
    while (qualityRows.length > Math.max(actualRows.length, 1)) {
      qualityRows.removeAt(qualityRows.length - 1);
    }

    qualityRows.controls.forEach((control, rowIndex) => {
      const saved = actualRows[rowIndex];
      if (!saved) return;
      (control as FormGroup).patchValue(
        {
          sn: Number(saved.sn) || rowIndex + 1,
          sampleNo: saved.sampleNo || '',
          phase: saved.phase || 'S1',
          purpose: saved.purpose || '',
          date: saved.date ? new Date(saved.date) : null,
          inhouseReportNo: saved.inhouseReportNo || '',
          inhouseReportDate: saved.inhouseReportDate ? new Date(saved.inhouseReportDate) : null,
          inhouseReportDocumentUrl: saved.inhouseReportDocumentUrl || '',
          inhouseReportDocumentName: saved.inhouseReportDocumentName || '',
          strategicReportNo: saved.strategicReportNo || '',
          strategicReportDate: saved.strategicReportDate ? new Date(saved.strategicReportDate) : null,
          strategicReportDocumentUrl: saved.strategicReportDocumentUrl || '',
          strategicReportDocumentName: saved.strategicReportDocumentName || '',
          thirdPartyReportNo: saved.thirdPartyReportNo || '',
          thirdPartyReportDate: saved.thirdPartyReportDate ? new Date(saved.thirdPartyReportDate) : null,
          thirdPartyReportDocumentUrl: saved.thirdPartyReportDocumentUrl || '',
          thirdPartyReportDocumentName: saved.thirdPartyReportDocumentName || '',
          remarks: saved.remarks || '',
          attachmentDocumentUrl: saved.attachmentDocumentUrl || '',
          attachmentDocumentName: saved.attachmentDocumentName || '',
        },
        { emitEvent: false }
      );
    });

    const qualityReports = this.getQualityReports(group);
    const actualReports = Array.isArray(actual.qualityReports) ? actual.qualityReports : [];
    while (qualityReports.length < actualReports.length) {
      this.addQualityReportRow(group);
    }
    while (qualityReports.length > Math.max(actualReports.length, 1)) {
      qualityReports.removeAt(qualityReports.length - 1);
    }

    qualityReports.controls.forEach((control, rowIndex) => {
      const saved = actualReports[rowIndex];
      if (!saved) return;
      (control as FormGroup).patchValue(
        {
          phase: saved.phase || 'S1',
          reportDate: saved.reportDate ? new Date(saved.reportDate) : null,
          remarks: saved.remarks || '',
          documentUrl: saved.documentUrl || '',
          documentName: saved.documentName || '',
        },
        { emitEvent: false }
      );
    });
  }

  async saveRow(index: number): Promise<void> {
    const group = this.formArray.at(index) as FormGroup | null;
    if (!group) return;

    const containerId = group.get('containerId')?.value;
    if (!containerId) {
      this.notificationService.warn('Missing container', 'This shipment row is not linked to a container yet.');
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: `Save quality details for Shipment ${index + 1}?`,
      header: 'Save Quality',
      acceptLabel: 'Yes, Save',
    });
    if (!confirmed) return;

    // Validate required quality fields
    const qualityRowControls = this.getQualityRows(group).controls;
    const invalidQualityRows: number[] = [];
    qualityRowControls.forEach((rowCtrl, rowIdx) => {
      const phase = String(rowCtrl.get('phase')?.value || '').trim();
      const date = rowCtrl.get('date')?.value;
      const attachmentUrl = rowCtrl.get('attachmentDocumentUrl')?.value;
      const attachmentFile = this.getFile(index, rowIdx, 'attachment', 'qualityRows');
      if (!phase || !date || (!attachmentUrl && !attachmentFile)) {
        invalidQualityRows.push(rowIdx + 1);
      }
    });
    if (invalidQualityRows.length > 0) {
      this.notificationService.error('Required Fields Missing', `Rows ${invalidQualityRows.join(', ')}: Phase, Date, and Attachment are required.`);
      return;
    }

    const toDate = (value: unknown) =>
      value ? new Date(value as string | Date).toISOString().split('T')[0] : '';

    const qualityRows = this.getQualityRows(group).controls.map((row, rowIndex) => ({
      sn: Number(row.get('sn')?.value) || rowIndex + 1,
      sampleNo: row.get('sampleNo')?.value || '',
      phase: row.get('phase')?.value || 'S1',
      date: toDate(row.get('date')?.value),
      inhouseReportNo: row.get('inhouseReportNo')?.value || '',
      inhouseReportDate: toDate(row.get('inhouseReportDate')?.value),
      inhouseReportDocumentUrl: row.get('inhouseReportDocumentUrl')?.value || '',
      inhouseReportDocumentName: row.get('inhouseReportDocumentName')?.value || '',
      strategicReportNo: row.get('strategicReportNo')?.value || '',
      strategicReportDate: toDate(row.get('strategicReportDate')?.value),
      strategicReportDocumentUrl: row.get('strategicReportDocumentUrl')?.value || '',
      strategicReportDocumentName: row.get('strategicReportDocumentName')?.value || '',
      thirdPartyReportNo: row.get('thirdPartyReportNo')?.value || '',
      thirdPartyReportDate: toDate(row.get('thirdPartyReportDate')?.value),
      thirdPartyReportDocumentUrl: row.get('thirdPartyReportDocumentUrl')?.value || '',
      thirdPartyReportDocumentName: row.get('thirdPartyReportDocumentName')?.value || '',
      remarks: row.get('remarks')?.value || '',
      attachmentDocumentUrl: row.get('attachmentDocumentUrl')?.value || '',
      attachmentDocumentName: row.get('attachmentDocumentName')?.value || '',
    }));

    const formData = new FormData();
    formData.append('qualityRows', JSON.stringify(qualityRows));
    formData.append('qualityReports', JSON.stringify([]));

    this.getQualityRows(group).controls.forEach((row, rowIndex) => {
      const inhouse = this.getFile(index, rowIndex, 'inhouse', 'qualityRows');
      const strategic = this.getFile(index, rowIndex, 'strategic', 'qualityRows');
      const thirdParty = this.getFile(index, rowIndex, 'thirdParty', 'qualityRows');
      const attachment = this.getFile(index, rowIndex, 'attachment', 'qualityRows');
      if (inhouse) formData.append(`qualityRows_${rowIndex}_inhouse`, inhouse, inhouse.name);
      if (strategic) formData.append(`qualityRows_${rowIndex}_strategic`, strategic, strategic.name);
      if (thirdParty) formData.append(`qualityRows_${rowIndex}_thirdParty`, thirdParty, thirdParty.name);
      if (attachment) formData.append(`qualityRows_${rowIndex}_attachment`, attachment, attachment.name);
    });

    this.savingRowIndex.set(index);
    this.shipmentService.submitQualityDetails(containerId, formData).subscribe({
      next: (response) => {
        this.applyActualOverride(index, response?.container?.actual);
        this.patchQualityFromActual(index, response?.container?.actual);
        this.clearUploadedFilesForShipment(index);
        this.savingRowIndex.set(null);
        this.notificationService.success('Saved', 'Quality details saved successfully.');
        this.store.dispatch(ShipmentActions.submitGRNSuccess({ index }));
      },
      error: (error) => {
        this.savingRowIndex.set(null);
        this.notificationService.error('Save failed', error.error?.message || 'Could not save quality details.');
      }
    });
  }
}
