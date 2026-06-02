import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ExchangeRate {
  _id?: string;
  bankName: string;
  rate: number;
  isDefault?: boolean;
  status: 'Active' | 'Inactive';
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ExchangeRateService {
  private http = inject(HttpClient);
  private apiUrl = 'exchange-rates';

  /** Returns all active rates (including Direct). Used in shipment creation. */
  getActive(): Observable<ExchangeRate[]> {
    return this.http.get<ExchangeRate[]>(`${this.apiUrl}/active`);
  }

  /** Returns all rates (Admin only). */
  getAll(): Observable<ExchangeRate[]> {
    return this.http.get<ExchangeRate[]>(this.apiUrl);
  }

  create(payload: Omit<ExchangeRate, '_id' | 'createdAt' | 'updatedAt' | 'isDefault'>): Observable<ExchangeRate> {
    return this.http.post<ExchangeRate>(this.apiUrl, payload);
  }

  update(id: string, payload: Partial<ExchangeRate>): Observable<ExchangeRate> {
    return this.http.put<ExchangeRate>(`${this.apiUrl}/${id}`, payload);
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
