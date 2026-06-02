import { createAction, props } from '@ngrx/store';
import { User, AuthResponse } from '../../core/services/auth.service';

// Login Actions
export const login = createAction(
  '[Auth] Login',
  props<{ email: string; password: string }>()
);

export const loginSuccess = createAction(
  '[Auth] Login Success',
  props<{ response: AuthResponse }>()
);

export const loginFailure = createAction(
  '[Auth] Login Failure',
  props<{ error: string }>()
);

// Logout Actions
export const logout = createAction('[Auth] Logout');

export const logoutSuccess = createAction('[Auth] Logout Success');

// Load User from Storage
export const loadUserFromStorage = createAction('[Auth] Load User From Storage');

export const loadUserFromStorageSuccess = createAction(
  '[Auth] Load User From Storage Success',
  props<{ user: User; token: string }>()
);

// Set User
export const setUser = createAction(
  '[Auth] Set User',
  props<{ user: User }>()
);

// Clear Auth State
export const clearAuthState = createAction('[Auth] Clear State');
