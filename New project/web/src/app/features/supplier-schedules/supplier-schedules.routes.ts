import { Routes } from '@angular/router';
import { SupplierScheduleListComponent } from './components/supplier-schedule-list/supplier-schedule-list.component';
import { SupplierScheduleDetailComponent } from './components/supplier-schedule-detail/supplier-schedule-detail.component';

export const SUPPLIER_SCHEDULES_ROUTES: Routes = [
  {
    path: '',
    component: SupplierScheduleListComponent,
  },
  {
    path: ':id',
    component: SupplierScheduleDetailComponent,
  },
];
