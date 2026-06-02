import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import {
  RejectSupplierSchedulePayload,
  SuggestSupplierSchedulePayload,
  SupplierSchedule,
  SupplierScheduleListParams,
  SupplierScheduleListResponse,
  UpdateSupplierSchedulePayload,
} from '../models/supplier-schedule.model';

@Injectable({
  providedIn: 'root',
})
export class SupplierScheduleService {
  private apiUrl = 'supplier-schedules';

  constructor(private http: HttpClient) {}

  getSupplierSchedules(params: SupplierScheduleListParams = {}): Observable<SupplierScheduleListResponse> {
    const httpParams = new HttpParams()
      .set('page', String(params.page ?? 1))
      .set('limit', String(params.limit ?? 20))
      .set('search', params.search ?? '')
      .set('status', params.status ?? '')
      .set('supplierId', params.supplierId ?? '');

    return this.http.get<{ page: number; limit: number; totalPages: number; totalRecords: number; schedules: unknown[] }>(this.apiUrl, { params: httpParams }).pipe(
      map((response) => ({
        ...response,
        schedules: (response.schedules ?? []).map((item) => this.mapSchedule(item)),
      }))
    );
  }

  getSupplierScheduleById(id: string): Observable<SupplierSchedule> {
    return this.http.get<unknown>(`${this.apiUrl}/${id}`).pipe(map((response) => this.mapSchedule(response)));
  }

  updateSupplierSchedule(id: string, payload: UpdateSupplierSchedulePayload): Observable<SupplierSchedule> {
    return this.http.patch<{ message: string; schedule: unknown }>(`${this.apiUrl}/${id}`, payload).pipe(
      map((response) => this.mapSchedule(response.schedule))
    );
  }

  approveSupplierSchedule(id: string): Observable<SupplierSchedule> {
    return this.http.patch<{ message: string; schedule: unknown }>(`${this.apiUrl}/${id}/approve`, {}).pipe(
      map((response) => this.mapSchedule(response.schedule))
    );
  }

  rejectSupplierSchedule(id: string, payload: RejectSupplierSchedulePayload): Observable<SupplierSchedule> {
    return this.http.patch<{ message: string; schedule: unknown }>(`${this.apiUrl}/${id}/reject`, {
      rejectionReason: payload.reason,
    }).pipe(map((response) => this.mapSchedule(response.schedule)));
  }

  suggestSupplierSchedule(id: string, payload: SuggestSupplierSchedulePayload): Observable<SupplierSchedule> {
    return this.http.patch<{ message: string; schedule: unknown }>(`${this.apiUrl}/${id}/suggestion`, {
      adminSuggestion: payload.suggestion,
    }).pipe(map((response) => this.mapSchedule(response.schedule)));
  }

  private mapSchedule(item: unknown): SupplierSchedule {
    const schedule = (item ?? {}) as any;
    const supplier = (schedule.supplierId ?? schedule.supplier ?? {}) as any;
    const origin = schedule.origin || '';
    const destination = schedule.destination || '';

    return {
      _id: schedule._id,
      supplierId: typeof schedule.supplierId === 'string' ? schedule.supplierId : supplier._id,
      supplier: supplier._id
        ? {
            _id: supplier._id,
            supplierCode: supplier.supplierCode,
            name: supplier.name,
            country: supplier.country,
            status: supplier.status,
          }
        : undefined,
      shipmentType: schedule.shipmentType,
      origin,
      destination,
      plannedDepartureDate: schedule.plannedDepartureDate,
      plannedArrivalDate: schedule.plannedArrivalDate,
      frequency: schedule.frequency,
      capacity: schedule.capacity,
      scheduleNo: schedule.referenceNo || schedule._id,
      scheduleCode: schedule.referenceNo,
      title: schedule.title,
      referenceNo: schedule.referenceNo,
      scheduledDate: schedule.plannedDepartureDate,
      location: origin,
      route: [origin, destination].filter(Boolean).join(' -> '),
      notes: schedule.notes,
      status: schedule.status,
      rejectionReason: schedule.rejectionReason,
      suggestion: schedule.adminSuggestion,
      adminSuggestion: schedule.adminSuggestion,
      submittedAt: schedule.submittedAt,
      approvedAt: schedule.approvedAt,
      rejectedAt: schedule.rejectedAt,
      reviewedAt: schedule.approvedAt || schedule.rejectedAt || null,
      reviewedBy: schedule.reviewedBy?._id || schedule.reviewedBy || null,
      scheduleHistory: (schedule.scheduleHistory ?? []).map((entry: any) => ({
        action: entry.action,
        actorType: entry.actorType,
        actorName: entry.actorName,
        changes: (entry.changes ?? []).map((change: any) => ({
          field: change.field,
          label: change.label,
          previousValue: change.previousValue,
          nextValue: change.nextValue,
        })),
        createdAt: entry.createdAt,
      })),
      updatedAt: schedule.updatedAt,
      createdAt: schedule.createdAt,
    };
  }
}
