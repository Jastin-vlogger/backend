import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import {
  Supplier,
  SupplierListParams,
  SupplierListResponse,
  UpdateSupplierPayload,
  UpdateSupplierStatusPayload,
} from '../models/supplier.model';

@Injectable({
  providedIn: 'root',
})
export class SupplierService {
  private apiUrl = 'suppliers';

  constructor(private http: HttpClient) {}

  getAllSuppliers(
    pageOrParams: number | SupplierListParams = {},
    limit = 20
  ): Observable<SupplierListResponse> {
    const params: SupplierListParams =
      typeof pageOrParams === 'number'
        ? { page: pageOrParams, limit }
        : pageOrParams;

    const httpParams = new HttpParams()
      .set('page', String(params.page ?? 1))
      .set('limit', String(params.limit ?? 20))
      .set('search', params.search ?? '')
      .set('status', params.status ?? '');

    return this.http.get<{ page: number; limit: number; totalPages: number; totalRecords: number; suppliers: unknown[] }>(this.apiUrl, { params: httpParams }).pipe(
      map((response) => {
        const suppliers = (response.suppliers ?? []).map((item) => this.mapSupplier(item));
        const visibleSuppliers = suppliers.filter((supplier) => (supplier.registrationStage || 'Draft') === 'Draft');

        return {
          ...response,
          totalRecords: response.totalRecords ?? visibleSuppliers.length,
          suppliers: visibleSuppliers,
        };
      })
    );
  }

  getSupplierById(id: string): Observable<Supplier> {
    return this.http.get<unknown>(`${this.apiUrl}/${id}`).pipe(map((response) => this.mapSupplier(response)));
  }

  updateSupplier(id: string, payload: UpdateSupplierPayload): Observable<Supplier> {
    return this.http.patch<{ message: string; supplier: unknown }>(`${this.apiUrl}/${id}`, {
      name: payload.name,
      companyName: payload.name,
      country: payload.country,
      contactPersonName: payload.contactPerson,
      contactEmail: payload.email,
      contactPhone: payload.phone,
      addressLine1: payload.address,
      city: payload.city,
      state: payload.state,
      postalCode: payload.postalCode,
      registrationNotes: payload.notes,
    }).pipe(map((response) => this.mapSupplier(response.supplier)));
  }

  updateSupplierStatus(id: string, payload: UpdateSupplierStatusPayload): Observable<Supplier> {
    return this.http.patch<{ message: string; supplier: unknown }>(`${this.apiUrl}/${id}/status`, payload).pipe(
      map((response) => this.mapSupplier(response.supplier))
    );
  }

  private mapSupplier(item: unknown): Supplier {
    const supplier = (item ?? {}) as any;
    const account = (supplier.account ?? {}) as any;

    return {
      _id: supplier._id,
      supplierCode: supplier.supplierCode,
      name: supplier.name,
      companyName: supplier.companyName,
      country: supplier.country,
      status: supplier.status,
      registrationStage: supplier.registrationStage,
      profileCompletionPercent: supplier.profileCompletionPercent,
      profileCompletedAt: supplier.profileCompletedAt ?? null,
      missingFields: supplier.missingFields ?? [],
      email: supplier.contactEmail,
      phone: supplier.contactPhone,
      contactPerson: supplier.contactPersonName,
      address: [supplier.addressLine1, supplier.addressLine2].filter(Boolean).join(', '),
      city: supplier.city,
      state: supplier.state,
      postalCode: supplier.postalCode,
      notes: supplier.registrationNotes,
      portalEmail: account.email || supplier.contactEmail,
      isPortalEnabled: account.isActive ?? supplier.status === 'Active',
      activatedAt: supplier.activatedAt ?? null,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
    };
  }
}
