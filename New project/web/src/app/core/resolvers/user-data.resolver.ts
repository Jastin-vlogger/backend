import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Store } from '@ngrx/store';
import { filter, take } from 'rxjs/operators';
import { selectUser, selectAuthLoading } from '../../store/auth/auth.selectors';
import { User } from '../services/auth.service';

/**
 * User Data Resolver
 * Ensures user data is loaded from store before rendering the route
 * Usage: Add to route config: resolve: { user: userDataResolver }
 */
export const userDataResolver: ResolveFn<User | null> = () => {
  const store = inject(Store);
  
  // Wait for auth loading to complete, then return user
  return store.select(selectAuthLoading).pipe(
    filter(loading => !loading), // Wait until not loading
    take(1), // Take only first emission
    // Then get the user
    () => store.select(selectUser).pipe(take(1))
  );
};
