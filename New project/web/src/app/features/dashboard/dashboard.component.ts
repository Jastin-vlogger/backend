import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import {
  DashboardArrivalSummary,
  DashboardMonthlyTrend,
  DashboardStageBreakdown,
  DashboardSummaryResponse,
} from '../../core/models/shipment.model';
import { DashboardService } from './services/dashboard.service';
import { RbacService } from '../../core/services/rbac.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, BaseChartDirective],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private rbacService = inject(RbacService);

  dashboard = signal<DashboardSummaryResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  orderStatusFilter = signal('All');
  readonly canCreateShipment = computed(() =>
    this.rbacService.hasPermission('shipment.screen.create_shipment.view')
  );

  // New Chart Implementation Setup
  selectedChartType = signal('qtyMapping');

  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' }
    }
  };

  readonly statCards = computed(() => {
    const summary = this.dashboard();
    if (!summary) return [];

    return [
      {
        label: 'Total Shipments',
        value: summary.kpis.totalShipments,
        tone: 'slate',
        icon: 'pi pi-box'
      },
      {
        label: 'Completed',
        value: summary.kpis.completedShipments,
        tone: 'emerald',
        icon: 'pi pi-check-circle'
      },
      {
        label: 'In Progress',
        value: summary.kpis.inProgressShipments,
        tone: 'blue',
        icon: 'pi pi-sync'
      },
      {
        label: 'Under Clearance',
        value: summary.kpis.underClearanceShipments,
        tone: 'amber',
        icon: 'pi pi-globe'
      },
      {
        label: summary.rolePending?.label || 'Pending For Your Role',
        value: summary.rolePending?.count || 0,
        tone: 'rose',
        icon: 'pi pi-hourglass'
      }
    ];
  });

  readonly arrivalMetrics = computed(() => {
    const arrival = this.dashboard()?.arrivalSummary;
    if (!arrival) return [];

    return [
      { label: 'Arrived Containers', value: arrival.arrivedContainers, tone: 'emerald' },
      { label: 'Pending Arrival', value: arrival.pendingArrivalContainers, tone: 'blue' },
      { label: 'Due This Week', value: arrival.dueThisWeekShipments, tone: 'amber' },
      { label: 'Overdue ETA', value: arrival.overdueShipments, tone: 'rose' }
    ];
  });

  readonly stageMax = computed(() =>
    Math.max(...(this.dashboard()?.stageBreakdown ?? []).map((item) => item.count), 0)
  );

  readonly monthlyMax = computed(() =>
    Math.max(...(this.dashboard()?.monthlyTrend ?? []).map((item) => item.count), 0)
  );

  readonly orderStatusOptions = computed(() => {
    const orders = this.dashboard()?.shippingStatus?.orders ?? [];
    const statuses = new Set(orders.map((s) => s.orderStatus).filter(Boolean));
    return ['All', ...Array.from(statuses)];
  });

  readonly filteredOrders = computed(() => {
    const rows = this.dashboard()?.shippingStatus?.orders ?? [];
    const selected = this.orderStatusFilter();
    if (selected === 'All') return rows;
    return rows.filter((row) => (row.orderStatus || '').toLowerCase() === selected.toLowerCase());
  });

  readonly volumeTodayStats = computed(() => {
    const summary = this.dashboard()?.shippingStatus?.volumeToday ?? [];
    if (summary.length) return summary;
    const dashboard = this.dashboard();
    if (!dashboard) return [];
    return [
      { label: 'Total Shipments', value: dashboard.kpis.totalShipments },
      { label: 'Total Shipments', value: dashboard.kpis.inProgressShipments },
      { label: dashboard.rolePending?.label || 'Pending For Your Role', value: dashboard.rolePending?.count || 0 },
      { label: 'Overdue Shipments', value: dashboard.arrivalSummary.overdueShipments },
      { label: 'Open POs', value: dashboard.kpis.totalShipments },
      { label: 'Late Vendor Shipments', value: dashboard.arrivalSummary.pendingArrivalContainers },
    ];
  });

  readonly inventoryRows = computed(() => {
    const inventory = this.dashboard()?.shippingStatus?.inventory ?? [];
    if (inventory.length) return inventory;
    return (this.dashboard()?.recentShipments ?? []).slice(0, 5).map((row) => ({
      category: 'Shipment',
      product: row.item || row.shipmentNo,
      sku: row._id?.slice(-6).toUpperCase(),
      inStock: row.totalAmount ? Math.max(Math.round(row.totalAmount / 10000), 1) : 0,
    }));
  });

  readonly performanceRows = computed(() => {
    const rows = this.dashboard()?.shippingStatus?.financialPerformance ?? [];
    if (rows.length) return rows;

    const trend = this.dashboard()?.monthlyTrend ?? [];
    const labels = ['NA', 'EUR', 'Asia', 'SA'];
    return labels.map((label, index) => {
      const entry = trend[index % Math.max(trend.length, 1)];
      const count = entry?.count ?? 0;
      return {
        label,
        cashToCash: Math.max(count * 3 - 10, -15),
        accountRec: Math.max(count * 2, 5),
        inventoryDays: Math.max(count * 2 + 4, 8),
        payableDays: Math.max(count * 3 + 6, 12),
      };
    });
  });

  readonly kpiMonthlyRows = computed(() => {
    const rows = this.dashboard()?.shippingStatus?.monthlyKpis ?? [];
    if (rows.length) return rows;

    const trend = this.dashboard()?.monthlyTrend ?? [];
    return trend.slice(-4).map((entry, index, arr) => {
      const prev = arr[index - 1]?.count ?? entry.count ?? 1;
      const change = prev ? ((entry.count - prev) / prev) * 100 : 0;
      return {
        metric: `${entry.label} ${entry.year}`,
        thisMonth: entry.count,
        pastMonth: prev,
        change,
      };
    });
  });

  readonly recentShipments = computed(() => {
    return this.dashboard()?.recentShipments ?? [];
  });

  getStatusSeverity(status: string | null | undefined): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const s = String(status || '').trim().toLowerCase();
    if (!s) return 'secondary';
    if (s.includes('reached wh')) return 'success';
    if (s.includes('at port of discharge')) return 'warn';
    if (s.includes('on transit')) return 'info';
    if (s.includes('etd yet to due')) return 'secondary';
    if (s.includes('completed')) return 'success';
    if (s.includes('delayed') || s.includes('error')) return 'danger';
    return 'secondary';
  }

  readonly chartDataConfig = computed<ChartData<'bar'>>(() => {
    const data = this.dashboard()?.chartData;
    if (!data) return { labels: [], datasets: [] };

    const type = this.selectedChartType();
    let matrix: any[] = [];
    if (type === 'qtyMapping') matrix = data.qtyMapping;
    else if (type === 'valueMapping') matrix = data.valueMapping;
    else if (type === 'yearlyQtyMapping') matrix = data.yearlyQtyMapping;
    else if (type === 'supplierAvgFc') matrix = data.supplierAvgFc;
    else if (type === 'supplierYearlyQty') matrix = data.supplierYearlyQty;

    if (!matrix || matrix.length === 0) return { labels: [], datasets: [] };

    const labels = matrix.map(row => row.rowLabel);
    
    // Collect all columns across all rows excluding 'rowLabel'
    const columnsSet = new Set<string>();
    matrix.forEach(row => {
      Object.keys(row).forEach(k => {
        if (k !== 'rowLabel') columnsSet.add(k);
      });
    });
    
    // To match excel, we might hardcode or let it be dynamic
    const columns = Array.from(columnsSet);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

    const datasets = columns.map((col, index) => {
      return {
        data: matrix.map(row => Number(row[col]) || 0),
        label: col,
        backgroundColor: colors[index % colors.length]
      };
    });

    return { labels, datasets };
  });

  readonly comparisonChartConfig = computed<ChartData<'bar'>>(() => {
    const data = this.dashboard()?.chartData;
    if (!data || !data.supplierAvgFc || data.supplierAvgFc.length === 0) return { labels: [], datasets: [] };

    const matrix = data.supplierAvgFc;
    const labels = matrix.map((row: any) => row.rowLabel);
    
    // Collect all columns across all rows excluding 'rowLabel'
    const columnsSet = new Set<string>();
    matrix.forEach((row: any) => {
      Object.keys(row).forEach(k => {
        if (k !== 'rowLabel') columnsSet.add(k);
      });
    });
    
    const columns = Array.from(columnsSet);
    // Use alternate palette to differentiate from primary chart
    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

    const datasets = columns.map((col, index) => {
      return {
        data: matrix.map((row: any) => Number(row[col]) || 0),
        label: col,
        backgroundColor: colors[index % colors.length]
      };
    });

    return { labels, datasets };
  });

  ngOnInit(): void {
    this.dashboardService.getSummary().subscribe({
      next: (summary) => {
        this.dashboard.set(summary);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load dashboard data right now.');
        this.loading.set(false);
      }
    });
  }

  getStageWidth(entry: DashboardStageBreakdown): string {
    const max = this.stageMax();
    if (!max) return '0%';
    return `${Math.max((entry.count / max) * 100, 8)}%`;
  }

  getTrendHeight(entry: DashboardMonthlyTrend): string {
    const max = this.monthlyMax();
    if (!max) return '12%';
    return `${Math.max((entry.count / max) * 100, 12)}%`;
  }

  getArrivalWidth(value: number, summary: DashboardArrivalSummary | undefined): string {
    const total = summary
      ? Math.max(
          summary.arrivedContainers,
          summary.pendingArrivalContainers,
          summary.dueThisWeekShipments,
          summary.overdueShipments,
          1
        )
      : 1;

    return `${Math.max((value / total) * 100, 10)}%`;
  }

  onOrderStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value || 'All';
    this.orderStatusFilter.set(value);
  }

  onChartTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value || 'qtyMapping';
    this.selectedChartType.set(value);
  }

  getStagePieGradient(): string {
    const stages = this.dashboard()?.stageBreakdown ?? [];
    const total = stages.reduce((sum, item) => sum + item.count, 0);
    if (!total) {
      return 'conic-gradient(#e2e8f0 0 100%)';
    }

    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    let cursor = 0;
    const slices = stages.map((item, index) => {
      const share = (item.count / total) * 100;
      const start = cursor;
      cursor += share;
      return `${palette[index % palette.length]} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${slices.join(',')})`;
  }

  getPerfBarHeight(value: number): string {
    const max = Math.max(
      ...this.performanceRows().flatMap((row) => [row.cashToCash, row.accountRec, row.inventoryDays, row.payableDays]),
      1
    );
    const normalized = ((value + 20) / (max + 20)) * 100;
    return `${Math.max(8, Math.min(normalized, 100))}%`;
  }
}
