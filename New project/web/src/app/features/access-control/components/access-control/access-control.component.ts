import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { MultiSelectModule } from 'primeng/multiselect';
import { AccessControlService } from '../../../../core/services/access-control.service';
import { AccessPermission, AccessPermissionGroup, AccessRole, AccessUser, BlRowDefinitionAdminItem } from '../../../../core/models/access-control.model';
import { AuthService } from '../../../../core/services/auth.service';
import { ConfirmDialogService } from '../../../../core/services/confirm-dialog.service';

type AccessTabKey = 'roles' | 'menu' | 'permissions' | 'users';

/** One row in the permission matrix — one screen/tab per row */
interface PermissionMatrixRow {
  /** Unique key for this row (matches tab or screen key) */
  key: string;
  /** Human-readable label */
  label: string;
  /** The single "view" permission for this row, if any */
  viewPermission: AccessPermission | null;
  /** The single "edit" permission for this row, if any */
  editPermission: AccessPermission | null;
  /** All field-level permissions belonging to this row */
  fieldPermissions: AccessPermission[];
  /** All action-level permissions (lock_baseline, generate_report, etc.) */
  actionPermissions: AccessPermission[];
  /** Child rows — used for tabs that have sub-tabs (Storage, Payment & Costing) */
  children?: PermissionMatrixRow[];
  /** Optional description for the row */
  description?: string;
}

/** Describes how to build a matrix row from the flat permission list */
interface RowDefinition {
  key: string;
  label: string;
  description?: string;
  /** Match permissions by tab value; if omitted, match by screen */
  tabKey?: string;
  /** Match permissions by screen value (used when tabKey is absent) */
  screenKey?: string;
  /** Explicit action keys that represent "view" for this row */
  viewActionKey?: string;
  /** Explicit action keys that represent "edit" for this row */
  editActionKey?: string;
  /** Explicit permission key overrides for cases where a child row reuses a parent permission */
  viewPermissionKey?: string;
  editPermissionKey?: string;
  /** Exact permission keys that belong to this row itself, excluding child sub-tabs */
  ownPermissionKeys?: string[];
  children?: RowDefinition[];
  hiddenPermissionKeys?: string[];
}

@Component({
  selector: 'app-access-control',
  standalone: true,
  imports: [CommonModule, FormsModule, MultiSelectModule],
  templateUrl: './access-control.component.html',
  styleUrl: './access-control.component.scss',
})
export class AccessControlComponent {
  private accessControlService = inject(AccessControlService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);
  private confirmDialog = inject(ConfirmDialogService);

  readonly activeTab = signal<AccessTabKey>('roles');
  readonly rolesLoading = signal(false);
  readonly permissionsLoading = signal(false);
  readonly usersLoading = signal(false);
  readonly blRowsLoading = signal(false);
  readonly saveLoading = signal(false);
  readonly resetPasswordLoading = signal(false);
  readonly blRowSaveId = signal<string | 'new' | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly roles = signal<AccessRole[]>([]);
  readonly selectedRoleId = signal<string | null>(null);
  readonly permissionGroups = signal<AccessPermissionGroup[]>([]);
  readonly blRowDefinitions = signal<BlRowDefinitionAdminItem[]>([]);
  readonly users = signal<AccessUser[]>([]);
  readonly selectedUserId = signal<string | null>(null);
  readonly userSearch = signal<string>('');
  readonly userPage = signal<number>(1);
  readonly userTotalPages = signal<number>(1);
  readonly userTotal = signal<number>(0);
  readonly userPageSize = 20;
  private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Tracks which matrix rows are expanded (by row key) */
  readonly expandedRowKeys = signal<Set<string>>(new Set());

  readonly roleForm = signal({ key: '', name: '', description: '', isActive: true });
  readonly editingRoleId = signal<string | null>(null);
  readonly userForm = signal({ email: '', name: '', role: '', isActive: true });
  readonly newBlRowForm = signal({ description: '', visibleTo: [] as string[], defaultQty: 1, defaultRate: 0 });

  readonly canManageAccess = computed(() => {
    return this.authService.isAdminLevelRole();
  });

  readonly selectedRole = computed(() =>
    this.roles().find((r) => r._id === this.selectedRoleId()) ?? null
  );

  readonly filteredUsers = computed(() => this.users());

