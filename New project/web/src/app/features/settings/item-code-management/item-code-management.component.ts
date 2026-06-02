import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ItemService } from '../../../core/services/item.service';
import { Item } from '../../../core/models/item.model';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-item-code-management',
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
    <div class="p-6">
      <!-- Tab Navigation -->
      <div class="mb-6 flex flex-wrap items-center gap-3">
        <a
          routerLink="/settings/warehouses"
          routerLinkActive="!bg-slate-900 !text-white"
          [routerLinkActiveOptions]="{exact: true}"
          class="px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <i class="pi pi-warehouse mr-2"></i>
          Warehouses
        </a>
        <a
          routerLink="/settings/item-codes"
          routerLinkActive="!bg-slate-900 !text-white"
          [routerLinkActiveOptions]="{exact: true}"
          class="px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <i class="pi pi-box mr-2"></i>
          Items
        </a>
        <a
          routerLink="/settings/transportation"
          routerLinkActive="!bg-slate-900 !text-white"
          [routerLinkActiveOptions]="{exact: true}"
          class="px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <i class="pi pi-truck mr-2"></i>
          Transportation
        </a>
        <a
          routerLink="/settings/exchange-rates"
          routerLinkActive="!bg-slate-900 !text-white"
          [routerLinkActiveOptions]="{exact: true}"
          class="px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <i class="pi pi-dollar mr-2"></i>
          Exchange Rates
        </a>
      </div>

      <!-- Page Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Item Management</h1>
          <p class="text-slate-500 mt-1">Create, edit and maintain items</p>
        </div>
        <button pButton label="Add Item" icon="pi pi-plus" (click)="openAddDialog()"></button>
      </div>

      <!-- Table Card -->
      <div class="rounded-lg border border-slate-200 bg-white shadow overflow-hidden">
        <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" responsiveLayout="scroll">
          <ng-template pTemplate="header">
            <tr>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">Item Code</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">Description</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">Packing</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">HS Code</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider text-center">Status</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider text-right px-6">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-item>
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
              <td class="py-4 font-semibold text-slate-800">{{ item.itemCode }}</td>
              <td class="py-4 text-slate-700">{{ item.description }}</td>
              <td class="py-4 text-slate-600">{{ item.packing || '—' }}</td>
              <td class="py-4 text-slate-600 font-mono text-sm">{{ item.hsCode || '—' }}</td>
              <td class="py-4 text-center">
                <span 
                  [class]="(item.status || 'Active') === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'"
                  class="px-3 py-1 rounded-full text-xs font-semibold border">
                  {{ item.status || 'Active' }}
                </span>
              </td>
              <td class="py-4 text-right px-6">
                <div class="flex justify-end gap-2">
                  <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm" (click)="openEditDialog(item)"></button>
                  <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger" (click)="confirmDelete(item)"></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="6" class="p-12 text-center text-slate-400">
                <i class="pi pi-box text-4xl mb-3 block opacity-20"></i>
                <p class="text-base font-semibold mb-1">No items found</p>
                <p class="text-sm">Click "Add Item" to create one.</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>

    <p-dialog [(visible)]="displayDialog" [header]="editingItem() ? 'Edit Item' : 'Add Item'" [modal]="true" [style]="{ width: '640px' }">
      <form [formGroup]="itemForm" (ngSubmit)="saveItem()" class="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
        <div class="md:col-span-2">
          <label class="mb-2 block text-sm font-semibold text-slate-700">Item Code *</label>
          <input pInputText formControlName="itemCode" placeholder="e.g. RICE-001" class="w-full" />
        </div>
        <div class="md:col-span-2">
          <label class="mb-2 block text-sm font-semibold text-slate-700">Description *</label>
          <input pInputText formControlName="description" placeholder="e.g. Basmati Rice Premium" class="w-full" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-semibold text-slate-700">Packing</label>
          <input pInputText formControlName="packing" placeholder="e.g. 25kg bags" class="w-full" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-semibold text-slate-700">Bag Weight (Kg)</label>
          <p-inputNumber formControlName="bagWeightKg" placeholder="25" styleClass="w-full"></p-inputNumber>
        </div>
        <div>
          <label class="mb-2 block text-sm font-semibold text-slate-700">Unit</label>
          <input pInputText formControlName="unit" placeholder="Bag" class="w-full" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-semibold text-slate-700">HS Code</label>
          <input pInputText formControlName="hsCode" placeholder="e.g. 1006.30" class="w-full" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-semibold text-slate-700">Brand</label>
          <input pInputText formControlName="brand" placeholder="e.g. Royal" class="w-full" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-semibold text-slate-700">Status</label>
          <p-select [options]="statusOptions" formControlName="status" optionLabel="label" optionValue="value" placeholder="Select Status" styleClass="w-full"></p-select>
        </div>
        <div class="md:col-span-2 mt-3 flex justify-end gap-3 pt-3 border-t border-slate-200">
          <button type="button" pButton class="p-button-text p-button-secondary" label="Cancel" (click)="displayDialog = false"></button>
          <button type="submit" pButton [disabled]="itemForm.invalid || saving()" [label]="editingItem() ? 'Update' : 'Save'"></button>
        </div>
      </form>
    </p-dialog>

    <p-confirmDialog header="Delete Item"></p-confirmDialog>
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
  `]
})
export class ItemCodeManagementComponent implements OnInit {
  private itemService = inject(ItemService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  items = signal<Item[]>([]);
  loading = signal(false);
  saving = signal(false);
  displayDialog = false;
  editingItem = signal<Item | null>(null);

  itemForm: FormGroup = this.fb.group({
    itemCode: ['', Validators.required],
    description: ['', Validators.required],
    packing: [''],
    bagWeightKg: [null],
    unit: ['Bag'],
    hsCode: [''],
    brand: [''],
    status: ['Active', Validators.required],
  });

  statusOptions = [
    { label: 'Active', value: 'Active' },
    { label: 'Inactive', value: 'Inactive' },
  ];

  ngOnInit(): void {
    this.loadItems();
  }

  loadItems(): void {
    this.loading.set(true);
    this.itemService.getAllItems(1, 200).subscribe({
      next: (response) => {
        this.items.set(response.items || []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not load items' });
      },
    });
  }

  openAddDialog(): void {
    this.editingItem.set(null);
    this.itemForm.reset({ unit: 'Bag', status: 'Active' });
    this.displayDialog = true;
  }

  openEditDialog(item: Item): void {
    this.editingItem.set(item);
    this.itemForm.patchValue(item);
    this.displayDialog = true;
  }

  saveItem(): void {
    if (this.itemForm.invalid) return;
    this.saving.set(true);

    const payload = this.itemForm.value;
    const editing = this.editingItem();
    const request$ = editing?._id
      ? this.itemService.updateItem(editing._id, payload)
      : this.itemService.createItem(payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.displayDialog = false;
        this.loadItems();
        this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Item saved successfully' });
      },
      error: (error) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: error.error?.message || 'Could not save item' });
      },
    });
  }

  confirmDelete(item: Item): void {
    this.confirmationService.confirm({
      message: `Delete item ${item.itemCode}?`,
      accept: () => {
        if (!item._id) return;
        this.itemService.deleteItem(item._id).subscribe({
          next: () => {
            this.loadItems();
            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Item deleted' });
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not delete item' });
          },
        });
      },
    });
  }
}
