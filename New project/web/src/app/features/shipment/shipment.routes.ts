import { Routes } from '@angular/router';
import { CreateShipmentComponent } from './components/create-shipment/create-shipment.component';
import { ShipmentFormComponent } from './components/shipment-form/shipment-form.component';
import { NotFoundComponent } from '../not-found/not-found.component';
import { userDataResolver } from '../../core/resolvers/user-data.resolver';
import { shipmentFormDataResolver } from '../../core/resolvers/shipment-form-data.resolver';
import { ShipmentListComponent } from '../dashboard/components/shipment-list/shipment-list.component';

export const SHIPMENT_ROUTES: Routes = [
    {
        path: '',
        component: ShipmentListComponent,
        resolve: { user: userDataResolver }
    },
    { 
        path: 'create', 
        component: CreateShipmentComponent,
        resolve: { 
            user: userDataResolver,
            formData: shipmentFormDataResolver  // Pre-load items and suppliers
        }
    },
    { 
        path: 'track/:id', 
        component: ShipmentFormComponent,
        resolve: { user: userDataResolver }
    },
    { path: '**', component: NotFoundComponent }
];
