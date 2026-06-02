import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { CardModule } from 'primeng/card';
import { SkeletonModule } from 'primeng/skeleton';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupplierService } from '../../../../core/services/supplier.service';
import { SupplierScheduleService } from '../../../../core/services/supplier-schedule.service';
import { Supplier, SupplierStatus } from '../../../../core/models/supplier.model';
import { SupplierSchedule } from '../../../../core/models/supplier-schedule.model';

@Component({
  selector: 'app-supplier-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, ButtonModule, InputTextModule, TextareaModule, TagModule, DividerModule, CardModule, SkeletonModule],
  templateUrl: './supplier-detail.component.html',
  styleUrl: './supplier-detail.component.scss',
})
export class SupplierDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private supplierService = inject(SupplierService);
  private supplierScheduleService = inject(SupplierScheduleService);
  private notificationService = inject(NotificationService);

  supplier = signal<Supplier | null>(null);
  relatedSchedules = signal<SupplierSchedule[]>([]);
  loading = signal(true);
  saving = signal(false);
  statusSaving = signal(false);
  supplierId = signal<string>('');

  readonly form = this.fb.group({
    supplierCode: ['', Validators.required],
    name: ['', Validators.required],
    country: ['', Validators.required],
    email: [''],
    phone: [''],
    contactPerson: [''],
    address: [''],
    city: [''],
    state: [''],
    postalCode: [''],
    notes: [''],
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id') || '';
      this.supplierId.set(id);
      if (id) {
        this.loadSupplier(id);
        this.loadSchedules(id);
      }
    });
  }

  loadSupplier(id: string): void {
    this.loading.set(true);
    this.supplierService.getSupplierById(id).subscribe({
      next: (supplier) => {
        this.supplier.set(supplier);
        this.form.patchValue({
          supplierCode: supplier.supplierCode || '',
          name: supplier.name || '',
          country: supplier.country || '',
          email: supplier.email || '',
          phone: supplier.phone || '',
          contactPerson: supplier.contactPerson || '',
          address: supplier.address || '',
          city: supplier.city || '',
          state: supplier.state || '',
          postalCode: supplier.postalCode || '',
          notes: supplier.notes || '',
        });
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.notificationService.error('Supplier not found', error.error?.message || 'Unable to load supplier details.');
      },
    });
  }

  loadSchedules(id: string): void {
    this.supplierScheduleService.getSupplierSchedules({ supplierId: id, limit: 5, page: 1 }).subscribe({
      next: (response) => this.relatedSchedules.set(response.schedules ?? []),
      error: () => this.relatedSchedules.set([]),
    });
  }

  saveSupplier(): void {
    if (this.form.invalid || !this.supplierId()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const value = this.form.getRawValue();
    this.supplierService.updateSupplier(this.supplierId(), {
      supplierCode: value.supplierCode ?? '',
      name: value.name ?? '',
      country: value.country ?? '',
      email: value.email ?? '',
      phone: value.phone ?? '',
      contactPerson: value.contactPerson ?? '',
      address: value.address ?? '',
      city: value.city ?? '',
      state: value.state ?? '',
      postalCode: value.postalCode ?? '',
      notes: value.notes ?? '',
    }).subscribe({
      next: (supplier) => {
        this.supplier.set(supplier);
        this.saving.set(false);
        this.notificationService.success('Supplier saved', 'Profile changes were stored successfully.');
      },
      error: (error) => {
        this.saving.set(false);
        this.notificationService.error('Save failed', error.error?.message || 'Could not update supplier.');
      },
    });
  }

  setStatus(status: SupplierStatus): void {
    if (!this.supplierId()) return;

    this.statusSaving.set(true);
    this.supplierService.updateSupplierStatus(this.supplierId(), { status }).subscribe({
      next: (supplier) => {
        this.supplier.set(supplier);
        this.statusSaving.set(false);
        this.notificationService.success('Supplier status updated', `Supplier is now ${status}.`);
      },
      error: (error) => {
        this.statusSaving.set(false);
        this.notificationService.error('Status update failed', error.error?.message || 'Could not update supplier status.');
      },
    });
  }

  getSeverity(status?: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
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
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}
