import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, AbstractControl, FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { selectShipmentData, selectIsPlannedLocked } from '../../../../../../store/shipment/shipment.selectors';
import { ShipmentService } from '../../../../../../core/services/shipment.service';
import * as ShipmentActions from '../../../../../../store/shipment/shipment.actions';
import { RbacService } from '../../../../../../core/services/rbac.service';
import { ExchangeRateService } from '../../../../../../core/services/exchange-rate.service';
import { getComputedShipmentStatus, getShipmentStatusSeverity, type ShipmentStatusSeverity } from '../../shared/shipment-status';

@Component({
  selector: 'app-shipment-summary',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, InputNumberModule, InputTextModule, SelectModule],
  templateUrl: './shipment-summary.component.html',
})
export class ShipmentSummaryComponent {
  @Input({ required: true }) plannedContainersControl!: AbstractControl;

  private store = inject(Store);
  private sanitizer = inject(DomSanitizer);
  private shipmentService = inject(ShipmentService);
  private rbacService = inject(RbacService);
  private exchangeRateService = inject(ExchangeRateService);

  readonly shipmentData = toSignal(this.store.select(selectShipmentData));
  readonly isPlannedLocked = toSignal(this.store.select(selectIsPlannedLocked), { initialValue: false });
  readonly canEditSupplierEmail = computed(() => this.rbacService.hasPermission('shipment.field.shipment_entry.supplierEmail.edit'));
  readonly canViewQuantityFinancialSummary = computed(() =>
    this.rbacService.hasPermission('shipment.field.shipment_entry.quantityFinancialSummary.view')
  );
  readonly canViewBankName = computed(() => this.rbacService.hasPermission('shipment.field.shipment_entry.bankName.view'));
  readonly canEditBankName = computed(() => this.rbacService.hasPermission('shipment.field.shipment_entry.bankName.edit'));

