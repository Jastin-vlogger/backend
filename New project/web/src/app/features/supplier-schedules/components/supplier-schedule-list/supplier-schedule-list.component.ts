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
import { SupplierScheduleService } from '../../../../core/services/supplier-schedule.service';
import {
  SupplierSchedule,
  SupplierScheduleListParams,
  SupplierScheduleListResponse,
  SupplierScheduleStatus,
} from '../../../../core/models/supplier-schedule.model';

@Component({
  selector: 'app-supplier-schedule-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule, SelectModule, InputTextModule, TagModule, TableModule, SkeletonModule],
  templateUrl: './supplier-schedule-list.component.html',
  styleUrl: './supplier-schedule-list.component.scss',
})
export class SupplierScheduleListComponent implements OnInit {
  private supplierScheduleService = inject(SupplierScheduleService);
  private notificationService = inject(NotificationService);

  readonly statusOptions = [
    { label: 'All Statuses', value: 'All' },
    { label: 'Draft', value: 'Draft' },
    { label: 'Submitted', value: 'Submitted' },
    { label: 'Approved', value: 'Approved' },
    { label: 'Rejected', value: 'Rejected' },
  ];

  schedules = signal<SupplierSchedule[]>([]);
  loading = signal(true);
  page = signal(1);
  limit = signal(12);
  totalPages = signal(0);
  totalRecords = signal(0);
  searchText = '';
  statusFilter: SupplierScheduleListParams['status'] = 'All';
  refreshing = signal(false);

  ngOnInit(): void {
    this.loadSchedules();
  }

  loadSchedules(): void {
    this.loading.set(true);
    const status = this.statusFilter === 'All' ? '' : this.statusFilter;
    this.supplierScheduleService.getSupplierSchedules({
      page: this.page(),
      limit: this.limit(),
      search: this.searchText.trim(),
      status,
    }).subscribe({
      next: (response: SupplierScheduleListResponse) => {
        this.schedules.set(response.schedules ?? []);
        this.totalPages.set(response.totalPages ?? 0);
        this.totalRecords.set(response.totalRecords ?? 0);
        this.page.set(response.page ?? this.page());
        this.limit.set(response.limit ?? this.limit());
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.notificationService.error('Unable to load schedules', error.error?.message || 'Please try again.');
      },
    });
  }

  applyFilters(): void {
    this.page.set(1);
    this.loadSchedules();
  }

  changePage(nextPage: number): void {
    if (nextPage < 1 || (this.totalPages() && nextPage > this.totalPages())) return;
    this.page.set(nextPage);
    this.loadSchedules();
  }

  refresh(): void {
    this.refreshing.set(true);
    const status = this.statusFilter === 'All' ? '' : this.statusFilter;
    this.supplierScheduleService.getSupplierSchedules({
      page: this.page(),
      limit: this.limit(),
      search: this.searchText.trim(),
      status,
    }).subscribe({
      next: (response) => {
        this.schedules.set(response.schedules ?? []);
        this.totalPages.set(response.totalPages ?? 0);
        this.totalRecords.set(response.totalRecords ?? 0);
        this.refreshing.set(false);
      },
      error: () => {
        this.refreshing.set(false);
      },
    });
  }

  getSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const value = (status || '').toLowerCase();
    if (value === 'approved') return 'success';
    if (value === 'submitted') return 'info';
    if (value === 'draft') return 'secondary';
    if (value === 'rejected') return 'danger';
    return 'warn';
  }

  formatDate(value?: string | null): string {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  getSupplierName(schedule: SupplierSchedule): string {
    return schedule.supplier?.name || 'Unknown supplier';
  }
}
