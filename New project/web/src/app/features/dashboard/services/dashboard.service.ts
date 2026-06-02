import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { DashboardSummaryResponse, Shipment, ShipmentListResponse } from '../../../core/models/shipment.model';
import { ShipmentService } from '../../../core/services/shipment.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private shipmentService = inject(ShipmentService);

  getSummary(): Observable<DashboardSummaryResponse> {
    return this.shipmentService.getDashboardSummary().pipe(
      map((response: any) => this.normalizeSummary(response)),
      switchMap((summary) => {
        if (this.hasUsefulSummary(summary)) {
          return of(summary);
        }

        return this.shipmentService.getShipments(1, 100).pipe(
          map((listResponse) => this.buildFallbackSummary(summary, listResponse)),
          catchError(() => of(summary))
        );
      }),
      catchError(() =>
        this.shipmentService.getShipments(1, 100).pipe(
          map((listResponse) => this.buildFallbackSummary(this.normalizeSummary(null), listResponse))
        )
      )
    );
  }

  private normalizeSummary(response: any): DashboardSummaryResponse {
    return {
        kpis: {
          totalShipments: response?.kpis?.totalShipments ?? response?.totalShipments ?? 0,
          completedShipments: response?.kpis?.completedShipments ?? response?.completedShipments ?? 0,
          inProgressShipments: response?.kpis?.inProgressShipments ?? response?.inProgressShipments ?? 0,
          underClearanceShipments: response?.kpis?.underClearanceShipments ?? 0,
          totalPaymentExposure: response?.kpis?.totalPaymentExposure ?? 0
        },
        stageBreakdown: Array.isArray(response?.stageBreakdown) ? response.stageBreakdown : [],
        monthlyTrend: Array.isArray(response?.monthlyTrend) ? response.monthlyTrend : [],
        arrivalSummary: {
          totalContainers: response?.arrivalSummary?.totalContainers ?? 0,
          arrivedContainers: response?.arrivalSummary?.arrivedContainers ?? 0,
          pendingArrivalContainers: response?.arrivalSummary?.pendingArrivalContainers ?? 0,
          clearedContainers: response?.arrivalSummary?.clearedContainers ?? 0,
          dueThisWeekShipments: response?.arrivalSummary?.dueThisWeekShipments ?? 0,
          overdueShipments: response?.arrivalSummary?.overdueShipments ?? 0,
          etaScheduledShipments: response?.arrivalSummary?.etaScheduledShipments ?? 0
        },
        paymentSummary: {
          totalAmount: response?.paymentSummary?.totalAmount ?? 0,
          paidAmount: response?.paymentSummary?.paidAmount ?? 0,
          balanceAmount: response?.paymentSummary?.balanceAmount ?? 0,
          pendingShipments: response?.paymentSummary?.pendingShipments ?? 0,
          partiallyPaidShipments: response?.paymentSummary?.partiallyPaidShipments ?? 0,
          paidShipments: response?.paymentSummary?.paidShipments ?? 0
        },
        rolePending: {
          role: response?.rolePending?.role ?? '',
          label: response?.rolePending?.label ?? 'Pending For Your Role',
          count: response?.rolePending?.count ?? 0
        },
        recentShipments: Array.isArray(response?.recentShipments) ? response.recentShipments : [],
        shippingStatus: {
          orders: Array.isArray(response?.shippingStatus?.orders) ? response.shippingStatus.orders : [],
          volumeToday: Array.isArray(response?.shippingStatus?.volumeToday) ? response.shippingStatus.volumeToday : [],
          inventory: Array.isArray(response?.shippingStatus?.inventory) ? response.shippingStatus.inventory : [],
          financialPerformance: Array.isArray(response?.shippingStatus?.financialPerformance)
            ? response.shippingStatus.financialPerformance
            : [],
          monthlyKpis: Array.isArray(response?.shippingStatus?.monthlyKpis) ? response.shippingStatus.monthlyKpis : []
        },
        chartData: response?.chartData
      };
  }

  private hasUsefulSummary(summary: DashboardSummaryResponse): boolean {
    return (
      summary.kpis.totalShipments > 0 ||
      summary.stageBreakdown.length > 0 ||
      summary.monthlyTrend.some((item) => item.count > 0) ||
      summary.recentShipments.length > 0
    );
  }

  private buildFallbackSummary(
    summary: DashboardSummaryResponse,
    listResponse: ShipmentListResponse
  ): DashboardSummaryResponse {
    const shipments = listResponse.shipments ?? [];

    if (!shipments.length) {
      return {
        ...summary,
        kpis: {
          ...summary.kpis,
          totalShipments: summary.kpis.totalShipments || listResponse.totalRecords || 0,
          completedShipments: summary.kpis.completedShipments || 0,
          inProgressShipments: summary.kpis.inProgressShipments || 0,
        },
      };
    }

    const completedShipments = shipments.filter((shipment) =>
      (shipment.status || '').toLowerCase().includes('completed')
    ).length;
    const underClearanceShipments = shipments.filter((shipment) => {
      const status = (shipment.status || '').toLowerCase();
      return status.includes('clearance') || status.includes('cleared') || status.includes('released');
    }).length;

    const stageMap = new Map<string, number>();
    const monthMap = new Map<string, { label: string; month: number; year: number; count: number }>();

    shipments.forEach((shipment) => {
      const stage = shipment.status || 'Unknown';
      stageMap.set(stage, (stageMap.get(stage) || 0) + 1);

      const shipmentDate = shipment.orderDate ? new Date(shipment.orderDate) : null;
      if (shipmentDate && !Number.isNaN(shipmentDate.getTime())) {
        const month = shipmentDate.getMonth() + 1;
        const year = shipmentDate.getFullYear();
        const key = `${year}-${month}`;
        const existing = monthMap.get(key);

        if (existing) {
          existing.count += 1;
        } else {
          monthMap.set(key, {
            label: shipmentDate.toLocaleString('en-US', { month: 'short' }),
            month,
            year,
            count: 1
          });
        }
      }
    });

    const sortedRecent = [...shipments].sort((a, b) => {
      const aDate = a.orderDate ? new Date(a.orderDate).getTime() : 0;
      const bDate = b.orderDate ? new Date(b.orderDate).getTime() : 0;
      return bDate - aDate;
    });

    return {
      ...summary,
      kpis: {
        totalShipments: listResponse.totalRecords || shipments.length,
        completedShipments,
        inProgressShipments:
          (listResponse.totalRecords || shipments.length) - completedShipments,
        underClearanceShipments: summary.kpis.underClearanceShipments || underClearanceShipments,
        totalPaymentExposure:
          summary.kpis.totalPaymentExposure ||
          shipments.reduce((total, shipment) => total + (shipment.totalFC || 0), 0)
      },
      stageBreakdown:
        summary.stageBreakdown.length > 0
          ? summary.stageBreakdown
          : Array.from(stageMap.entries()).map(([stage, count]) => ({ stage, count })),
      monthlyTrend:
        summary.monthlyTrend.some((item) => item.count > 0)
          ? summary.monthlyTrend
          : Array.from(monthMap.values()).sort(
              (a, b) => a.year - b.year || a.month - b.month
            ),
      recentShipments:
        summary.recentShipments.length > 0
          ? summary.recentShipments
          : sortedRecent.slice(0, 5).map((shipment: Shipment) => ({
              _id: shipment._id,
              shipmentNo: shipment.shipmentNo,
              orderDate: shipment.orderDate,
              plannedETA: undefined,
              status: shipment.status,
              totalAmount: shipment.totalFC,
              supplier: shipment.supplier,
              item: shipment.description
            }))
    };
  }
}
