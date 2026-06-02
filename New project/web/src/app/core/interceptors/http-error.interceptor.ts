import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';
import { Store } from '@ngrx/store';
import * as AuthActions from '../../store/auth/auth.actions';

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const notificationService = inject(NotificationService);
  const router = inject(Router);
  const store = inject(Store);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An unknown error occurred';
      let errorTitle = 'API Error';

      if (error.error instanceof ErrorEvent) {
        // Client-side error
        errorMessage = error.error.message;
      } else {
        // Server-side error
        errorTitle = `Error ${error.status}: ${error.statusText}`;
        errorMessage = error.error?.message || error.message || 'Server error';
        
        if (error.status === 401) {
          errorMessage = 'Your session has expired. Please login again.';
          // Dispatch logout action which will clear state and redirect
          store.dispatch(AuthActions.logout());
        } else if (error.status === 403) {
          errorMessage = 'You do not have permission to perform this action.';
          // Only redirect to forbidden for navigation-level requests (not background API calls).
          // Background calls (e.g. loading dropdowns) should fail silently rather than
          // kicking the user off the page they are legitimately allowed to view.
          const isNavigationRequest = req.headers.has('X-Navigation-Request');
          if (isNavigationRequest) {
            router.navigate(['/forbidden']);
          }
        } else if (error.status === 404) {
          errorMessage = 'The requested resource was not found.';
        } else if (error.status === 500) {
          errorMessage = 'Internal server error. Please try again later.';
        }
      }

      // Only show notification if not redirecting
      if (error.status !== 401 && error.status !== 403) {
        notificationService.error(errorTitle, errorMessage);
      }
      
      return throwError(() => error);
    })
  );
};
