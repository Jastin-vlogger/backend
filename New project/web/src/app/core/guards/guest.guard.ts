import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guest Guard - Prevents authenticated users from accessing auth pages (login, register, etc.)
 * Redirects authenticated users to dashboard
 */
export const guestGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // If user is already authenticated, redirect to dashboard
  if (authService.isAuthenticated()) {
    router.navigate([authService.getCurrentUser()?.mustChangePassword ? '/auth/change-password' : '/dashboard']);
    return false;
  }

  // Allow access to auth pages for non-authenticated users
  return true;
};
