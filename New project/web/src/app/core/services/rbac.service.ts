import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AccessControlService } from './access-control.service';
import { EffectivePermissionsResponse } from '../models/access-control.model';

@Injectable({
  providedIn: 'root',
})
export class RbacService {
  private accessControlService = inject(AccessControlService);

  private permissionsSubject = new BehaviorSubject<EffectivePermissionsResponse | null>(null);
  readonly permissions$ = this.permissionsSubject.asObservable();

  loadEffectivePermissions() {
    return this.accessControlService.getEffectivePermissions().pipe(
      tap((response) => this.permissionsSubject.next(response)),
      catchError(() => {
        this.permissionsSubject.next(null);
        return of(null);
      })
    );
  }

  clear(): void {
    this.permissionsSubject.next(null);
  }

  get permissionKeys(): string[] {
    return this.permissionsSubject.value?.permissionKeys || [];
  }

  hasPermission(key: string): boolean {
    return this.permissionKeys.includes(key);
  }
}
