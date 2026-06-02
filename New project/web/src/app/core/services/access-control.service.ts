import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AccessPermission, AccessPermissionGroup, AccessRole, AccessUser, BlRowDefinitionAdminItem, EffectivePermissionsResponse } from '../models/access-control.model';

@Injectable({
  providedIn: 'root',
})
export class AccessControlService {
  private apiUrl = 'access-control';

  constructor(private http: HttpClient) {}

  getRoles(): Observable<{ roles: AccessRole[] }> {
    return this.http.get<{ roles: AccessRole[] }>(`${this.apiUrl}/roles`);
  }

  createRole(payload: Partial<AccessRole> & { key: string; name: string }): Observable<{ message: string; role: AccessRole }> {
    return this.http.post<{ message: string; role: AccessRole }>(`${this.apiUrl}/roles`, payload);
  }

  createUser(payload: Partial<AccessUser> & { name: string; email: string; role: string }): Observable<{ message: string; user: AccessUser }> {
    return this.http.post<{ message: string; user: AccessUser }>(`${this.apiUrl}/users`, payload);
  }

  updateRole(roleId: string, payload: Partial<AccessRole>): Observable<{ message: string; role: AccessRole }> {
    return this.http.patch<{ message: string; role: AccessRole }>(`${this.apiUrl}/roles/${roleId}`, payload);
  }

  getPermissions(resource = 'shipment'): Observable<{ permissions: AccessPermission[] }> {
    return this.http.get<{ permissions: AccessPermission[] }>(`${this.apiUrl}/permissions`, {
      params: { resource },
    });
  }

  getRolePermissions(roleId: string): Observable<{ role: AccessRole; permissionGroups: AccessPermissionGroup[] }> {
    return this.http.get<{ role: AccessRole; permissionGroups: AccessPermissionGroup[] }>(
      `${this.apiUrl}/roles/${roleId}/permissions`
    );
  }

  updateRolePermissions(roleId: string, permissionKeys: string[]): Observable<{ message: string; role: AccessRole; permissionGroups: AccessPermissionGroup[] }> {
    return this.http.put<{ message: string; role: AccessRole; permissionGroups: AccessPermissionGroup[] }>(
      `${this.apiUrl}/roles/${roleId}/permissions`,
      { permissionKeys }
    );
  }

  getEffectivePermissions(): Observable<EffectivePermissionsResponse> {
    return this.http.get<EffectivePermissionsResponse>(`${this.apiUrl}/effective-permissions`);
  }

  getUsers(page = 1, limit = 20, search = ''): Observable<{ users: AccessUser[]; roles: AccessRole[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const params: Record<string, string> = {
      page: String(page),
      limit: String(limit),
    };
    if (search.trim()) params['search'] = search.trim();
    return this.http.get<{ users: AccessUser[]; roles: AccessRole[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`${this.apiUrl}/users`, { params });
  }

  updateUser(userId: string, payload: Partial<AccessUser>): Observable<{ message: string; user: AccessUser }> {
    return this.http.patch<{ message: string; user: AccessUser }>(`${this.apiUrl}/users/${userId}`, payload);
  }

  resetUserPassword(userId: string): Observable<{ message: string; user: AccessUser }> {
    return this.http.patch<{ message: string; user: AccessUser }>(`${this.apiUrl}/users/${userId}/reset-password`, {});
  }

  getBlRowDefinitions(): Observable<{ rows: BlRowDefinitionAdminItem[] }> {
    return this.http.get<{ rows: BlRowDefinitionAdminItem[] }>(`${this.apiUrl}/bl-row-definitions`);
  }

  createBlRowDefinition(payload: { description: string; visibleTo: string[]; defaultQty: number; defaultRate: number }): Observable<{ message: string; row: BlRowDefinitionAdminItem }> {
    return this.http.post<{ message: string; row: BlRowDefinitionAdminItem }>(`${this.apiUrl}/bl-row-definitions`, payload);
  }

  updateBlRowDefinition(rowId: string, payload: { description: string; visibleTo: string[]; defaultQty: number; defaultRate: number; isActive?: boolean }): Observable<{ message: string; row: BlRowDefinitionAdminItem }> {
    return this.http.patch<{ message: string; row: BlRowDefinitionAdminItem }>(`${this.apiUrl}/bl-row-definitions/${rowId}`, payload);
  }

  deleteBlRowDefinition(rowId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/bl-row-definitions/${rowId}`);
  }
}