  readonly generatedRoleKey = computed(() => {
    if (this.editingRoleId()) {
      return this.roleForm().key;
    }

    return String(this.roleForm().name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  });

  readonly selectedPermissionKeys = computed(() =>
    this.permissionGroups()
      .flatMap((g) => g.permissions)
      .filter((p) => p.assigned)
      .map((p) => p.key)
  );

  // ─── Permission matrix definition ────────────────────────────────────────
  private readonly ROW_DEFINITIONS: RowDefinition[] = [
    {
      key: 'create_shipment',
      label: 'Create Shipment',
      screenKey: 'create_shipment',
    },
    {
      key: 'settings',
      label: 'Settings',
      screenKey: 'settings',
      ownPermissionKeys: ['menu.settings.view'],
      hiddenPermissionKeys: [
        'settings.tab.warehouses.view',
        'settings.tab.warehouses.edit',
        'settings.tab.item_codes.view',
        'settings.tab.item_codes.edit',
        'settings.tab.transportation.view',
        'settings.tab.transportation.edit',
        'settings.tab.exchange_rates.view',
        'settings.tab.exchange_rates.edit',
      ],
      children: [
        {
          key: 'settings_warehouses',
          label: 'Warehouses',
          description: 'Warehouse setup and storekeeper assignment.',
          tabKey: 'warehouses',
          viewPermissionKey: 'settings.tab.warehouses.view',
          editPermissionKey: 'settings.tab.warehouses.edit',
        },
        {
          key: 'settings_item_codes',
          label: 'Item Codes',
          description: 'Item code and commodity master data.',
          tabKey: 'item_codes',
          viewPermissionKey: 'settings.tab.item_codes.view',
          editPermissionKey: 'settings.tab.item_codes.edit',
        },
        {
          key: 'settings_transportation',
          label: 'Transportation',
          description: 'Transportation company master data.',
          tabKey: 'transportation',
          viewPermissionKey: 'settings.tab.transportation.view',
          editPermissionKey: 'settings.tab.transportation.edit',
        },
        {
          key: 'settings_exchange_rates',
          label: 'Exchange Rates',
          description: 'Bank exchange rate master data.',
          tabKey: 'exchange_rates',
          viewPermissionKey: 'settings.tab.exchange_rates.view',
          editPermissionKey: 'settings.tab.exchange_rates.edit',
        },
      ],
    },
    {
      key: 'shipment_entry',
      label: 'Shipment Entry',
      tabKey: 'shipment_entry',
      hiddenPermissionKeys: ['shipment.field.shipment_entry.piNo.edit'],
    },
    {
      key: 'shipment_tracker_split',
      label: 'Shipment Tracker Split',
      tabKey: 'shipment_tracker_split',
      hiddenPermissionKeys: [
        'shipment.tab.shipment_tracker_split.scheduled.view',
        'shipment.tab.shipment_tracker_split.scheduled.edit',
        'shipment.tab.shipment_tracker_split.actual.view',
        'shipment.tab.shipment_tracker_split.actual.edit',
        'shipment.tab.shipment_tracker_split.history.view',
        'shipment.tab.shipment_tracker_split.history.edit',
        'shipment.tab.shipment_tracker_split.report.view',
        'shipment.tab.shipment_tracker_split.report.edit',
      ],
      children: [
        {
          key: 'shipment_tracker_split_scheduled',
          label: 'Scheduled',
          description: 'Planned shipment split table with FCL, container size, Qty MT, ETD, ETA, month, and week controls.',
          tabKey: 'shipment_tracker_split',
          viewPermissionKey: 'shipment.tab.shipment_tracker_split.scheduled.view',
          editPermissionKey: 'shipment.tab.shipment_tracker_split.scheduled.edit',
          viewActionKey: 'scheduled_view',
          editActionKey: 'scheduled_edit',
        },
        {
          key: 'shipment_tracker_split_actual',
          label: 'Actual',
          description: 'Actual arrival split table with container details, bags, BL extraction, and actual submission workflow.',
          tabKey: 'shipment_tracker_split',
          viewPermissionKey: 'shipment.tab.shipment_tracker_split.actual.view',
          editPermissionKey: 'shipment.tab.shipment_tracker_split.actual.edit',
          viewActionKey: 'actual_view',
          editActionKey: 'actual_edit',
        },
        {
          key: 'shipment_tracker_split_history',
          label: 'History',
          description: 'Scheduled history log showing baseline creation, updates, and row-level differences over time.',
          tabKey: 'shipment_tracker_split',
          viewPermissionKey: 'shipment.tab.shipment_tracker_split.history.view',
          editPermissionKey: 'shipment.tab.shipment_tracker_split.history.edit',
          viewActionKey: 'history_view',
          editActionKey: 'history_edit',
        },
        {
          key: 'shipment_tracker_split_report',
          label: 'Report',
          description: 'ETA / ETD change report table for shipment-wise scheduled date updates.',
          tabKey: 'shipment_tracker_split',
          viewPermissionKey: 'shipment.tab.shipment_tracker_split.report.view',
          editPermissionKey: 'shipment.tab.shipment_tracker_split.report.edit',
          viewActionKey: 'report_view',
          editActionKey: 'report_edit',
        },
      ],
    },
    {
      key: 'bl_details',
      label: 'BL Details',
      tabKey: 'bl_details',
      ownPermissionKeys: [
        'shipment.tab.bl_details.view',
        'shipment.tab.bl_details.edit',
        'shipment.field.bl_details.blNo.edit',
      ],
      hiddenPermissionKeys: [
        'shipment.tab.bl_details.clearing_advance.view',
        'shipment.tab.bl_details.clearing_advance.edit',
        'shipment.tab.bl_details.clearing_advance.approve_fas',
        'shipment.tab.bl_details.clearing_advance.approve_fas_manager',
        'shipment.tab.bl_details.storage_allocations.view',
        'shipment.tab.bl_details.storage_allocations.edit',
        'shipment.tab.bl_details.storage_allocations.approve_warehouse_manager',
        'shipment.tab.bl_details.packaging_list.view',
        'shipment.tab.bl_details.packaging_list.edit',
        'shipment.tab.payment_costing.costing_table.approve_fas_manager',
      ],
      children: [
        {
          key: 'clearing_advance',
          label: 'Clearing Advance',
          description: 'Cost sheet booking area with request amounts, remarks, attachment upload, and report generation.',
          tabKey: 'bl_details',
          viewPermissionKey: 'shipment.tab.bl_details.clearing_advance.view',
          editPermissionKey: 'shipment.tab.bl_details.clearing_advance.edit',
          viewActionKey: 'clearing_advance_view',
          editActionKey: 'clearing_advance_edit',
        },
        {
          key: 'clearing_advance_approve_fas',
          label: 'Clearing Advance Approval (FAS)',
          description: 'Allows FAS users to approve clearing advance after Logistics submits it.',
          tabKey: 'bl_details',
          editPermissionKey: 'shipment.tab.bl_details.clearing_advance.approve_fas',
          editActionKey: 'clearing_advance_approve_fas',
        },
        {
          key: 'clearing_advance_approve_fas_manager',
          label: 'Clearing Advance Approval (FAS Manager)',
          description: 'Allows FasManager users to give final approval for clearing advance.',
          tabKey: 'bl_details',
          editPermissionKey: 'shipment.tab.bl_details.clearing_advance.approve_fas_manager',
          editActionKey: 'clearing_advance_approve_fas_manager',
        },
        {
          key: 'storage_allocations_bl',
          label: 'Storage Allocations',
          description: 'Storage allocation table with container serial number, bags, warehouse mapping, and save action.',
          tabKey: 'bl_details',
          viewPermissionKey: 'shipment.tab.bl_details.storage_allocations.view',
          editPermissionKey: 'shipment.tab.bl_details.storage_allocations.edit',
          viewActionKey: 'storage_allocations_view',
          editActionKey: 'storage_allocations_edit',
        },
        {
          key: 'storage_allocations_approve_warehouse_manager',
          label: 'Storage Allocation Approval (Warehouse Manager)',
          description: 'Allows Warehouse Manager users to approve storage allocations after submission.',
          tabKey: 'bl_details',
          editPermissionKey: 'shipment.tab.bl_details.storage_allocations.approve_warehouse_manager',
          editActionKey: 'storage_allocations_approve_warehouse_manager',
        },
        {
          key: 'packaging_list',
          label: 'Packaging List',
          description: 'Packaging list preview showing container information, bag counts, and packaging summary.',
          tabKey: 'bl_details',
          viewPermissionKey: 'shipment.tab.bl_details.packaging_list.view',
          editPermissionKey: 'shipment.tab.bl_details.packaging_list.edit',
          viewActionKey: 'packaging_list_view',
          editActionKey: 'packaging_list_edit',
        },
        {
          key: 'payment_allocation',
          label: 'Payment Allocation',
          tabKey: 'payment_costing',
          viewPermissionKey: 'shipment.tab.payment_costing.payment_allocation.view',
          editPermissionKey: 'shipment.tab.payment_costing.payment_allocation.edit',
          viewActionKey: 'payment_allocation_view',
          editActionKey: 'payment_allocation_edit',
        },
        {
          key: 'costing_table',
          label: 'Payment Costing Table',
          tabKey: 'payment_costing',
          viewPermissionKey: 'shipment.tab.payment_costing.costing_table.view',
          editPermissionKey: 'shipment.tab.payment_costing.costing_table.edit',
          viewActionKey: 'costing_table_view',
          editActionKey: 'costing_table_edit',
        },
        {
          key: 'costing_table_approve_fas_manager',
          label: 'Payment Costing Approval (FAS Manager)',
          description: 'Allows FasManager users to approve payment costing after FAS saves it.',
          tabKey: 'payment_costing',
          editPermissionKey: 'shipment.tab.payment_costing.costing_table.approve_fas_manager',
          editActionKey: 'costing_table_approve_fas_manager',
        },
      ],
    },
    {
      key: 'document_tracker',
      label: 'Document Tracker',
      tabKey: 'document_tracker',
      ownPermissionKeys: [
        'shipment.tab.document_tracker.view',
        'shipment.tab.document_tracker.edit',
        'shipment.tab.document_tracker.preview',
      ],
      hiddenPermissionKeys: [
        'shipment.tab.document_tracker.milestone_1.view',
        'shipment.tab.document_tracker.milestone_1.edit',
        'shipment.tab.document_tracker.milestone_2.view',
        'shipment.tab.document_tracker.milestone_2.edit',
        'shipment.tab.document_tracker.milestone_3.view',
        'shipment.tab.document_tracker.milestone_3.edit',
        'shipment.tab.document_tracker.milestone_4.view',
        'shipment.tab.document_tracker.milestone_4.edit',
        'shipment.tab.document_tracker.milestone_5.view',
        'shipment.tab.document_tracker.milestone_5.edit',
        'shipment.tab.document_tracker.milestone_6.view',
        'shipment.tab.document_tracker.milestone_6.edit',
        'shipment.milestone.purchase.edit',
        'shipment.milestone.fas.edit',
      ],
      children: [
        {
          key: 'document_tracker_milestone_1',
          label: 'Milestone 1',
          description: 'Courier Logistics with B/L, courier tracking number, courier provider, and document arrival notes.',
          tabKey: 'document_tracker',
          viewPermissionKey: 'shipment.tab.document_tracker.milestone_1.view',
          editPermissionKey: 'shipment.tab.document_tracker.milestone_1.edit',
          viewActionKey: 'milestone_1_view',
          editActionKey: 'milestone_1_edit',
        },
        {
          key: 'document_tracker_milestone_2',
          label: 'Milestone 2',
          description: 'Receiver and bank setup with receiver type, bank name, and expected document date.',
          tabKey: 'document_tracker',
          viewPermissionKey: 'shipment.tab.document_tracker.milestone_2.view',
          editPermissionKey: 'shipment.tab.document_tracker.milestone_2.edit',
          viewActionKey: 'milestone_2_view',
          editActionKey: 'milestone_2_edit',
        },
        {
          key: 'document_tracker_milestone_3',
          label: 'Milestone 3',
          description: 'Inward Collection Advice with notice date, upload, and preview actions.',
          tabKey: 'document_tracker',
          viewPermissionKey: 'shipment.tab.document_tracker.milestone_3.view',
          editPermissionKey: 'shipment.tab.document_tracker.milestone_3.edit',
          viewActionKey: 'milestone_3_view',
          editActionKey: 'milestone_3_edit',
        },
        {
          key: 'document_tracker_milestone_4',
          label: 'Milestone 4',
          description: 'Murabaha contract processing details and date controls for finance handling.',
          tabKey: 'document_tracker',
          viewPermissionKey: 'shipment.tab.document_tracker.milestone_4.view',
          editPermissionKey: 'shipment.tab.document_tracker.milestone_4.edit',
          viewActionKey: 'milestone_4_view',
          editActionKey: 'milestone_4_edit',
        },
        {
          key: 'document_tracker_milestone_5',
          label: 'Milestone 5',
          description: 'Murabaha submission milestone with submission date and supporting document actions.',
          tabKey: 'document_tracker',
          viewPermissionKey: 'shipment.tab.document_tracker.milestone_5.view',
          editPermissionKey: 'shipment.tab.document_tracker.milestone_5.edit',
          viewActionKey: 'milestone_5_view',
          editActionKey: 'milestone_5_edit',
        },
        {
          key: 'document_tracker_milestone_6',
          label: 'Milestone 6',
          description: 'Documents release milestone with release date and final document preview/upload actions.',
          tabKey: 'document_tracker',
          viewPermissionKey: 'shipment.tab.document_tracker.milestone_6.view',
          editPermissionKey: 'shipment.tab.document_tracker.milestone_6.edit',
          viewActionKey: 'milestone_6_view',
          editActionKey: 'milestone_6_edit',
        },
      ],
    },
    {
      key: 'port_customs',
      label: 'Port & Customs',
      tabKey: 'port_customs',
      ownPermissionKeys: [
        'shipment.tab.port_customs.view',
        'shipment.tab.port_customs.edit',
      ],
      hiddenPermissionKeys: [
        'shipment.tab.port_customs.milestone_1.view',
        'shipment.tab.port_customs.milestone_1.edit',
        'shipment.tab.port_customs.milestone_2.view',
        'shipment.tab.port_customs.milestone_2.edit',
        'shipment.tab.port_customs.milestone_3.view',
        'shipment.tab.port_customs.milestone_3.edit',
        'shipment.tab.port_customs.milestone_4.view',
        'shipment.tab.port_customs.milestone_4.edit',
        'shipment.tab.port_customs.milestone_5.view',
        'shipment.tab.port_customs.milestone_5.edit',
        'shipment.tab.port_customs.milestone_6.view',
        'shipment.tab.port_customs.milestone_6.edit',
      ],
      children: [
        {
          key: 'port_customs_milestone_1',
          label: 'Milestone 1',
          description: 'Port & Customs Clearance: arrival notice date, arrival on, shipment free retention date, port free retention date, and port demurrage start date.',
          tabKey: 'port_customs',
          viewPermissionKey: 'shipment.tab.port_customs.milestone_1.view',
          editPermissionKey: 'shipment.tab.port_customs.milestone_1.edit',
          viewActionKey: 'milestone_1_view',
          editActionKey: 'milestone_1_edit',
        },
        {
          key: 'port_customs_milestone_2',
          label: 'Milestone 2',
          description: 'Advance Received: controls the advance request date and attached document preview/upload area.',
          tabKey: 'port_customs',
          viewPermissionKey: 'shipment.tab.port_customs.milestone_2.view',
          editPermissionKey: 'shipment.tab.port_customs.milestone_2.edit',
          viewActionKey: 'milestone_2_view',
          editActionKey: 'milestone_2_edit',
        },
        {
          key: 'port_customs_milestone_3',
          label: 'Milestone 3',
          description: 'DO Released Date: manages DO released date, remarks, and its document actions.',
          tabKey: 'port_customs',
          viewPermissionKey: 'shipment.tab.port_customs.milestone_3.view',
          editPermissionKey: 'shipment.tab.port_customs.milestone_3.edit',
          viewActionKey: 'milestone_3_view',
          editActionKey: 'milestone_3_edit',
        },
        {
          key: 'port_customs_milestone_4',
          label: 'Milestone 4',
          description: 'DP Clearance Date: manages DP approval / clearance date, remarks, and document actions.',
          tabKey: 'port_customs',
          viewPermissionKey: 'shipment.tab.port_customs.milestone_4.view',
          editPermissionKey: 'shipment.tab.port_customs.milestone_4.edit',
          viewActionKey: 'milestone_4_view',
          editActionKey: 'milestone_4_edit',
        },
        {
          key: 'port_customs_milestone_5',
          label: 'Milestone 5',
          description: 'Customs Clearance Date: manages customs clearance date, token received date, remarks, and document actions.',
          tabKey: 'port_customs',
          viewPermissionKey: 'shipment.tab.port_customs.milestone_5.view',
          editPermissionKey: 'shipment.tab.port_customs.milestone_5.edit',
          viewActionKey: 'milestone_5_view',
          editActionKey: 'milestone_5_edit',
        },
        {
          key: 'port_customs_milestone_6',
          label: 'Milestone 6',
          description: 'Municipality Check Date: manages municipality date, remarks, and document actions.',
          tabKey: 'port_customs',
          viewPermissionKey: 'shipment.tab.port_customs.milestone_6.view',
          editPermissionKey: 'shipment.tab.port_customs.milestone_6.edit',
          viewActionKey: 'milestone_6_view',
          editActionKey: 'milestone_6_edit',
        },
        {
          key: 'port_customs_transportation',
          label: 'Transportation Arranged',
          description: 'Transportation arranged section with container-wise transport company, arranged date/time, transportation date/time, and save/edit actions.',
          tabKey: 'port_customs',
          viewPermissionKey: 'shipment.tab.port_customs.transportation.view',
          editPermissionKey: 'shipment.tab.port_customs.transportation.edit',
          viewActionKey: 'transportation_view',
          editActionKey: 'transportation_edit',
        },
      ],
    },
    {
      key: 'storage',
      label: 'Storage',
      tabKey: 'storage',
      ownPermissionKeys: [
        'shipment.tab.storage.view',
      ],
      children: [
        {
          key: 'storage_allocation',
          label: 'Storage Allocation',
          tabKey: 'storage',
          viewActionKey: 'storage_allocation_view',
          editActionKey: 'storage_allocation_edit',
        },
        {
          key: 'storage_arrival',
          label: 'Storage Arrival',
          tabKey: 'storage',
          viewActionKey: 'storage_arrival_view',
          editActionKey: 'storage_arrival_edit',
        },
        {
          key: 'storage_arrival_approve_warehouse_manager',
          label: 'Storage Arrival Approval (Warehouse Manager)',
          description: 'Warehouse manager approval for submitted storage arrival updates.',
          tabKey: 'storage',
          editPermissionKey: 'shipment.tab.storage.storage_arrival.approve_warehouse_manager',
          editActionKey: 'storage_arrival_approve_warehouse_manager',
        },
      ],
    },
    {
      key: 'quality',
      label: 'Quality',
      tabKey: 'quality',
    },
  ];

  /** Build a PermissionMatrixRow from a RowDefinition + flat permission list */
  private buildRow(def: RowDefinition, allPermissions: AccessPermission[]): PermissionMatrixRow {
    // Permissions that belong to this row's scope
    const baseScopedPermissions = allPermissions.filter((p) => {
      if (def.tabKey) return p.tab === def.tabKey;
      if (def.screenKey) return p.screen === def.screenKey && !p.tab;
      return false;
    });
    const scopedPermissions = def.ownPermissionKeys?.length
      ? baseScopedPermissions.filter((p) => def.ownPermissionKeys!.includes(p.key))
      : baseScopedPermissions;

    // View permission: explicit action key OR key ending in '.view' with type tab/screen
    const viewPermission = def.viewPermissionKey
      ? (allPermissions.find((p) => p.key === def.viewPermissionKey) ?? null)
      : def.viewActionKey
      ? (scopedPermissions.find((p) => p.action === def.viewActionKey) ?? null)
      : (def.editPermissionKey || def.editActionKey)
        ? null
        : (scopedPermissions.find((p) => p.key.endsWith('.view') && (p.type === 'tab' || p.type === 'screen')) ?? null);

    // Edit permission: explicit action key OR key ending in '.edit' with type action (not field)
    const editPermission = def.editPermissionKey
      ? (allPermissions.find((p) => p.key === def.editPermissionKey) ?? null)
      : def.editActionKey
      ? (scopedPermissions.find((p) => p.action === def.editActionKey) ?? null)
      : (scopedPermissions.find((p) => p.key.endsWith('.edit') && p.type === 'action') ?? null);

    // Field permissions
    const hiddenPermissionKeys = new Set(def.hiddenPermissionKeys ?? []);
    const fieldPermissions = def.viewActionKey
      ? [] // sub-tab rows don't have their own field permissions
      : scopedPermissions.filter((p) => p.type === 'field' && !hiddenPermissionKeys.has(p.key));

    // Action permissions — everything that is type=action but NOT the view/edit we already captured
    const capturedKeys = new Set<string>();
    if (viewPermission) capturedKeys.add(viewPermission.key);
    if (editPermission) capturedKeys.add(editPermission.key);

    const actionPermissions = def.viewActionKey
      ? []
      : scopedPermissions.filter(
          (p) => p.type === 'action' && !capturedKeys.has(p.key) && !hiddenPermissionKeys.has(p.key)
        );

    // Recurse for children
    const children = def.children?.map((child) => this.buildRow(child, allPermissions));

    return {
      key: def.key,
      label: def.label,
      description: def.description,
      viewPermission,
      editPermission,
      fieldPermissions,
      actionPermissions,
      children,
    };
  }

  readonly permissionMatrixRows = computed<PermissionMatrixRow[]>(() => {
    const allPermissions = this.permissionGroups().flatMap((g) => g.permissions);
    return this.ROW_DEFINITIONS.map((def) => this.buildRow(def, allPermissions));
  });

  readonly menuPermissionGroups = computed(() =>
    this.permissionGroups().filter((g) =>
      g.permissions.some((p) => p.resource === 'menu')
    )
  );

  readonly selectedUser = computed(() =>
    this.users().find((u) => u._id === this.selectedUserId()) ?? null
  );

  constructor() {
    this.loadRoles();
  }

  // ─── Tab navigation ───────────────────────────────────────────────────────

  setActiveTab(tab: AccessTabKey): void {
    this.activeTab.set(tab);
    this.error.set(null);
    this.success.set(null);
    if (tab === 'users' && !this.users().length && !this.usersLoading()) {
      this.loadUsers();
    }
    if (tab === 'permissions' && !this.blRowDefinitions().length && !this.blRowsLoading()) {
      this.loadBlRowDefinitions();
    }
  }

  // ─── Expand / collapse matrix rows ───────────────────────────────────────

  toggleExpandedRow(rowKey: string): void {
    this.expandedRowKeys.update((keys) => {
      const next = new Set(keys);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
        if (rowKey === 'bl_details' && !this.blRowDefinitions().length && !this.blRowsLoading()) {
          this.loadBlRowDefinitions();
        }
      }
      return next;
    });
  }

