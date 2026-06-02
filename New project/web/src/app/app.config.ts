import { ApplicationConfig, provideZonelessChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { Store } from '@ngrx/store';

import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { MessageService } from 'primeng/api';

import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideRouterStore } from '@ngrx/router-store';
import { reducers, metaReducers } from './store/app.state';
import { ShipmentEffects } from './store/shipment/shipment.effects';
import { AuthEffects } from './store/auth/auth.effects';
import { routes } from './app.routes';

import { apiInterceptor } from './core/interceptors/api.interceptor';
import { authTokenInterceptor } from './core/interceptors/auth-token.interceptor';
import { httpErrorInterceptor } from './core/interceptors/http-error.interceptor';
import * as AuthActions from './store/auth/auth.actions';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideCharts(withDefaultRegisterables()),
    provideAnimationsAsync(),
    provideHttpClient(
      withInterceptors([apiInterceptor, authTokenInterceptor, httpErrorInterceptor])
    ),
    provideClientHydration(withEventReplay()),
    providePrimeNG({
        theme: {
            preset: Aura,
            options: {
                darkModeSelector: '.my-app-dark'
            }
        }
    }),
    MessageService,
    provideStore(reducers, { metaReducers }),
    provideEffects([ShipmentEffects, AuthEffects]),
    provideRouterStore(),
    provideStoreDevtools({ maxAge: 25, logOnly: false }),
    provideAppInitializer(() => {
      const store = inject(Store);
      store.dispatch(AuthActions.loadUserFromStorage());
    })
  ]
};
