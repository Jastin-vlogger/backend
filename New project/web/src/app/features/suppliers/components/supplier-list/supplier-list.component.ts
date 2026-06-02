import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { SkeletonModule } from 'primeng/skeleton';
import { SelectModule } from 'primeng/select';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupplierService } from '../../../../core/services/supplier.service';
import { Supplier, SupplierListParams, SupplierListResponse, SupplierStatus } from '../../../../core/models/supplier.model';

@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule, SelectModule, InputTextModule, TagModule, TableModule, SkeletonModule],
  templateUrl: './supplier-list.component.html',
  styleUrl: './supplier-list.component.scss',
})
export class SupplierListComponent implements OnInit {
  private supplierService = inject(SupplierService);
  private notificationService = inject(NotificationService);

  readonly statusOptions = [
    { label: 'All Statuses', value: 'All' },
    { label: 'Pending', value: 'Pending' },
    { label: 'Active', value: 'Active' },
    { label: 'Inactive', value: 'Inactive' },
  ];

  suppliers = signal<Supplier[]>([]);
  loading = signal(true);
  page = signal(1);
  limit = signal(12);
  totalPages = signal(0);
  totalRecords = signal(0);
  searchText = '';
  statusFilter: SupplierListParams['status'] = 'All';
  refreshing = signal(false);

  ngOnInit(): void {
    this.loadSuppliers();
  }

  loadSuppliers(): void {
    this.loading.set(true);
    const status = this.statusFilter === 'All' ? '' : this.statusFilter;

    this.supplierService.getAllSuppliers({
      page: this.page(),
      limit: this.limit(),
      search: this.searchText.trim(),
      status,
    }).subscribe({
      next: (response: SupplierListResponse) => {
        this.suppliers.set(response.suppliers ?? []);
        this.totalPages.set(response.totalPages ?? 0);
        this.totalRecords.set(response.totalRecords ?? 0);
        this.page.set(response.page ?? this.page());
        this.limit.set(response.limit ?? this.limit());
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.notificationService.error('Unable to load suppliers', error.error?.message || 'Please try again.');
      },
    });
  }

  applyFilters(): void {
    this.page.set(1);
    this.searchText = this.searchText.trim();
    this.loadSuppliers();
  }

  changePage(nextPage: number): void {
    if (nextPage < 1 || (this.totalPages() && nextPage > this.totalPages())) return;
    this.page.set(nextPage);
    this.loadSuppliers();
  }

  refresh(): void {
    this.refreshing.set(true);
    const status = this.statusFilter === 'All' ? '' : this.statusFilter;
    this.supplierService.getAllSuppliers({
      page: this.page(),
      limit: this.limit(),
      search: this.searchText.trim(),
      status,
    }).subscribe({
      next: (response) => {
        this.suppliers.set(response.suppliers ?? []);
        this.totalPages.set(response.totalPages ?? 0);
        this.totalRecords.set(response.totalRecords ?? 0);
        this.refreshing.set(false);
      },
      error: () => {
        this.refreshing.set(false);
      },
    });
  }

  setSupplierStatus(supplier: Supplier, status: SupplierStatus): void {
    this.supplierService.updateSupplierStatus(supplier._id, { status }).subscribe({
      next: () => {
        this.notificationService.success('Supplier updated', `${supplier.name} is now ${status}.`);
        this.loadSuppliers();
      },
      error: (error) => {
        this.notificationService.error('Status update failed', error.error?.message || 'Could not change supplier status.');
      },
    });
  }

  getSupplierSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const value = (status || '').toLowerCase();
    if (value === 'active') return 'success';
    if (value === 'pending') return 'warn';
    if (value === 'inactive') return 'secondary';
    return 'info';
  }

  getRegistrationSeverity(stage?: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const value = (stage || '').toLowerCase();
    if (value === 'draft') return 'info';
    if (value === 'in progress') return 'warn';
    return 'secondary';
  }

  formatDate(value?: string): string {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }
}
