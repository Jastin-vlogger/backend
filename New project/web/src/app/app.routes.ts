import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
import { NotFoundComponent } from './features/not-found/not-found.component';
import { ForbiddenComponent } from './shared/components/forbidden/forbidden.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: 'auth',
        component: AuthLayoutComponent,
        children: [
            { path: '', loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES) }
        ]
    },
    {
        path: '',
        component: MainLayoutComponent,
        canActivate: [authGuard],
        children: [
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
            { path: 'dashboard', loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES) },
            { path: 'shipments', loadChildren: () => import('./features/shipment/shipment.routes').then(m => m.SHIPMENT_ROUTES) },
            { path: 'suppliers', loadChildren: () => import('./features/suppliers/suppliers.routes').then(m => m.SUPPLIERS_ROUTES) },
            { path: 'supplier-schedules', loadChildren: () => import('./features/supplier-schedules/supplier-schedules.routes').then(m => m.SUPPLIER_SCHEDULES_ROUTES) },
            { path: 'reports', loadChildren: () => import('./features/reports/reports.routes').then(m => m.REPORTS_ROUTES) },
            { path: 'access-control', loadChildren: () => import('./features/access-control/access-control.routes').then(m => m.ACCESS_CONTROL_ROUTES) },
            { path: 'settings', loadChildren: () => import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES) }

        ]
    },
    { path: 'forbidden', component: ForbiddenComponent },
    { path: '**', component: NotFoundComponent }
];
