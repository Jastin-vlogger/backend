import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { RbacService } from './rbac.service';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  mustChangePassword?: boolean;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private rbacService = inject(RbacService);

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private tokenKey = 'shiplogic_auth_token';
  private userKey = 'shiplogic_user';

  constructor() {
    // Check for existing token and user on initialization
    const token = this.getToken();
    const user = this.getStoredUser();
    if (token && user) {
      this.currentUserSubject.next(user);
      // Load permissions after a microtask so Angular's DI is fully settled
      // before making HTTP calls (avoids race with interceptors).
      Promise.resolve().then(() => {
        this.rbacService.loadEffectivePermissions().subscribe();
      });
    }
  }

  login(credentials: LoginCredentials): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('auth/login', credentials).pipe(
      tap(response => {
        // Store token in localStorage
        this.setToken(response.token);
        // Store user data in localStorage
        this.setUser(response.user);
        // Update current user subject
        this.currentUserSubject.next(response.user);
        this.rbacService.loadEffectivePermissions().subscribe();
      })
    );
  }

  changePassword(payload: ChangePasswordPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('auth/change-password', payload);
  }

  logout(): void {
    this.removeToken();
    this.removeUser();
    this.currentUserSubject.next(null);
    this.rbacService.clear();
    this.router.navigate(['/auth/login']);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  private setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  private removeToken(): void {
    localStorage.removeItem(this.tokenKey);
  }

  private setUser(user: User): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  private getStoredUser(): User | null {
    const userJson = localStorage.getItem(this.userKey);
    if (userJson) {
      try {
        return JSON.parse(userJson);
      } catch {
        return null;
      }
    }
    return null;
  }

  private removeUser(): void {
    localStorage.removeItem(this.userKey);
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Returns true if the current user's role is considered admin-level
   * (full access, bypasses RBAC tab/section checks).
   *
   * Mirrors the ADMIN_ROLE_KEYS set in the backend's roleRegistry.js.
   * Add a role key here when it should have the same elevated access as Admin.
   */
  isAdminLevelRole(): boolean {
    const role = this.getCurrentUser()?.role || '';
    return ['Admin', 'Manager', 'Management'].includes(role);
  }

  updateStoredUser(user: User): void {
    this.setUser(user);
    this.currentUserSubject.next(user);
  }
}
