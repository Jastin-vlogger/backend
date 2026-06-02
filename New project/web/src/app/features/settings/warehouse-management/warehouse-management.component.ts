import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { WarehouseService, Warehouse, WarehouseStorekeeperOption } from '../../../core/services/warehouse.service';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { RbacService } from '../../../core/services/rbac.service';

@Component({
  selector: 'app-warehouse-management',
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
      <div class="mb-6 flex items-center gap-3">
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
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Warehouse Management</h1>
          <p class="text-slate-500 mt-1">Create, edit and manage storage locations</p>
        </div>
        @if (canEditWarehouses()) {
          <button 
            pButton 
            label="Add Warehouse" 
            icon="pi pi-plus" 
            class="p-button-primary"
            (click)="openAddDialog()">
          </button>
        }
      </div>

      <!-- Table Card -->
      <div class="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
        <p-table 
          [value]="warehouses()" 
          [loading]="loading()"
          responsiveLayout="scroll"
          styleClass="p-datatable-sm"
          [rows]="10"
          [paginator]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">Name</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">Code</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider">Storekeepers</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider text-center">Status</th>
              <th class="bg-slate-50 text-slate-700 font-semibold py-4 text-[11px] uppercase tracking-wider text-right px-6">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-warehouse>
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
              <td class="py-4 font-semibold text-slate-800">{{ warehouse.name }}</td>
              <td class="py-4 text-slate-600 font-mono text-sm">{{ warehouse.code || '–' }}</td>
              <td class="py-4 text-slate-600 text-sm">{{ getAssignedStorekeeperNames(warehouse) || '–' }}</td>
              <td class="py-4 text-center">
                <span 
                  [class]="warehouse.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'"
                  class="px-3 py-1 rounded-full text-xs font-semibold border">
                  {{ warehouse.status }}
                </span>
              </td>
              <td class="py-4 text-right px-6">
                <div class="flex justify-end gap-2">
                  @if (canEditWarehouses()) {
                    <button 
                      pButton 
                      icon="pi pi-pencil" 
                      class="p-button-text p-button-sm p-button-info hover:bg-blue-50"
                      (click)="openEditDialog(warehouse)">
                    </button>
                    <button 
                      pButton 
                      icon="pi pi-trash" 
                      class="p-button-text p-button-sm p-button-danger hover:bg-red-50"
                      (click)="confirmDelete(warehouse)">
                    </button>
                  }
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5" class="p-16 text-center text-slate-400">
                <i class="pi pi-warehouse text-5xl mb-4 block opacity-20"></i>
                <p class="text-lg font-semibold mb-2">No warehouses found</p>
                <p class="text-sm">Click "Add Warehouse" to create one.</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>

    <!-- Add/Edit Dialog -->
    <p-dialog 
      [(visible)]="displayDialog" 
      [header]="editingWarehouse() ? 'Edit Warehouse' : 'Add New Warehouse'" 
      [modal]="true" 
      [style]="{width: '500px'}" 
      class="p-fluid">
      <form [formGroup]="warehouseForm" (ngSubmit)="saveWarehouse()" class="flex flex-col gap-5 pt-4">
        <div class="field">
          <label for="name" class="block text-sm font-bold text-slate-800 mb-2">Warehouse Name *</label>
          <input pInputText id="name" formControlName="name" placeholder="e.g. Dubai Central Hub" class="w-full" />
        </div>
        
        <div class="field">
          <label for="code" class="block text-sm font-bold text-slate-800 mb-2">Warehouse Code</label>
          <input pInputText id="code" formControlName="code" placeholder="e.g. DXB-01" class="w-full" />
        </div>

        <div class="field">
          <label for="status" class="block text-sm font-bold text-slate-800 mb-2">Status</label>
          <p-select 
            id="status" 
            [options]="statusOptions" 
            formControlName="status" 
            placeholder="Select Status"
            styleClass="w-full">
          </p-select>
        </div>

        <div class="field">
          <label class="block text-sm font-bold text-slate-800 mb-2">Assigned Storekeepers</label>
          <div class="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 max-h-56 overflow-y-auto">
            @if (storekeepers().length) {
              <div class="grid grid-cols-1 gap-3">
                @for (user of storekeepers(); track user._id) {
                  <label class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      class="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                      [checked]="warehouseForm.get('assignedStorekeepers')?.value?.includes(user._id)"
                      (change)="onStorekeeperToggle(user._id, $any($event.target).checked)" />
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800">{{ user.name }}</span>
                      <span class="block text-xs text-slate-500">{{ user.email }}</span>
                    </span>
                  </label>
                }
              </div>
            } @else {
              <p class="text-sm text-slate-500">No active storekeepers available.</p>
            }
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
          <button 
            type="button" 
            pButton 
            label="Cancel" 
            class="p-button-text p-button-secondary" 
            (click)="displayDialog = false">
          </button>
          <button 
            type="submit" 
            pButton 
            [label]="editingWarehouse() ? 'Update' : 'Save'" 
            class="p-button-primary shadow-md"
            [disabled]="warehouseForm.invalid || saving()">
          </button>
        </div>
      </form>
    </p-dialog>

    <p-confirmDialog header="Delete Warehouse" icon="pi pi-exclamation-triangle"></p-confirmDialog>
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
export class WarehouseManagementComponent implements OnInit {
  private warehouseService = inject(WarehouseService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private authService = inject(AuthService);
  private rbacService = inject(RbacService);

  warehouses = signal<Warehouse[]>([]);
  storekeepers = signal<WarehouseStorekeeperOption[]>([]);
  loading = signal(false);
  saving = signal(false);
  displayDialog = false;
  editingWarehouse = signal<Warehouse | null>(null);

  warehouseForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    code: [''],
    // location: [''],
    // managerName: [''],
    // capacity: [null],
    status: ['Active', Validators.required],
    assignedStorekeepers: [[] as string[]],
  });

  statusOptions = [
    { label: 'Active', value: 'Active' },
    { label: 'Inactive', value: 'Inactive' }
  ];

  canEditWarehouses(): boolean {
    return this.authService.isAdminLevelRole() || this.rbacService.hasPermission('settings.tab.warehouses.edit');
  }

  ngOnInit() {
    this.loadWarehouses();
    this.loadStorekeepers();
  }

  loadWarehouses() {
    this.loading.set(true);
    this.warehouseService.getWarehouses().subscribe({
      next: (data: Warehouse[]) => {
        this.warehouses.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not load warehouses' });
        this.loading.set(false);
      }
    });
  }

  loadStorekeepers() {
    this.warehouseService.getAssignableStorekeepers().subscribe({
      next: (users) => {
        this.storekeepers.set(users);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not load storekeepers' });
      }
    });
  }

  openAddDialog() {
    if (!this.canEditWarehouses()) return;
    this.editingWarehouse.set(null);
    this.warehouseForm.reset({ status: 'Active', assignedStorekeepers: [] });
    this.displayDialog = true;
  }

  openEditDialog(warehouse: Warehouse) {
    if (!this.canEditWarehouses()) return;
    this.editingWarehouse.set(warehouse);
    this.warehouseForm.patchValue({
      ...warehouse,
      assignedStorekeepers: (warehouse.assignedStorekeepers || []).map((user) => user._id),
    });
    this.displayDialog = true;
  }

  onStorekeeperToggle(userId: string, checked: boolean) {
    const current: string[] = this.warehouseForm.get('assignedStorekeepers')?.value || [];
    const next = checked
      ? Array.from(new Set([...current, userId]))
      : current.filter((id) => id !== userId);
    this.warehouseForm.patchValue({ assignedStorekeepers: next });
  }

  getAssignedStorekeeperNames(warehouse: Warehouse): string {
    return (warehouse.assignedStorekeepers || [])
      .map((user) => user.name)
      .filter(Boolean)
      .join(', ');
  }

  saveWarehouse() {
    if (!this.canEditWarehouses()) return;
    if (this.warehouseForm.invalid) return;
    
    this.saving.set(true);
    const data = this.warehouseForm.value;
    const editing = this.editingWarehouse();

    if (editing?._id) {
      this.warehouseService.updateWarehouse(editing._id, data).subscribe({
        next: (res: Warehouse) => {
          this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Warehouse updated successfully' });
          this.loadWarehouses();
          this.displayDialog = false;
          this.saving.set(false);
        },
        error: (err: any) => {
          this.messageService.add({ severity: 'error', summary: 'Update failed', detail: err.error?.message || 'Error occurred' });
          this.saving.set(false);
        }
      });
    } else {
      this.warehouseService.createWarehouse(data).subscribe({
        next: (res: Warehouse) => {
          this.messageService.add({ severity: 'success', summary: 'Created', detail: 'New warehouse added' });
          this.loadWarehouses();
          this.displayDialog = false;
          this.saving.set(false);
        },
        error: (err: any) => {
          this.messageService.add({ severity: 'error', summary: 'Creation failed', detail: err.error?.message || 'Error occurred' });
          this.saving.set(false);
        }
      });
    }
  }

  confirmDelete(warehouse: Warehouse) {
    if (!this.canEditWarehouses()) return;
    this.confirmationService.confirm({
      message: `Are you sure you want to delete ${warehouse.name}?`,
      accept: () => {
        if (!warehouse._id) return;
        this.warehouseService.deleteWarehouse(warehouse._id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Warehouse removed' });
            this.loadWarehouses();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Delete failed', detail: 'Could not delete warehouse' });
          }
        });
      }
    });
  }
}
