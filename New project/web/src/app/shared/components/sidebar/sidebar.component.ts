import { Component, EventEmitter, Input, Output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { RbacService } from '../../../core/services/rbac.service';

interface SidebarMenuItem {
  label: string;
  icon: string;
  route: string;
  /** Permission key that gates this menu item. If omitted the item is always shown. */
  permissionKey?: string;
  /** When true, only Admin/Manager can see this item regardless of permissions. */
  adminOnly?: boolean;
}

/** Full menu definition — order here is the display order. */
const ALL_MENU_ITEMS: SidebarMenuItem[] = [
  { label: 'Dashboard',      icon: 'pi pi-chart-bar',  route: '/dashboard',           permissionKey: 'menu.dashboard.view' },
  { label: 'Shipments',      icon: 'pi pi-truck',       route: '/shipments',           permissionKey: 'menu.shipments.view' },
  { label: 'Suppliers',      icon: 'pi pi-users',       route: '/suppliers',           permissionKey: 'menu.suppliers.view' },
  { label: 'Reports',        icon: 'pi pi-chart-line',  route: '/reports',             permissionKey: 'menu.reports.view' },
  { label: 'Access Control', icon: 'pi pi-shield',      route: '/access-control',      permissionKey: 'menu.access_control.view', adminOnly: true },
  { label: 'Settings',       icon: 'pi pi-cog',         route: '/settings/warehouses', permissionKey: 'menu.settings.view' },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  @Input() collapsed = false;
  @Output() toggleCollapse = new EventEmitter<void>();

  private readonly authService = inject(AuthService);
  private readonly rbacService = inject(RbacService);

  /**
   * Reactive signal — updates whenever effective permissions are loaded/changed.
   * Starts as null (not yet loaded).
   */
  private readonly permissions = toSignal(this.rbacService.permissions$, { initialValue: null });

  /**
   * Computed menu items — re-evaluated every time permissions change.
   *
   * Rules:
   * - While permissions are still loading (null), show all non-adminOnly items
   *   so the sidebar isn't blank on first render.
   * - Once permissions are loaded, filter strictly by permissionKey from the DB.
   * - adminOnly items (Access Control) are always gated by role, never by permission key alone.
   */
  readonly menuItems = computed<SidebarMenuItem[]>(() => {
    const perms = this.permissions();
    const role = this.authService.getCurrentUser()?.role;
    const isAccessManager = role === 'Admin' || role === 'Manager';
    const permissionsLoaded = perms !== null;

    return ALL_MENU_ITEMS.filter((item) => {
      // Access Control is always admin/manager only
      if (item.adminOnly) {
        return isAccessManager;
      }

      // While permissions haven't loaded yet, show all non-adminOnly items
      // so the sidebar isn't blank during the initial API call.
      if (!permissionsLoaded) {
        return true;
      }

      // Once loaded, check the permission key against what the DB returned
      if (!item.permissionKey) return true;
      return this.rbacService.hasPermission(item.permissionKey);
    });
  });

  onToggleCollapse(): void {
    this.toggleCollapse.emit();
  }
}
