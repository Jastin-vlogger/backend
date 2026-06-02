import { ActionReducerMap, MetaReducer } from '@ngrx/store';
import { routerReducer, RouterReducerState } from '@ngrx/router-store';
import { shipmentReducer } from './shipment/shipment.reducer';
import { ShipmentState } from './shipment/shipment.state';
import { uiReducer } from './ui/ui.reducer';
import { authReducer, AuthState } from './auth/auth.reducer';

export interface AppState {
    router: RouterReducerState;
    shipment: ShipmentState;
    ui: any;
    auth: AuthState;
}

export const reducers: ActionReducerMap<AppState> = {
    router: routerReducer,
    shipment: shipmentReducer,
    ui: uiReducer,
    auth: authReducer,
};

export const metaReducers: MetaReducer<AppState>[] = [];
