import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { guestGuard } from '../../core/guards/guest.guard';
import { ChangePasswordComponent } from './components/change-password/change-password.component';

export const AUTH_ROUTES: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { 
    path: 'login', 
    component: LoginComponent,
    canActivate: [guestGuard]  // Prevent authenticated users from accessing login
  },
  {
    path: 'change-password',
    component: ChangePasswordComponent
  },
  // Placeholder routes for future implementation
  { 
    path: 'register', 
    component: LoginComponent,
    canActivate: [guestGuard]  // TODO: Create RegisterComponent
  },
  { 
    path: 'forgot-password', 
    component: LoginComponent,
    canActivate: [guestGuard]  // TODO: Create ForgotPasswordComponent
  },
];
