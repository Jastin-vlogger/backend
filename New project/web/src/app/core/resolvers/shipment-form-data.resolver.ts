import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { Item } from '../models/item.model';
import { ItemService } from '../services/item.service';
import { SupplierService } from '../services/supplier.service';
import { Supplier } from '../models/supplier.model';

export interface ShipmentFormData {
  items: Item[];
  suppliers: Supplier[];
}

/**
 * Shipment Form Data Resolver
 * Loads Suppliers before rendering the create shipment page
 * Usage: Add to route config: resolve: { formData: shipmentFormDataResolver }
 */
export const shipmentFormDataResolver: ResolveFn<ShipmentFormData> = () => {
  const itemService = inject(ItemService);
  const supplierService = inject(SupplierService);

  return forkJoin({
    items: itemService.getAllItems(1, 100),
    suppliers: supplierService.getAllSuppliers(1, 100)
  }).pipe(
    map(({ items, suppliers }) => ({
      items: items.items,
      suppliers: suppliers.suppliers
    }))
  );
};
