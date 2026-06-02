import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { userDataResolver } from '../../core/resolvers/user-data.resolver';

export const DASHBOARD_ROUTES: Routes = [
  { 
    path: '', 
    component: DashboardComponent,
    resolve: { user: userDataResolver } // Ensures user data is loaded before rendering
  }
];
