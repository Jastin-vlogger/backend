import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import * as AuthActions from './auth.actions';

@Injectable()
export class AuthEffects {
  private actions$ = inject(Actions);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  // Login Effect
  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      switchMap(({ email, password }) =>
        this.authService.login({ email, password }).pipe(
          map((response) => AuthActions.loginSuccess({ response })),
          catchError((error) => {
            const errorMessage = error.error?.message || 'Invalid email or password';
            return of(AuthActions.loginFailure({ error: errorMessage }));
          })
        )
      )
    )
  );

  // Login Success Effect
  loginSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loginSuccess),
        tap(({ response }) => {
          this.notificationService.success(
            'Login Successful',
            `Welcome back, ${response.user.name}!`
          );
          this.router.navigate([response.user.mustChangePassword ? '/auth/change-password' : '/dashboard']);
        })
      ),
    { dispatch: false }
  );

  // Login Failure Effect
  loginFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loginFailure),
        tap(({ error }) => {
          this.notificationService.error('Login Failed', error);
        })
      ),
    { dispatch: false }
  );

  // Logout Effect
  logout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logout),
      tap(() => {
        // Clear localStorage
        localStorage.removeItem('shiplogic_auth_token');
        localStorage.removeItem('shiplogic_user');
      }),
      map(() => AuthActions.logoutSuccess())
    )
  );

  // Logout Success Effect
  logoutSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.logoutSuccess),
        tap(() => {
          this.notificationService.info('Logged Out', 'You have been logged out successfully');
          this.router.navigate(['/auth/login']);
        })
      ),
    { dispatch: false }
  );

  // Load User from Storage Effect
  loadUserFromStorage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.loadUserFromStorage),
      map(() => {
        const token = localStorage.getItem('shiplogic_auth_token');
        const userJson = localStorage.getItem('shiplogic_user');

        if (token && userJson) {
          try {
            const user = JSON.parse(userJson);
            return AuthActions.loadUserFromStorageSuccess({ user, token });
          } catch {
            return AuthActions.clearAuthState();
          }
        }
        return AuthActions.clearAuthState();
      })
    )
  );
}
