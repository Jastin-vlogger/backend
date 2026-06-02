import { Routes } from '@angular/router';
import { SupplierListComponent } from './components/supplier-list/supplier-list.component';
import { SupplierDetailComponent } from './components/supplier-detail/supplier-detail.component';

export const SUPPLIERS_ROUTES: Routes = [
  {
    path: '',
    component: SupplierListComponent,
  },
  {
    path: ':id',
    component: SupplierDetailComponent,
  },
];