  isRowExpanded(rowKey: string): boolean {
    return this.expandedRowKeys().has(rowKey);
  }

  // ─── Roles ────────────────────────────────────────────────────────────────

  loadRoles(): void {
    this.rolesLoading.set(true);
    this.error.set(null);
    this.accessControlService
      .getRoles()
      .pipe(finalize(() => this.rolesLoading.set(false)))
      .subscribe({
        next: ({ roles }) => {
          this.roles.set(roles);
          if (!this.userForm().role && roles.length) {
            this.resetUserForm(roles[0].key);
          }
          const currentSelected = this.selectedRoleId();
          const fallback = roles[0]?._id ?? null;
          const nextId = roles.some((r) => r._id === currentSelected) ? currentSelected : fallback;
          this.selectedRoleId.set(nextId);
          if (nextId) {
            this.loadRolePermissions(nextId);
          } else {
            this.permissionGroups.set([]);
          }
          if (this.activeTab() === 'permissions' && !this.blRowDefinitions().length) {
            this.loadBlRowDefinitions();
          }
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Unable to load roles right now.');
        },
      });
  }

  selectRole(roleId: string): void {
    this.selectedRoleId.set(roleId);
    this.loadRolePermissions(roleId);
  }

  startCreateRole(): void {
    this.editingRoleId.set(null);
    this.roleForm.set({ key: '', name: '', description: '', isActive: true });
    this.activeTab.set('roles');
  }

