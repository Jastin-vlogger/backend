import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TransportationCompany {
  _id?: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  status: 'Active' | 'Inactive';
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class TransportationCompanyService {
  private http = inject(HttpClient);
  private apiUrl = 'transportation-companies';

  getAll(): Observable<TransportationCompany[]> {
    return this.http.get<TransportationCompany[]>(this.apiUrl);
  }

  getById(id: string): Observable<TransportationCompany> {
    return this.http.get<TransportationCompany>(`${this.apiUrl}/${id}`);
  }

  create(payload: Omit<TransportationCompany, '_id' | 'createdAt' | 'updatedAt'>): Observable<TransportationCompany> {
    return this.http.post<TransportationCompany>(this.apiUrl, payload);
  }

  update(id: string, payload: Partial<TransportationCompany>): Observable<TransportationCompany> {
    return this.http.put<TransportationCompany>(`${this.apiUrl}/${id}`, payload);
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
