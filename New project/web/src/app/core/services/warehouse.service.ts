import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Warehouse {
  _id?: string;
  name: string;
  code?: string;
  location?: string;
  managerName?: string;
  capacity?: number;
  status: 'Active' | 'Inactive';
  assignedStorekeepers?: Array<{
    _id: string;
    name: string;
    email: string;
    role: string;
    isActive?: boolean;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface WarehouseStorekeeperOption {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class WarehouseService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/warehouse`;

  getWarehouses(): Observable<Warehouse[]> {
    return this.http.get<Warehouse[]>(this.apiUrl);
  }

  getAssignableStorekeepers(): Observable<WarehouseStorekeeperOption[]> {
    return this.http.get<{ users: WarehouseStorekeeperOption[] }>(`${this.apiUrl}/storekeepers/options`).pipe(
      map((response) => response.users || [])
    );
  }

  getWarehouse(id: string): Observable<Warehouse> {
    return this.http.get<Warehouse>(`${this.apiUrl}/${id}`);
  }

  createWarehouse(warehouse: Warehouse): Observable<Warehouse> {
    return this.http.post<Warehouse>(this.apiUrl, warehouse);
  }

  updateWarehouse(id: string, warehouse: Warehouse): Observable<Warehouse> {
    return this.http.put<Warehouse>(`${this.apiUrl}/${id}`, warehouse);
  }

  deleteWarehouse(id: string): Observable<Warehouse> {
    return this.http.delete<Warehouse>(`${this.apiUrl}/${id}`);
  }
}