  editRole(role: AccessRole): void {
    this.editingRoleId.set(role._id);
    this.roleForm.set({ key: role.key, name: role.name, description: role.description || '', isActive: role.isActive });
    this.activeTab.set('roles');
  }

  saveRole(): void {
    const form = this.roleForm();
    if (!form.name.trim()) {
      this.error.set('Role name is required.');
      return;
    }
    this.saveLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    const request$ = this.editingRoleId()
      ? this.accessControlService.updateRole(this.editingRoleId()!, {
          name: form.name.trim(),
          description: form.description.trim(),
          isActive: form.isActive,
        })
      : this.accessControlService.createRole({
          key: this.generatedRoleKey(),
          name: form.name.trim(),
          description: form.description.trim(),
          isActive: form.isActive,
        });

    request$.pipe(finalize(() => this.saveLoading.set(false))).subscribe({
      next: ({ message }) => {
        this.success.set(message);
        this.startCreateRole();
        this.loadRoles();
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Unable to save role right now.');
      },
    });
  }

  // ─── Permissions ──────────────────────────────────────────────────────────

  loadRolePermissions(roleId: string): void {
    this.permissionsLoading.set(true);
    this.error.set(null);
    this.accessControlService
      .getRolePermissions(roleId)
      .pipe(finalize(() => this.permissionsLoading.set(false)))
      .subscribe({
        next: ({ permissionGroups }) => {
          this.permissionGroups.set(permissionGroups);
        },
        error: (err) => {
          this.permissionGroups.set([]);
          this.error.set(err.error?.message || 'Unable to load permissions.');
        },
      });
  }

