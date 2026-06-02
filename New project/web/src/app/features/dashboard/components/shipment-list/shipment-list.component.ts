import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { PrimaryButtonDirective } from '../../../../shared/directives/button.directive';
import { ShipmentService } from '../../../../core/services/shipment.service';
import { Shipment } from '../../../../core/models/shipment.model';
import { RbacService } from '../../../../core/services/rbac.service';

@Component({
    selector: 'app-shipment-list',
    standalone: true,
    imports: [
        CommonModule, 
        PrimaryButtonDirective, 
        RouterLink,
        SkeletonModule
    ],
    templateUrl: './shipment-list.component.html',
    styleUrls: ['./shipment-list.component.scss']
})
export class ShipmentListComponent implements OnInit {
    private shipmentService = inject(ShipmentService);
    private rbacService = inject(RbacService);
    protected readonly Math = Math;

    // Use signals for better zoneless change detection
    shipments = signal<Shipment[]>([]);
    loading = signal(true);
    currentPage = signal(1);
    pageSize = signal(20);
    totalRecords = signal(0);
    totalPages = signal(0);
    searchQuery = signal('');
    readonly canCreateShipment = computed(() =>
        this.rbacService.hasPermission('shipment.screen.create_shipment.view')
    );
    private readonly searchInput$ = new Subject<string>();

    ngOnInit() {
        this.searchInput$
            .pipe(debounceTime(300), distinctUntilChanged())
            .subscribe((value) => {
                this.searchQuery.set(value.trim());
                this.currentPage.set(1);
                this.fetchShipments();
            });
        this.fetchShipments();
    }

    fetchShipments() {
        this.loading.set(true);

        const request$ = this.searchQuery()
            ? this.shipmentService.searchShipments(this.searchQuery(), this.currentPage(), this.pageSize())
            : this.shipmentService.getShipments(this.currentPage(), this.pageSize());

        request$.subscribe({
            next: (response) => {
                this.shipments.set(response.shipments);
                this.totalRecords.set(response.totalRecords);
                this.totalPages.set(response.totalPages);
                this.currentPage.set(response.page);
                this.loading.set(false);
            },
            error: (error) => {
                console.error('Error fetching shipments:', error);
                this.loading.set(false);
            }
        });
    }

    onPageChange(page: number) {
        if (page >= 1 && page <= this.totalPages()) {
            this.currentPage.set(page);
            this.fetchShipments();
        }
    }

    onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement)?.value ?? '';
        this.searchInput$.next(value);
    }

    clearSearch(): void {
        this.searchQuery.set('');
        this.currentPage.set(1);
        this.fetchShipments();
    }

    getDisplaySerial(index: number): number {
        return this.totalRecords() - ((this.currentPage() - 1) * this.pageSize() + index);
    }

    getDisplayStageName(status: string | null | undefined): string {
        return String(status || '').trim() === 'Planned Split' ? 'Shipment Split' : String(status || '');
    }

    getSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
        const displayStatus = this.getDisplayStageName(status);
        if (!displayStatus) return 'secondary';
        const s = displayStatus.toLowerCase();
        if (s.includes('reached wh')) return 'success';
        if (s.includes('at port of discharge')) return 'warn';
        if (s.includes('on transit')) return 'info';
        if (s.includes('etd yet to due')) return 'secondary';
        if (s.includes('completed') || s === 'payment costing') return 'success';
        if (s.includes('quality')) return 'success';
        if (s.includes('storage')) return 'info';
        if (s.includes('port') || s.includes('customs')) return 'warn';
        if (s.includes('documentation')) return 'warn';
        if (s.includes('b/l') || s.includes('bl ')) return 'warn';
        if (s.includes('split')) return 'info';
        if (s.includes('entry')) return 'secondary';
        if (s.includes('delayed') || s.includes('error')) return 'danger';
        return 'secondary';
    }
}
