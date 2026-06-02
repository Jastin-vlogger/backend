import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ExchangeRateService, ExchangeRate } from '../../../core/services/exchange-rate.service';
import { AuthService } from '../../../core/services/auth.service';
import { RbacService } from '../../../core/services/rbac.service';

@Component({
  selector: 'app-exchange-rate-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-6 max-w-[1600px] mx-auto">

      <!-- Tab Navigation -->
      <div class="mb-6 flex flex-wrap items-center gap-3">
        <a routerLink="/settings/warehouses" routerLinkActive="!bg-slate-900 !text-white"
          [routerLinkActiveOptions]="{exact: true}"
          class="px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
          <i class="pi pi-warehouse mr-2"></i>Warehouses
        </a>
        <a routerLink="/settings/item-codes" routerLinkActive="!bg-slate-900 !text-white"
          [routerLinkActiveOptions]="{exact: true}"
          class="px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
          <i class="pi pi-box mr-2"></i>Items
        </a>
        <a routerLink="/settings/transportation" routerLinkActive="!bg-slate-900 !text-white"
          [routerLinkActiveOptions]="{exact: true}"
          class="px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
          <i class="pi pi-truck mr-2"></i>Transportation
        </a>
        <a routerLink="/settings/exchange-rates" routerLinkActive="!bg-slate-900 !text-white"
          [routerLinkActiveOptions]="{exact: true}"
          class="px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
          <i class="pi pi-dollar mr-2"></i>Exchange Rates
        </a>
      </div>

      <!-- Page Header -->
      <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Bank Exchange Rates</h1>
          <p class="text-slate-500 mt-1">
            Manage AED/USD exchange rates per bank. The <strong>Direct</strong> rate is the default when no bank is selected.
          </p>
        </div>
        @if (canEditExchangeRates()) {
          <button pButton label="Add Rate" icon="pi pi-plus" class="p-button-primary" (click)="openAddDialog()"></button>
        }
      </div>

      <!-- Info banner -->
      <div class="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
        <i class="pi pi-info-circle text-blue-500 mt-0.5 shrink-0"></i>
        <p class="text-sm text-blue-700">
          When creating a shipment, selecting a bank will use that bank's rate for AED calculations.
          If no bank is selected, the <strong>Direct</strong> rate is used automatically.
        </p>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
        <p-table
          [value]="rates()"
          [loading]="loading()"
          responsiveLayout="scroll"
          styleClass="p-datatable-sm"
          [rows]="20"
          [paginator]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">Bank / Source</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider text-right">Rate (AED per USD)</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider text-center">Type</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider text-center">Status</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider text-right px-6">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-rate>
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
              <td class="py-4 font-semibold text-slate-800">
                <div class="flex items-center gap-2">
                  {{ rate.bankName }}
                  @if (rate.isDefault) {
                    <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700">Default</span>
                  }
                </div>
              </td>
              <td class="py-4 text-right font-mono font-bold text-slate-800">{{ rate.rate | number:'1.2-4' }}</td>
              <td class="py-4 text-center">
                <span class="text-[10px] font-semibold text-slate-500">
                  {{ rate.isDefault ? 'Direct / Fallback' : 'Bank' }}
                </span>
              </td>
              <td class="py-4 text-center">
                <span
                  [class]="rate.status === 'Active'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'"
                  class="px-3 py-1 rounded-full text-xs font-semibold border">
                  {{ rate.status }}
                </span>
              </td>
              <td class="py-4 text-right px-6">
                <div class="flex justify-end gap-2">
                  @if (canEditExchangeRates()) {
                    <button pButton icon="pi pi-pencil"
                      class="p-button-text p-button-sm p-button-info hover:bg-blue-50"
                      (click)="openEditDialog(rate)">
                    </button>
                  }
                  @if (canEditExchangeRates() && !rate.isDefault) {
                    <button pButton icon="pi pi-trash"
                      class="p-button-text p-button-sm p-button-danger hover:bg-red-50"
                      (click)="confirmDelete(rate)">
                    </button>
                  }
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5" class="p-16 text-center text-slate-400">
                <i class="pi pi-dollar text-5xl mb-4 block opacity-20"></i>
                <p class="text-lg font-semibold mb-2">No exchange rates yet</p>
                <p class="text-sm">Click "Add Rate" to create one.</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>

    <!-- Add / Edit Dialog -->
    <p-dialog
      [(visible)]="displayDialog"
      [header]="editing() ? 'Edit Exchange Rate' : 'Add Exchange Rate'"
      [modal]="true"
      [style]="{width: '440px'}"
      class="p-fluid">
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-5 pt-4">

        <div class="field">
          <label class="block text-sm font-bold text-slate-800 mb-2">
            Bank Name <span class="text-red-500">*</span>
          </label>
          <input
            pInputText
            formControlName="bankName"
            placeholder="e.g. ADIB, RAK BANK, ENBD"
            class="w-full"
            [readonly]="!!editing()?.isDefault" />
          @if (editing()?.isDefault) {
            <small class="text-slate-400 mt-1 block">The Direct rate name cannot be changed.</small>
          }
          @if (form.get('bankName')?.invalid && form.get('bankName')?.touched) {
            <small class="text-red-500 mt-1 block">Bank name is required.</small>
          }
        </div>

        <div class="field">
          <label class="block text-sm font-bold text-slate-800 mb-2">
            Exchange Rate (AED per 1 USD) <span class="text-red-500">*</span>
          </label>
          <p-inputNumber
            formControlName="rate"
            [minFractionDigits]="2"
            [maxFractionDigits]="6"
            [min]="0.0001"
            placeholder="e.g. 3.6725"
            styleClass="w-full"
            inputStyleClass="w-full" />
          <small class="text-slate-400 mt-1 block">1 USD = [rate] AED</small>
          @if (form.get('rate')?.invalid && form.get('rate')?.touched) {
            <small class="text-red-500 mt-1 block">A valid positive rate is required.</small>
          }
        </div>

        <div class="field">
          <label class="block text-sm font-bold text-slate-800 mb-2">Status</label>
          <p-select
            [options]="statusOptions"
            formControlName="status"
            placeholder="Select status"
            styleClass="w-full">
          </p-select>
        </div>

        <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
          <button type="button" pButton label="Cancel"
            class="p-button-text p-button-secondary"
            (click)="displayDialog = false">
          </button>
          <button type="submit" pButton
            [label]="editing() ? 'Update' : 'Save'"
            class="p-button-primary shadow-md"
            [disabled]="form.invalid || saving()">
          </button>
        </div>
      </form>
    </p-dialog>

    <p-confirmDialog header="Delete Exchange Rate" icon="pi pi-exclamation-triangle"></p-confirmDialog>
    <p-toast></p-toast>
  `,
  styles: [`
    :host ::ng-deep .p-datatable .p-datatable-thead > tr > th {
      border-bottom: 2px solid #e2e8f0;
    }
    :host ::ng-deep .p-paginator {
      border-top: 2px solid #e2e8f0;
      background: #f8fafc;
    }
  `],
})
export class ExchangeRateManagementComponent implements OnInit {
  private svc = inject(ExchangeRateService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private authService = inject(AuthService);
  private rbacService = inject(RbacService);

  readonly rates = signal<ExchangeRate[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editing = signal<ExchangeRate | null>(null);

  displayDialog = false;

  readonly form: FormGroup = this.fb.group({
    bankName: ['', Validators.required],
    rate: [null, [Validators.required, Validators.min(0.0001)]],
    status: ['Active', Validators.required],
  });

  readonly statusOptions = [
    { label: 'Active', value: 'Active' },
    { label: 'Inactive', value: 'Inactive' },
  ];

  canEditExchangeRates(): boolean {
    return this.authService.isAdminLevelRole() || this.rbacService.hasPermission('settings.tab.exchange_rates.edit');
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.svc.getAll().subscribe({
      next: (data) => { this.rates.set(data); this.loading.set(false); },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not load exchange rates' });
        this.loading.set(false);
      },
    });
  }

  openAddDialog(): void {
    if (!this.canEditExchangeRates()) return;
    this.editing.set(null);
    this.form.reset({ status: 'Active' });
    this.form.get('bankName')?.enable();
    this.displayDialog = true;
  }

  openEditDialog(rate: ExchangeRate): void {
    if (!this.canEditExchangeRates()) return;
    this.editing.set(rate);
    this.form.patchValue({ bankName: rate.bankName, rate: rate.rate, status: rate.status });
    if (rate.isDefault) {
      this.form.get('bankName')?.disable();
    } else {
      this.form.get('bankName')?.enable();
    }
    this.displayDialog = true;
  }

  save(): void {
    if (!this.canEditExchangeRates()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const payload = this.form.getRawValue();
    const current = this.editing();

    const request$ = current?._id
      ? this.svc.update(current._id, payload)
      : this.svc.create(payload);

    request$.subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: current ? 'Updated' : 'Created',
          detail: `Exchange rate ${current ? 'updated' : 'added'} successfully`,
        });
        this.load();
        this.displayDialog = false;
        this.saving.set(false);
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Save failed', detail: err.error?.message || 'Error occurred' });
        this.saving.set(false);
      },
    });
  }

  confirmDelete(rate: ExchangeRate): void {
    if (!this.canEditExchangeRates()) return;
    this.confirmationService.confirm({
      message: `Delete exchange rate for "${rate.bankName}"?`,
      accept: () => {
        if (!rate._id) return;
        this.svc.delete(rate._id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Exchange rate removed' });
            this.load();
          },
          error: (err) => {
            this.messageService.add({ severity: 'error', summary: 'Delete failed', detail: err.error?.message || 'Could not delete' });
          },
        });
      },
    });
  }
}