  loadBlRowDefinitions(): void {
    this.blRowsLoading.set(true);
    this.accessControlService
      .getBlRowDefinitions()
      .pipe(finalize(() => this.blRowsLoading.set(false)))
      .subscribe({
        next: ({ rows }) => {
          this.blRowDefinitions.set(rows);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Unable to load BL row definitions.');
        },
      });
  }

  getRoleOptionsForBlRows(): Array<{ label: string; value: string }> {
    return this.roles()
      .filter((role) => role.isActive)
      .map((role) => ({
        label: `${role.name} (${role.key})`,
        value: String(role.key || '').trim().toLowerCase(),
      }));
  }

  onBlRowVisibleToChange(event: Event, rowId?: string): void {
    const target = event.target as HTMLSelectElement | null;
    if (!target) return;
    const values = Array.from(target.selectedOptions).map((option) => option.value);
    if (rowId) {
      this.updateBlRowDraft(rowId, { visibleTo: values });
      return;
    }
    this.newBlRowForm.set({ ...this.newBlRowForm(), visibleTo: values });
  }

  updateBlRowDraft(rowId: string, patch: Partial<BlRowDefinitionAdminItem>): void {
    this.blRowDefinitions.update((rows) =>
      rows.map((row) => (row._id === rowId ? { ...row, ...patch } : row))
    );
  }

