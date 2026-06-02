import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import {
  TransportationCompanyService,
  TransportationCompany,
} from '../../../core/services/transportation-company.service';

@Component({
  selector: 'app-transportation-management',
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
          <h1 class="text-2xl font-bold text-slate-900">Transportation Companies</h1>
          <p class="text-slate-500 mt-1">Manage transport companies used in shipment logistics</p>
        </div>
        <button
          pButton
          label="Add Company"
          icon="pi pi-plus"
          class="p-button-primary"
          (click)="openAddDialog()">
        </button>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
        <p-table
          [value]="companies()"
          [loading]="loading()"
          responsiveLayout="scroll"
          styleClass="p-datatable-sm"
          [rows]="15"
          [paginator]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">Company Name</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">Contact Person</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">Phone</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider text-center">Status</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider text-right px-6">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-company>
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
              <td class="py-4 font-semibold text-slate-800">{{ company.name }}</td>
              <td class="py-4 text-slate-600">{{ company.contactPerson || '–' }}</td>
              <td class="py-4 text-slate-600 font-mono text-sm">{{ company.phone || '–' }}</td>
              <td class="py-4 text-center">
                <span
                  [class]="company.status === 'Active'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'"
                  class="px-3 py-1 rounded-full text-xs font-semibold border">
                  {{ company.status }}
                </span>
              </td>
              <td class="py-4 text-right px-6">
                <div class="flex justify-end gap-2">
                  <button pButton icon="pi pi-pencil"
                    class="p-button-text p-button-sm p-button-info hover:bg-blue-50"
                    (click)="openEditDialog(company)">
                  </button>
                  <button pButton icon="pi pi-trash"
                    class="p-button-text p-button-sm p-button-danger hover:bg-red-50"
                    (click)="confirmDelete(company)">
                  </button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5" class="p-16 text-center text-slate-400">
                <i class="pi pi-truck text-5xl mb-4 block opacity-20"></i>
                <p class="text-lg font-semibold mb-2">No transportation companies yet</p>
                <p class="text-sm">Click "Add Company" to create one.</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>

    <!-- Add / Edit Dialog -->
    <p-dialog
      [(visible)]="displayDialog"
      [header]="editing() ? 'Edit Transportation Company' : 'Add Transportation Company'"
      [modal]="true"
      [style]="{width: '480px'}"
      class="p-fluid">
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-5 pt-4">

        <div class="field">
          <label class="block text-sm font-bold text-slate-800 mb-2">Company Name <span class="text-red-500">*</span></label>
          <input pInputText formControlName="name" placeholder="e.g. Al Futtaim Logistics" class="w-full" />
          @if (form.get('name')?.invalid && form.get('name')?.touched) {
            <small class="text-red-500 mt-1 block">Company name is required.</small>
          }
        </div>

        <div class="field">
          <label class="block text-sm font-bold text-slate-800 mb-2">Contact Person</label>
          <input pInputText formControlName="contactPerson" placeholder="e.g. Ahmed Al Rashid" class="w-full" />
        </div>

        <div class="field">
          <label class="block text-sm font-bold text-slate-800 mb-2">Phone</label>
          <input pInputText formControlName="phone" placeholder="e.g. +971 50 123 4567" class="w-full" />
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

    <p-confirmDialog header="Delete Company" icon="pi pi-exclamation-triangle"></p-confirmDialog>
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
export class TransportationManagementComponent implements OnInit {
  private svc = inject(TransportationCompanyService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  readonly companies = signal<TransportationCompany[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editing = signal<TransportationCompany | null>(null);

  displayDialog = false;

  readonly form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    contactPerson: [''],
    phone: [''],
    status: ['Active', Validators.required],
  });

  readonly statusOptions = [
    { label: 'Active', value: 'Active' },
    { label: 'Inactive', value: 'Inactive' },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.svc.getAll().subscribe({
      next: (data) => { this.companies.set(data); this.loading.set(false); },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not load transportation companies' });
        this.loading.set(false);
      },
    });
  }

  openAddDialog(): void {
    this.editing.set(null);
    this.form.reset({ status: 'Active' });
    this.displayDialog = true;
  }

  openEditDialog(company: TransportationCompany): void {
    this.editing.set(company);
    this.form.patchValue(company);
    this.displayDialog = true;
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const payload = this.form.value;
    const current = this.editing();

    const request$ = current?._id
      ? this.svc.update(current._id, payload)
      : this.svc.create(payload);

    request$.subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: current ? 'Updated' : 'Created',
          detail: `Transportation company ${current ? 'updated' : 'added'} successfully`,
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

  confirmDelete(company: TransportationCompany): void {
    this.confirmationService.confirm({
      message: `Are you sure you want to delete "${company.name}"?`,
      accept: () => {
        if (!company._id) return;
        this.svc.delete(company._id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Company removed' });
            this.load();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Delete failed', detail: 'Could not delete company' });
          },
        });
      },
    });
  }
}
