import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { CardModule } from 'primeng/card';
import { SkeletonModule } from 'primeng/skeleton';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupplierScheduleService } from '../../../../core/services/supplier-schedule.service';
import { SupplierSchedule, SupplierScheduleStatus } from '../../../../core/models/supplier-schedule.model';

@Component({
  selector: 'app-supplier-schedule-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, ButtonModule, TextareaModule, TagModule, DividerModule, CardModule, SkeletonModule],
  templateUrl: './supplier-schedule-detail.component.html',
  styleUrl: './supplier-schedule-detail.component.scss',
})
export class SupplierScheduleDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private supplierScheduleService = inject(SupplierScheduleService);
  private notificationService = inject(NotificationService);

  schedule = signal<SupplierSchedule | null>(null);
  loading = signal(true);
  approving = signal(false);
  rejecting = signal(false);
  savingSuggestion = signal(false);
  scheduleId = signal('');

  readonly form = this.fb.group({
    suggestion: [''],
    rejectionReason: ['', Validators.required],
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id') || '';
      this.scheduleId.set(id);
      if (id) {
        this.loadSchedule(id);
      }
    });
  }

  loadSchedule(id: string): void {
    this.loading.set(true);
    this.supplierScheduleService.getSupplierScheduleById(id).subscribe({
      next: (schedule) => {
        this.schedule.set(schedule);
        this.form.patchValue({
          suggestion: schedule.suggestion || '',
          rejectionReason: schedule.rejectionReason || '',
        });
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.notificationService.error('Schedule not found', error.error?.message || 'Unable to load schedule details.');
      },
    });
  }

  approveSchedule(): void {
    if (!this.scheduleId()) return;

    this.approving.set(true);
    this.supplierScheduleService.approveSupplierSchedule(this.scheduleId()).subscribe({
      next: (schedule) => {
        this.schedule.set(schedule);
        this.approving.set(false);
        this.notificationService.success('Schedule approved', 'Supplier has been notified.');
      },
      error: (error) => {
        this.approving.set(false);
        this.notificationService.error('Approval failed', error.error?.message || 'Could not approve schedule.');
      },
    });
  }

  rejectSchedule(): void {
    if (!this.scheduleId()) return;
    const reason = (this.form.value.rejectionReason || '').trim();
    if (!reason) {
      this.form.controls.rejectionReason.markAsTouched();
      this.notificationService.warn('Reason required', 'Please add a rejection reason before rejecting.');
      return;
    }

    this.rejecting.set(true);
    this.supplierScheduleService.rejectSupplierSchedule(this.scheduleId(), { reason }).subscribe({
      next: (schedule) => {
        this.schedule.set(schedule);
        this.rejecting.set(false);
        this.notificationService.success('Schedule rejected', 'Rejection reason has been saved.');
      },
      error: (error) => {
        this.rejecting.set(false);
        this.notificationService.error('Rejection failed', error.error?.message || 'Could not reject schedule.');
      },
    });
  }

  saveSuggestion(): void {
    if (!this.scheduleId()) return;
    const suggestion = (this.form.value.suggestion || '').trim();
    if (!suggestion) {
      this.notificationService.warn('Suggestion required', 'Please add feedback before saving.');
      return;
    }

    this.savingSuggestion.set(true);
    this.supplierScheduleService.suggestSupplierSchedule(this.scheduleId(), { suggestion }).subscribe({
      next: (schedule) => {
        this.schedule.set(schedule);
        this.savingSuggestion.set(false);
        this.notificationService.success('Suggestion saved', 'Supplier can now see this feedback.');
      },
      error: (error) => {
        this.savingSuggestion.set(false);
        this.notificationService.error('Suggestion failed', error.error?.message || 'Could not save suggestion.');
      },
    });
  }

  getSeverity(status?: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
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

  get scheduleStatus(): SupplierScheduleStatus | string | undefined {
    return this.schedule()?.status;
  }
}