  createBlRowDefinition(): void {
    const form = this.newBlRowForm();
    if (!form.description.trim()) {
      this.error.set('BL row description is required.');
      return;
    }

    this.blRowSaveId.set('new');
    this.accessControlService
      .createBlRowDefinition({
        description: form.description.trim(),
        visibleTo: form.visibleTo,
        defaultQty: Number.isFinite(Number(form.defaultQty)) ? Number(form.defaultQty) : 1,
        defaultRate: Number.isFinite(Number(form.defaultRate)) ? Number(form.defaultRate) : 0,
      })
      .pipe(finalize(() => this.blRowSaveId.set(null)))
      .subscribe({
        next: ({ message, row }) => {
          this.blRowDefinitions.update((rows) => [...rows, row].sort((a, b) => a.sn - b.sn));
          this.newBlRowForm.set({ description: '', visibleTo: [], defaultQty: 1, defaultRate: 0 });
          this.messageService.add({ severity: 'success', summary: 'Created', detail: message });
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Unable to create BL row definition.');
        },
      });
  }

  saveBlRowDefinition(row: BlRowDefinitionAdminItem): void {
    if (!row.description.trim()) {
      this.error.set('BL row description is required.');
      return;
    }

    this.blRowSaveId.set(row._id);
    this.accessControlService
      .updateBlRowDefinition(row._id, {
        description: row.description.trim(),
        visibleTo: row.visibleTo,
        defaultQty: Number.isFinite(Number(row.defaultQty)) ? Number(row.defaultQty) : 1,
        defaultRate: Number.isFinite(Number(row.defaultRate)) ? Number(row.defaultRate) : 0,
        isActive: row.isActive,
      })
      .pipe(finalize(() => this.blRowSaveId.set(null)))
      .subscribe({
        next: ({ message, row: savedRow }) => {
          this.blRowDefinitions.update((rows) =>
            rows.map((item) => (item._id === savedRow._id ? savedRow : item)).sort((a, b) => a.sn - b.sn)
          );
          this.messageService.add({ severity: 'success', summary: 'Saved', detail: message });
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Unable to update BL row definition.');
        },
      });
  }