  // ── Document preview ──────────────────────────────────────────────────────
  readonly showPreviewModal = signal(false);
  readonly previewUrl = signal<string | null>(null);
  readonly previewTitle = signal('');
  readonly previewIsImage = signal(false);
  readonly previewZoom = signal(1);
  readonly previewTransformOrigin = signal('center center');
  readonly previewSafeUrl = computed(() => {
    const url = this.previewUrl();
    if (!url || this.previewIsImage()) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  // ── Vendor Email Inline Edit ──────────────────────────────────────────────
  readonly editingEmail = signal(false);
  readonly emailDraft = signal('');
  readonly emailSaving = signal(false);
  readonly emailError = signal<string | null>(null);
  readonly editingBankName = signal(false);
  readonly bankNameDraft = signal('');
  readonly bankNameSaving = signal(false);
  readonly bankNameError = signal<string | null>(null);
  readonly bankOptions = signal<Array<{ label: string; value: string }>>([]);

  constructor() {
    this.exchangeRateService.getActive().subscribe({
      next: (rates) => {
        this.bankOptions.set(
          rates
            .filter((rate) => !rate.isDefault)
            .map((rate) => ({ label: rate.bankName, value: rate.bankName }))
        );
      },
      error: () => {
        this.bankOptions.set([]);
      },
    });
  }

  startEmailEdit(): void {
    if (!this.canEditSupplierEmail()) return;
    this.emailDraft.set(this.shipmentData()?.shipment?.supplierEmail || '');
    this.emailError.set(null);
    this.editingEmail.set(true);
  }

  cancelEmailEdit(): void {
    this.editingEmail.set(false);
    this.emailError.set(null);
  }

  saveEmail(): void {
    const email = this.emailDraft().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.emailError.set('Please enter a valid email address.');
      return;
    }
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (!shipmentId) return;

    this.emailSaving.set(true);
    this.emailError.set(null);
    this.shipmentService.updateSupplierEmail(shipmentId, email).subscribe({
      next: () => {
        this.emailSaving.set(false);
        this.editingEmail.set(false);
        this.store.dispatch(ShipmentActions.loadShipmentDetail({ id: shipmentId }));
      },
      error: (err) => {
        this.emailSaving.set(false);
        this.emailError.set(err?.error?.message || 'Failed to update email. Please try again.');
      },
    });
  }

  startBankNameEdit(): void {
    if (!this.canEditBankName()) return;
    this.bankNameDraft.set(this.shipmentData()?.shipment?.bankName || '');
    this.bankNameError.set(null);
    this.editingBankName.set(true);
  }

  cancelBankNameEdit(): void {
    this.editingBankName.set(false);
    this.bankNameError.set(null);
  }

  saveBankName(): void {
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (!shipmentId) return;

    this.bankNameSaving.set(true);
    this.bankNameError.set(null);
    this.shipmentService.updateBankName(shipmentId, this.bankNameDraft().trim()).subscribe({
      next: () => {
        this.bankNameSaving.set(false);
        this.editingBankName.set(false);
        this.store.dispatch(ShipmentActions.loadShipmentDetail({ id: shipmentId }));
      },
      error: (err) => {
        this.bankNameSaving.set(false);
        this.bankNameError.set(err?.error?.message || 'Failed to update bank name. Please try again.');
      },
    });
  }

  // ── Document preview methods ──────────────────────────────────────────────
  openDocument(url?: string | null, title = 'Document'): void {
    if (!url) return;
    this.previewUrl.set(url);
    this.previewTitle.set(title);
    this.previewIsImage.set(this.isImageUrl(url));
    this.resetPreviewZoom();
    this.showPreviewModal.set(true);
  }

  closePreviewModal(): void {
    this.showPreviewModal.set(false);
    this.previewUrl.set(null);
    this.previewTitle.set('');
    this.previewIsImage.set(false);
    this.resetPreviewZoom();
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

  private isImageUrl(url: string): boolean {
    const clean = url.split('?')[0].toLowerCase();
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(clean);
  }

  // ── Data helpers ──────────────────────────────────────────────────────────
  getNoOfShipmentsLabel(): string {
    const value = this.shipmentData()?.shipment?.noOfShipments ?? 0;
    return value > 0 ? String(value) : 'Not Created Yet';
  }

  getShipmentStatuses(): Array<{ shipmentNo: string; status: string; badge: ShipmentStatusSeverity }> {
    const data = this.shipmentData();
    const planned = data?.planned || [];
    const actual = data?.actual || [];
    const shipmentNo = data?.shipment?.shipmentNo?.replace(/\([^)]*\)/g, '').trim() || '';
    const baseShipmentNo = shipmentNo.match(/^(RHST-\d+\/[A-Z0-9-]+)/i)?.[1] || shipmentNo || 'Shipment';
    const shipmentCount = Math.max(
      Number(data?.shipment?.noOfShipments) || 0,
      planned.length,
      actual.length
    );

    return Array.from({ length: shipmentCount }, (_, index) => {
      const row = actual[index];
      const plannedRow = planned[index];
      const status =
        row?.shipmentStatus ||
        plannedRow?.shipmentStatus ||
        getComputedShipmentStatus({
          shipmentCurrentStage: data?.shipment?.currentStage,
          plannedRow,
          actualRow: row,
          fallbackStageLabel:
            row?.paymentCostings?.length || row?.packagingExpenses?.length
              ? 'Payment & Costing'
              : row?.qualityRows?.length || row?.qualityReports?.length
                ? 'Quality'
                : row?.storageSplits?.length
                  ? 'Storage Allocation & Arrival'
                  : row?.transportationBooked?.length || row?.arrivalNoticeDate || row?.customsClearanceDate
                    ? 'Port & Customs Clearance'
                    : row?.documentsReleasedDate || row?.receiver
                      ? 'Document Tracker'
                      : row?.BLNo
                        ? 'BL Details'
                        : plannedRow
                          ? 'Shipment Tracker'
                          : 'Shipment Entry',
        });

      const rowShipmentNo = shipmentCount > 1 ? `${baseShipmentNo}-${index + 1}` : baseShipmentNo;

      return {
        shipmentNo: rowShipmentNo,
        status,
        badge: getShipmentStatusSeverity(status),
      };
    });
  }

  getStatusBadgeClass(badge: ShipmentStatusSeverity): string {
    if (badge === 'success') return 'bg-emerald-50 text-emerald-700';
    if (badge === 'info') return 'bg-sky-50 text-sky-700';
    if (badge === 'secondary') return 'bg-slate-100 text-slate-700';
    return 'bg-amber-50 text-amber-700';
  }

  getLineItems() {
    return this.shipmentData()?.shipment?.lineItems || [];
  }
}