  deleteBlRowDefinition(row: BlRowDefinitionAdminItem): void {
    this.blRowSaveId.set(row._id);
    this.accessControlService
      .deleteBlRowDefinition(row._id)
      .pipe(finalize(() => this.blRowSaveId.set(null)))
      .subscribe({
        next: ({ message }) => {
          this.blRowDefinitions.update((rows) => rows.filter((item) => item._id !== row._id));
          this.messageService.add({ severity: 'success', summary: 'Deleted', detail: message });
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Unable to delete BL row definition.');
        },
      });
  }

  isBlDetailsRow(row: PermissionMatrixRow): boolean {
    return row.key === 'bl_details';
  }

  isBlRowSaving(rowId: string | 'new'): boolean {
    return this.blRowSaveId() === rowId;
  }

  /**
   * Toggle a single permission on/off.
   * We search all groups for the permission key rather than relying on a
   * potentially mismatched groupKey.
   */
  togglePermission(permissionKey: string, checked: boolean): void {
    this.permissionGroups.update((groups) =>
      groups.map((group) => ({
        ...group,
        permissions: group.permissions.map((p) =>
          p.key === permissionKey ? { ...p, assigned: checked } : p
        ),
      }))
    );
  }

  savePermissions(): void {
    const roleId = this.selectedRoleId();
    if (!roleId) {
      this.error.set('Select a role first.');
      return;
    }
    this.saveLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    this.accessControlService
      .updateRolePermissions(roleId, this.selectedPermissionKeys())
      .pipe(finalize(() => this.saveLoading.set(false)))
      .subscribe({
        next: ({ message, permissionGroups }) => {
          this.permissionGroups.set(permissionGroups);
          this.messageService.add({ severity: 'success', summary: 'Saved', detail: message });
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Unable to save permissions.');
        },
      });
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  loadUsers(page = this.userPage(), search = this.userSearch()): void {
    this.usersLoading.set(true);
    this.error.set(null);
    this.accessControlService
      .getUsers(page, this.userPageSize, search)
      .pipe(finalize(() => this.usersLoading.set(false)))
      .subscribe({
        next: ({ users, roles, pagination }) => {
          this.users.set(users);
          this.userPage.set(pagination.page);
          this.userTotal.set(pagination.total);
          this.userTotalPages.set(pagination.totalPages);
          if (!this.roles().length && roles.length) this.roles.set(roles);
          if (!this.userForm().role && roles.length) this.resetUserForm(roles[0].key);
          // Auto-select first user on initial load only (no search active)
          if (!search && page === 1 && !this.selectedUserId() && users.length) {
            this.selectUser(users[0]._id);
          }
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Unable to load users right now.');
        },
      });
  }

  onUserSearchChange(value: string): void {
    this.userSearch.set(value);
    // Debounce: wait 350ms after the user stops typing before hitting the API
    if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
    this._searchDebounceTimer = setTimeout(() => {
      this.userPage.set(1);
      this.loadUsers(1, value);
    }, 350);
  }

  goToUserPage(page: number): void {
    if (page < 1 || page > this.userTotalPages()) return;
    this.userPage.set(page);
    this.loadUsers(page, this.userSearch());
  }

  selectUser(userId: string): void {
    this.selectedUserId.set(userId);
    const user = this.users().find((u) => u._id === userId);
    if (!user) return;
    this.userForm.set({ email: user.email, name: user.name, role: user.role, isActive: user.isActive });
  }

  startCreateUser(): void {
    this.selectedUserId.set(null);
    this.resetUserForm(this.roles()[0]?.key || '');
  }

  private resetUserForm(defaultRole: string): void {
    this.userForm.set({ email: '', name: '', role: defaultRole, isActive: true });
  }

  saveUser(): void {
    const userId = this.selectedUserId();
    if (!userId) { this.error.set('Select a user first.'); return; }
    const form = this.userForm();
    if (!form.name.trim() || !form.role.trim()) { this.error.set('User name and role are required.'); return; }

    this.saveLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    this.accessControlService
      .updateUser(userId, { name: form.name.trim(), role: form.role.trim(), isActive: form.isActive })
      .pipe(finalize(() => this.saveLoading.set(false)))
      .subscribe({
        next: ({ message, user }) => {
          this.users.update((users) => users.map((u) => (u._id === user._id ? user : u)));
          this.selectUser(user._id);
          this.success.set(message);
          this.messageService.add({ severity: 'success', summary: 'Saved', detail: message });
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Unable to update user.');
        },
      });
  }

  async resetSelectedUserPassword(): Promise<void> {
    const userId = this.selectedUserId();
    const user = this.selectedUser();
    if (!userId || !user) {
      this.error.set('Select a user first.');
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      header: 'Reset Password',
      message: 'Password would be reset',
      acceptLabel: 'Yes, Reset',
      severity: 'warning',
    });
    if (!confirmed) return;

    this.resetPasswordLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    this.accessControlService
      .resetUserPassword(userId)
      .pipe(finalize(() => this.resetPasswordLoading.set(false)))
      .subscribe({
        next: ({ message, user: updatedUser }) => {
          this.users.update((users) => users.map((u) => (u._id === updatedUser._id ? updatedUser : u)));
          this.selectUser(updatedUser._id);
          this.success.set(message);
          this.messageService.add({ severity: 'success', summary: 'Password Reset', detail: message });
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Unable to reset password.');
        },
      });
  }

  createUser(): void {
    const form = this.userForm();
    if (!form.name.trim() || !form.email.trim() || !form.role.trim()) {
      this.error.set('Name, email, and role are required to create a user.');
      return;
    }
    this.saveLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    this.accessControlService
      .createUser({ name: form.name.trim(), email: form.email.trim(), role: form.role.trim(), isActive: form.isActive })
      .pipe(finalize(() => this.saveLoading.set(false)))
      .subscribe({
        next: ({ message, user }) => {
          this.startCreateUser();
          this.selectUser(user._id);
          this.success.set(message);
          this.messageService.add({ severity: 'success', summary: 'Created', detail: message });
          // Reload page 1 so the new user appears at the top
          this.userPage.set(1);
          this.loadUsers(1, this.userSearch());
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Unable to create user.');
        },
      });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  groupAssignedCount(group: AccessPermissionGroup): number {
    return group.permissions.filter((p) => p.assigned).length;
  }

  trackByRole(_: number, role: AccessRole): string { return role._id; }
  trackByGroup(_: number, group: AccessPermissionGroup): string { return group.key; }
  trackByPermission(_: number, permission: AccessPermission): string { return permission.key; }
  trackByUser(_: number, user: AccessUser): string { return user._id; }
  trackByRow(_: number, row: PermissionMatrixRow): string { return row.key; }
}
