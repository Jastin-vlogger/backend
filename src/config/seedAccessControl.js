const Role = require('../models/role.model');
const Permission = require('../models/permission.model');
const RolePermission = require('../models/rolePermission.model');
const User = require('../models/auth.model');

const DEFAULT_ROLES = [
  { key: 'Admin', name: 'Admin', description: 'Full system access', isSystem: true },
  { key: 'Purchase', name: 'Purchase', description: 'Purchase and shipment entry team', isSystem: true },
  { key: 'Logistic', name: 'Logistic', description: 'Logistics and operations team', isSystem: true },
  { key: 'FAS', name: 'FAS', description: 'Finance and accounting services', isSystem: true },
  { key: 'FasManager', name: 'Fas manager', description: 'Finance approvals manager', isSystem: true },
  { key: 'warehouse', name: 'Warehouse manager', description: 'Warehouse approvals manager', isSystem: true },
  { key: 'Manager', name: 'Manager', description: 'Cross-functional management access', isSystem: true },
];

const MENU_PERMISSION_TEMPLATES = [
  { key: 'menu.dashboard.view', resource: 'menu', screen: 'dashboard', type: 'screen', label: 'View Dashboard Menu', sortOrder: 10 },
  { key: 'menu.shipments.view', resource: 'menu', screen: 'shipments', type: 'screen', label: 'View Order Menu', sortOrder: 20 },
  { key: 'menu.all_shipments.view', resource: 'menu', screen: 'all_shipments', type: 'screen', label: 'View Shipments Menu', sortOrder: 21 },
  { key: 'menu.local_purchase.view', resource: 'menu', screen: 'local_purchase', type: 'screen', label: 'View Local Purchase Menu', sortOrder: 22 },
  { key: 'menu.suppliers.view', resource: 'menu', screen: 'suppliers', type: 'screen', label: 'View Suppliers Menu', sortOrder: 30 },
  { key: 'menu.reports.view', resource: 'menu', screen: 'reports', type: 'screen', label: 'View Reports Menu', sortOrder: 40 },
  { key: 'menu.access_control.view', resource: 'menu', screen: 'access_control', type: 'screen', label: 'View Access Control Menu', sortOrder: 50 },
  { key: 'menu.settings.view', resource: 'menu', screen: 'settings', type: 'screen', label: 'View Settings Menu', sortOrder: 60 },
];

const DASHBOARD_PERMISSION_TEMPLATES = [
  { key: 'dashboard.section.status_snapshot.view', resource: 'dashboard', screen: 'dashboard', tab: 'status_snapshot', type: 'action', action: 'status_snapshot_view', label: 'View Status Snapshot', sortOrder: 11 },
  { key: 'dashboard.snapshot.total_lpo.view', resource: 'dashboard', screen: 'dashboard', tab: 'status_snapshot', type: 'action', action: 'snapshot_total_lpo_view', label: 'View Total LPO Snapshot Card', sortOrder: 11.01 },
  { key: 'dashboard.snapshot.total_shipments.view', resource: 'dashboard', screen: 'dashboard', tab: 'status_snapshot', type: 'action', action: 'snapshot_total_shipments_view', label: 'View Total Shipments Snapshot Card', sortOrder: 11.02 },
  { key: 'dashboard.snapshot.open_lpo.view', resource: 'dashboard', screen: 'dashboard', tab: 'status_snapshot', type: 'action', action: 'snapshot_open_lpo_view', label: 'View Open LPO Snapshot Card', sortOrder: 11.03 },
  { key: 'dashboard.snapshot.completed_lpo.view', resource: 'dashboard', screen: 'dashboard', tab: 'status_snapshot', type: 'action', action: 'snapshot_completed_lpo_view', label: 'View Completed LPO Snapshot Card', sortOrder: 11.04 },
  { key: 'dashboard.snapshot.etd_unconfirmed.view', resource: 'dashboard', screen: 'dashboard', tab: 'status_snapshot', type: 'action', action: 'snapshot_etd_unconfirmed_view', label: 'View ETD Yet To Be Confirmed Snapshot Card', sortOrder: 11.05 },
  { key: 'dashboard.snapshot.eta_due.view', resource: 'dashboard', screen: 'dashboard', tab: 'status_snapshot', type: 'action', action: 'snapshot_eta_due_view', label: 'View ETD Yet To Due Snapshot Card', sortOrder: 11.06 },
  { key: 'dashboard.snapshot.on_transit.view', resource: 'dashboard', screen: 'dashboard', tab: 'status_snapshot', type: 'action', action: 'snapshot_on_transit_view', label: 'View On Transit Snapshot Card', sortOrder: 11.07 },
  { key: 'dashboard.snapshot.at_port.view', resource: 'dashboard', screen: 'dashboard', tab: 'status_snapshot', type: 'action', action: 'snapshot_at_port_view', label: 'View At The Port Snapshot Card', sortOrder: 11.08 },
  { key: 'dashboard.snapshot.delivered_wh.view', resource: 'dashboard', screen: 'dashboard', tab: 'status_snapshot', type: 'action', action: 'snapshot_delivered_wh_view', label: 'View Delivered WH Snapshot Card', sortOrder: 11.09 },
  { key: 'dashboard.section.shipment_status_chart.view', resource: 'dashboard', screen: 'dashboard', tab: 'shipment_status_chart', type: 'action', action: 'shipment_status_chart_view', label: 'View Shipment Status Chart', sortOrder: 12 },
  { key: 'dashboard.section.dynamic_metrics.view', resource: 'dashboard', screen: 'dashboard', tab: 'dynamic_metrics', type: 'action', action: 'dynamic_metrics_view', label: 'View Dynamic Metrics Explorer', sortOrder: 13 },
  { key: 'dashboard.section.average_fc.view', resource: 'dashboard', screen: 'dashboard', tab: 'average_fc', type: 'action', action: 'average_fc_view', label: 'View Average FC per Unit Chart', sortOrder: 14 },
];

// Department charts are granted per-role (not part of the bulk DASHBOARD_PERMISSION_KEYS spread).
const DASHBOARD_DEPARTMENT_CHART_TEMPLATES = [
  { key: 'dashboard.section.warehouse_chart.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'warehouse_chart_view', label: 'View Warehouse Arrival Chart', sortOrder: 15 },
  { key: 'dashboard.section.fas_chart.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'fas_chart_view', label: 'View FAS Document Approvals Chart', sortOrder: 16 },
  { key: 'dashboard.section.logistics_chart.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'logistics_chart_view', label: 'View Logistics Clearance Chart', sortOrder: 17 },
  { key: 'dashboard.section.warehouse_allocation_status.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'warehouse_allocation_status_view', label: 'View Warehouse Allocation Status', sortOrder: 18 },
  { key: 'dashboard.section.warehouse_allocation_table.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'warehouse_allocation_table_view', label: 'View Warehouse Allocation & Receiving Table', sortOrder: 19 },
  { key: 'dashboard.section.warehouse_receiving_status.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'warehouse_receiving_status_view', label: 'View Warehouse Receiving Status', sortOrder: 20 },
  { key: 'dashboard.section.storekeeper_receiving_status.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'storekeeper_receiving_status_view', label: 'View Storekeeper Allocation & Receiving Status', sortOrder: 21 },
  { key: 'dashboard.section.storekeeper_receiving_timeline.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'storekeeper_receiving_timeline_view', label: 'View Storekeeper Receiving Progress Over Time', sortOrder: 22 },
  { key: 'dashboard.section.storekeeper_summary.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'storekeeper_summary_view', label: 'View Storekeeper Warehouse Summary', sortOrder: 23 },
  { key: 'dashboard.section.department_job_pending.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'department_job_pending_view', label: 'View Department Wise Job Pending Report', sortOrder: 24 },
  { key: 'dashboard.section.fas_pending_completed.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'fas_pending_completed_view', label: 'View FAS Pending/Completed Dashboard', sortOrder: 25 },
  { key: 'dashboard.section.logistics_pending_completed.view', resource: 'dashboard', screen: 'dashboard', tab: 'dashboard', type: 'action', action: 'logistics_pending_completed_view', label: 'View Logistics Pending/Completed Dashboard', sortOrder: 26 },
];

const DASHBOARD_PERMISSION_KEYS = DASHBOARD_PERMISSION_TEMPLATES.map((permission) => permission.key);

const SETTINGS_PERMISSION_TEMPLATES = [
  { key: 'settings.tab.warehouses.view', resource: 'settings', screen: 'settings', tab: 'warehouses', type: 'action', action: 'warehouses_view', label: 'View Warehouses Settings', sortOrder: 61 },
  { key: 'settings.tab.warehouses.edit', resource: 'settings', screen: 'settings', tab: 'warehouses', type: 'action', action: 'warehouses_edit', label: 'Edit Warehouses Settings', sortOrder: 62 },
  { key: 'settings.tab.item_codes.view', resource: 'settings', screen: 'settings', tab: 'item_codes', type: 'action', action: 'item_codes_view', label: 'View Item Codes Settings', sortOrder: 63 },
  { key: 'settings.tab.item_codes.edit', resource: 'settings', screen: 'settings', tab: 'item_codes', type: 'action', action: 'item_codes_edit', label: 'Edit Item Codes Settings', sortOrder: 64 },
  { key: 'settings.tab.transportation.view', resource: 'settings', screen: 'settings', tab: 'transportation', type: 'action', action: 'transportation_view', label: 'View Transportation Settings', sortOrder: 65 },
  { key: 'settings.tab.transportation.edit', resource: 'settings', screen: 'settings', tab: 'transportation', type: 'action', action: 'transportation_edit', label: 'Edit Transportation Settings', sortOrder: 66 },
  { key: 'settings.tab.exchange_rates.view', resource: 'settings', screen: 'settings', tab: 'exchange_rates', type: 'action', action: 'exchange_rates_view', label: 'View Exchange Rates Settings', sortOrder: 67 },
  { key: 'settings.tab.exchange_rates.edit', resource: 'settings', screen: 'settings', tab: 'exchange_rates', type: 'action', action: 'exchange_rates_edit', label: 'Edit Exchange Rates Settings', sortOrder: 68 },
];

const SHIPMENT_PERMISSION_TEMPLATES = [
  // ─── Create Shipment Screen ───────────────────────────────────────────────
  { key: 'shipment.screen.create_shipment.view',    resource: 'shipment', screen: 'create_shipment', type: 'screen', label: 'View Create Shipment', sortOrder: 10 },
  { key: 'shipment.screen.create_shipment.save',    resource: 'shipment', screen: 'create_shipment', type: 'action', action: 'save',    label: 'Save Shipment', sortOrder: 20 },
  { key: 'shipment.screen.create_shipment.extract', resource: 'shipment', screen: 'create_shipment', type: 'action', action: 'extract', label: 'Extract Shipment Documents', sortOrder: 30 },

  // ─── Shipment Tracker Screen ──────────────────────────────────────────────
  { key: 'shipment.screen.shipment_tracker.view', resource: 'shipment', screen: 'shipment_tracker', type: 'screen', label: 'View Shipment Tracker', sortOrder: 40 },

  // ─── Shipment Entry Tab ───────────────────────────────────────────────────
  { key: 'shipment.tab.shipment_entry.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_entry', type: 'tab',    label: 'View Shipment Entry', sortOrder: 100 },
  // Fields
  { key: 'shipment.field.shipment_entry.supplierEmail.edit', resource: 'shipment', screen: 'create_shipment',  tab: 'shipment_entry', field: 'supplierEmail', type: 'field', action: 'edit', label: 'Edit Supplier Email', sortOrder: 102 },
  { key: 'shipment.field.shipment_entry.quantityFinancialSummary.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_entry', field: 'quantityFinancialSummary', type: 'field', action: 'view', label: 'View Quantity & Financial Summary', sortOrder: 103 },
  { key: 'shipment.field.shipment_entry.bankName.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_entry', field: 'bankName', type: 'field', action: 'view', label: 'View Bank Name', sortOrder: 104 },
  { key: 'shipment.field.shipment_entry.bankName.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_entry', field: 'bankName', type: 'field', action: 'edit', label: 'Edit Bank Name', sortOrder: 105 },
  { key: 'shipment.field.shipment_entry.lineItems.refresh', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_entry', field: 'lineItems', type: 'field', action: 'refresh', label: 'Refresh Line Item from Item Master', sortOrder: 106 },

  // ─── Shipment Tracker Split Tab ───────────────────────────────────────────
  { key: 'shipment.tab.shipment_tracker_split.view',          resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'tab',    label: 'View Shipment Tracker Split', sortOrder: 110 },
  { key: 'shipment.tab.shipment_tracker_split.edit',          resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'edit',          label: 'Edit Shipment Tracker Split', sortOrder: 111 },
  { key: 'shipment.tab.shipment_tracker_split.lock_baseline', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'lock_baseline', label: 'Lock Baseline',               sortOrder: 112 },
  { key: 'shipment.tab.shipment_tracker_split.scheduled.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'scheduled_view', label: 'View Scheduled Split Tab', sortOrder: 112.1 },
  { key: 'shipment.tab.shipment_tracker_split.scheduled.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'scheduled_edit', label: 'Edit Scheduled Split Tab', sortOrder: 112.2 },
  { key: 'shipment.tab.shipment_tracker_split.actual.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'actual_view', label: 'View Actual Split Tab', sortOrder: 112.3 },
  { key: 'shipment.tab.shipment_tracker_split.actual.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'actual_edit', label: 'Edit Actual Split Tab', sortOrder: 112.4 },
  { key: 'shipment.tab.shipment_tracker_split.actual.upload_packing', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'actual_upload_packing', label: 'Upload Actual Packing Document', sortOrder: 112.41 },
  { key: 'shipment.tab.shipment_tracker_split.actual.upload_bl', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'actual_upload_bl', label: 'Upload Actual B/L Document', sortOrder: 112.42 },
  { key: 'shipment.tab.shipment_tracker_split.history.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'history_view', label: 'View History Split Tab', sortOrder: 112.5 },
  { key: 'shipment.tab.shipment_tracker_split.history.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'history_edit', label: 'Edit History Split Tab', sortOrder: 112.6 },
  { key: 'shipment.tab.shipment_tracker_split.report.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'report_view', label: 'View Report Split Tab', sortOrder: 112.7 },
  { key: 'shipment.tab.shipment_tracker_split.report.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', type: 'action', action: 'report_edit', label: 'Edit Report Split Tab', sortOrder: 112.8 },
  // Fields
  { key: 'shipment.field.shipment_tracker_split.plannedEtd.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', field: 'planned.etd', type: 'field', action: 'edit', label: 'Edit Planned ETD', sortOrder: 113 },
  { key: 'shipment.field.shipment_tracker_split.plannedEta.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'shipment_tracker_split', field: 'planned.eta', type: 'field', action: 'edit', label: 'Edit Planned ETA', sortOrder: 114 },

  // ─── BL Details Tab ───────────────────────────────────────────────────────
  { key: 'shipment.tab.bl_details.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'tab',    label: 'View BL Details', sortOrder: 130 },
  { key: 'shipment.tab.bl_details.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'edit', label: 'Edit BL Details', sortOrder: 131 },
  { key: 'shipment.tab.bl_details.clearing_advance.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'clearing_advance_view', label: 'View Clearing Advance', sortOrder: 131.1 },
  { key: 'shipment.tab.bl_details.clearing_advance.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'clearing_advance_edit', label: 'Edit Clearing Advance', sortOrder: 131.2 },
  { key: 'shipment.tab.bl_details.clearing_advance.approve_fas', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'clearing_advance_approve_fas', label: 'Approve Clearing Advance (FAS)', sortOrder: 131.21 },
  { key: 'shipment.tab.bl_details.clearing_advance.approve_fas_manager', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'clearing_advance_approve_fas_manager', label: 'Approve Clearing Advance (FAS Manager)', sortOrder: 131.22 },
  { key: 'shipment.tab.bl_details.clearing_advance.edit_payment_details', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'clearing_advance_edit_payment_details', label: 'Edit Clearing Advance Payment Details (Cheque/Voucher)', sortOrder: 131.23 },
  { key: 'shipment.tab.bl_details.storage_allocations.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'storage_allocations_view', label: 'View Storage Allocations', sortOrder: 131.3 },
  { key: 'shipment.tab.bl_details.storage_allocations.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'storage_allocations_edit', label: 'Edit Storage Allocations', sortOrder: 131.4 },
  { key: 'shipment.tab.bl_details.storage_allocations.approve_warehouse_manager', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'storage_allocations_approve_warehouse_manager', label: 'Approve Storage Allocations (Warehouse Manager)', sortOrder: 131.41 },
  { key: 'shipment.tab.bl_details.packaging_list.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'packaging_list_view', label: 'View Packaging List', sortOrder: 131.5 },
  { key: 'shipment.tab.bl_details.packaging_list.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', type: 'action', action: 'packaging_list_edit', label: 'Edit Packaging List', sortOrder: 131.6 },
  // Fields
  { key: 'shipment.field.bl_details.blNo.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'bl_details', field: 'blNo', type: 'field', action: 'edit', label: 'Edit BL Number', sortOrder: 132 },

  // ─── Document Tracker Tab ─────────────────────────────────────────────────
  { key: 'shipment.tab.document_tracker.view',    resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'tab',    label: 'View Document Tracker', sortOrder: 140 },
  { key: 'shipment.tab.document_tracker.edit',    resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'edit',             label: 'Edit Document Tracker',      sortOrder: 141 },
  { key: 'shipment.tab.document_tracker.preview', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'preview_document', label: 'Preview Shipment Documents', sortOrder: 142 },
  { key: 'shipment.tab.document_tracker.milestone_1.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_1_view', label: 'View Document Tracker Milestone 1', sortOrder: 142.1 },
  { key: 'shipment.tab.document_tracker.milestone_1.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_1_edit', label: 'Edit Document Tracker Milestone 1', sortOrder: 142.2 },
  { key: 'shipment.tab.document_tracker.milestone_2.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_2_view', label: 'View Document Tracker Milestone 2', sortOrder: 142.3 },
  { key: 'shipment.tab.document_tracker.milestone_2.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_2_edit', label: 'Edit Document Tracker Milestone 2', sortOrder: 142.4 },
  { key: 'shipment.tab.document_tracker.milestone_3.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_3_view', label: 'View Document Tracker Milestone 3', sortOrder: 142.5 },
  { key: 'shipment.tab.document_tracker.milestone_3.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_3_edit', label: 'Edit Document Tracker Milestone 3', sortOrder: 142.6 },
  { key: 'shipment.tab.document_tracker.milestone_4.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_4_view', label: 'View Document Tracker Milestone 4', sortOrder: 142.7 },
  { key: 'shipment.tab.document_tracker.milestone_4.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_4_edit', label: 'Edit Document Tracker Milestone 4', sortOrder: 142.8 },
  { key: 'shipment.tab.document_tracker.milestone_5.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_5_view', label: 'View Document Tracker Milestone 5', sortOrder: 142.9 },
  { key: 'shipment.tab.document_tracker.milestone_5.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_5_edit', label: 'Edit Document Tracker Milestone 5', sortOrder: 143.0 },
  { key: 'shipment.tab.document_tracker.milestone_6.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_6_view', label: 'View Document Tracker Milestone 6', sortOrder: 143.1 },
  { key: 'shipment.tab.document_tracker.milestone_6.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_6_edit', label: 'Edit Document Tracker Milestone 6', sortOrder: 143.2 },
  // POINT 9: Milestone-level permissions — Purchase (M1, M2) and FAS (M3–M6)
  { key: 'shipment.milestone.purchase.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_purchase_edit', label: 'Edit Purchase Milestones (M1, M2)', sortOrder: 143.3 },
  { key: 'shipment.milestone.fas.edit',      resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'milestone_fas_edit',      label: 'Edit FAS Milestones (M3–M6)',      sortOrder: 143.4 },

  // ─── Port and Clearance Tab ───────────────────────────────────────────────
  { key: 'shipment.tab.port_customs.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'tab',    label: 'View Port and Clearance', sortOrder: 150 },
  { key: 'shipment.tab.port_customs.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'edit', label: 'Edit Port and Clearance', sortOrder: 151 },
  { key: 'shipment.tab.port_customs.milestone_1.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_1_view', label: 'View Milestone 1', description: 'Port and Clearance milestone with arrival notice and retention dates.', sortOrder: 152 },
  { key: 'shipment.tab.port_customs.milestone_1.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_1_edit', label: 'Edit Milestone 1', description: 'Edit Port and Clearance milestone with arrival notice and retention dates.', sortOrder: 153 },
  { key: 'shipment.tab.port_customs.milestone_2.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_2_view', label: 'View Milestone 2', description: 'Advance Received milestone with date and attached document access.', sortOrder: 154 },
  { key: 'shipment.tab.port_customs.milestone_2.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_2_edit', label: 'Edit Milestone 2', description: 'Edit Advance Received milestone with date and attached document actions.', sortOrder: 155 },
  { key: 'shipment.tab.port_customs.milestone_3.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_3_view', label: 'View Milestone 3', description: 'DO Released Date milestone with remarks and document access.', sortOrder: 156 },
  { key: 'shipment.tab.port_customs.milestone_3.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_3_edit', label: 'Edit Milestone 3', description: 'Edit DO Released Date milestone with remarks and document actions.', sortOrder: 157 },
  { key: 'shipment.tab.port_customs.milestone_4.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_4_view', label: 'View Milestone 4', description: 'BOE Passing / DP Invoice milestone with remarks, DP invoice upload, and extraction access.', sortOrder: 158 },
  { key: 'shipment.tab.port_customs.milestone_4.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_4_edit', label: 'Edit Milestone 4', description: 'Edit BOE Passing / DP Invoice milestone with remarks, DP invoice upload, and extraction actions.', sortOrder: 159 },
  { key: 'shipment.tab.port_customs.milestone_5.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_5_view', label: 'View Milestone 7', description: 'Optional Customs Clearance Date milestone with remarks and document access.', sortOrder: 160 },
  { key: 'shipment.tab.port_customs.milestone_5.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_5_edit', label: 'Edit Milestone 7', description: 'Edit optional Customs Clearance Date milestone with remarks and document actions.', sortOrder: 161 },
  { key: 'shipment.tab.port_customs.milestone_6.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_6_view', label: 'View Milestone 6', description: 'Municipality Clearance Application Date milestone with status, comment, and optional certificate access.', sortOrder: 162 },
  { key: 'shipment.tab.port_customs.milestone_6.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'milestone_6_edit', label: 'Edit Milestone 6', description: 'Edit Municipality Clearance Application Date milestone with status, comment, and optional certificate actions.', sortOrder: 163 },
  { key: 'shipment.tab.port_customs.transportation.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'transportation_view', label: 'View Milestone 5 - Transportation Arranged', description: 'Transportation arranged section with container-wise transport company, invoice, arranged date/time, transportation date/time, storage dates, token date, and delay view.', sortOrder: 164 },
  { key: 'shipment.tab.port_customs.transportation.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'port_customs', type: 'action', action: 'transportation_edit', label: 'Edit Milestone 5 - Transportation Arranged', description: 'Edit transportation arranged section with container-wise transport company, invoice, arranged date/time, transportation date/time, storage dates, token date, and save actions.', sortOrder: 165 },

  // ─── Storage Tab ──────────────────────────────────────────────────────────
  // Parent tab access
  { key: 'shipment.tab.storage.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'storage', type: 'tab', label: 'View Storage', sortOrder: 160 },
  // Sub-tab: Storage Allocation
  { key: 'shipment.tab.storage.storage_allocation.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'storage', type: 'action', action: 'storage_allocation_view', label: 'View Storage Allocation', sortOrder: 161 },
  { key: 'shipment.tab.storage.storage_allocation.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'storage', type: 'action', action: 'storage_allocation_edit', label: 'Edit Storage Allocation', sortOrder: 162 },
  // Sub-tab: Storage Arrival
  { key: 'shipment.tab.storage.storage_arrival.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'storage', type: 'action', action: 'storage_arrival_view', label: 'View Storage Arrival', sortOrder: 163 },
  { key: 'shipment.tab.storage.storage_arrival.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'storage', type: 'action', action: 'storage_arrival_edit', label: 'Edit Storage Arrival', sortOrder: 164 },
  { key: 'shipment.tab.storage.storage_arrival.approve_warehouse_manager', resource: 'shipment', screen: 'shipment_tracker', tab: 'storage', type: 'action', action: 'storage_arrival_approve_warehouse_manager', label: 'Approve Storage Arrival (Warehouse Manager)', sortOrder: 164.1 },

  // ─── Quality Tab ──────────────────────────────────────────────────────────
  { key: 'shipment.tab.quality.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'quality', type: 'tab',    label: 'View Quality', sortOrder: 170 },
  { key: 'shipment.tab.quality.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'quality', type: 'action', action: 'edit', label: 'Edit Quality', sortOrder: 171 },

  // ─── Payment & Costing Tab ────────────────────────────────────────────────
  // Parent tab access
  { key: 'shipment.tab.payment_costing.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', type: 'tab', label: 'View Payment & Costing', sortOrder: 180 },
  // Sub-tab: Payment Allocation
  { key: 'shipment.tab.payment_costing.payment_allocation.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', type: 'action', action: 'payment_allocation_view', label: 'View Payment Allocation', sortOrder: 181 },
  { key: 'shipment.tab.payment_costing.payment_allocation.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', type: 'action', action: 'payment_allocation_edit', label: 'Edit Payment Allocation', sortOrder: 182 },
  { key: 'shipment.tab.payment_costing.payment_allocation.approve_fas_manager', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', type: 'action', action: 'payment_allocation_approve_fas_manager', label: 'Approve Payment Allocation (FAS Manager)', sortOrder: 182.1 },
  // Sub-tab: Payment Costing
  { key: 'shipment.tab.payment_costing.costing_table.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', type: 'action', action: 'costing_table_view', label: 'View Payment Costing Table', sortOrder: 183 },
  { key: 'shipment.tab.payment_costing.costing_table.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', type: 'action', action: 'costing_table_edit', label: 'Edit Payment Costing Table', sortOrder: 184 },
  { key: 'shipment.tab.payment_costing.costing_table.approve_fas_manager', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', type: 'action', action: 'costing_table_approve_fas_manager', label: 'Approve Payment Costing (FAS Manager)', sortOrder: 184.1 },
  // Sub-tab: Packaging Expenses
  { key: 'shipment.tab.payment_costing.packaging_expenses.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', type: 'action', action: 'packaging_expenses_view', label: 'View Packaging Expenses', sortOrder: 185 },
  { key: 'shipment.tab.payment_costing.packaging_expenses.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', type: 'action', action: 'packaging_expenses_edit', label: 'Edit Packaging Expenses', sortOrder: 186 },
  // Actions
  { key: 'shipment.tab.payment_costing.generate_report', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', type: 'action', action: 'generate_report', label: 'Generate Payment Report', sortOrder: 187 },
  // Fields
  { key: 'shipment.field.payment_costing.paidAmount.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing', field: 'paymentAllocations.paidAmount', type: 'field', action: 'edit', label: 'Edit Received Amount', sortOrder: 188 },

  // ─── Reports Screen ───────────────────────────────────────────────────────
  { key: 'shipment.action.reports.view', resource: 'shipment', screen: 'shipment_reports', type: 'screen', action: 'view', label: 'View Shipment Reports', sortOrder: 280 },
];

// Keep legacy keys as aliases so existing DB records still resolve correctly
const LEGACY_PERMISSION_TEMPLATES = [
  { key: 'shipment.tab.storage_arrival.view', resource: 'shipment', screen: 'shipment_tracker', tab: 'storage_arrival', type: 'tab',    label: '[Legacy] View Storage & Arrival', sortOrder: 900 },
  { key: 'shipment.tab.storage_arrival.edit', resource: 'shipment', screen: 'shipment_tracker', tab: 'storage_arrival', type: 'action', action: 'edit', label: '[Legacy] Edit Storage & Arrival', sortOrder: 901 },
  { key: 'shipment.action.document_tracker.preview',         resource: 'shipment', screen: 'shipment_tracker', tab: 'document_tracker', type: 'action', action: 'preview_document', label: '[Legacy] Preview Shipment Documents', sortOrder: 902 },
  { key: 'shipment.action.payment_costing.generate_report',  resource: 'shipment', screen: 'shipment_tracker', tab: 'payment_costing',  type: 'action', action: 'generate_report',  label: '[Legacy] Generate Payment Report',   sortOrder: 903 },
];

// Point 23: per-report view permissions for the three Reports-tab dropdown reports.
const REPORTS_PERMISSION_TEMPLATES = [
  { key: 'report.quality_activity.view',   resource: 'reports', screen: 'reports', tab: 'quality_activity',   type: 'action', action: 'view', label: 'View Quality Activity Status Report',   sortOrder: 281 },
  { key: 'report.warehouse_activity.view', resource: 'reports', screen: 'reports', tab: 'warehouse_activity', type: 'action', action: 'view', label: 'View Warehouse Activity Status Report', sortOrder: 282 },
  { key: 'report.fas_activity.view',       resource: 'reports', screen: 'reports', tab: 'fas_activity',       type: 'action', action: 'view', label: 'View FAS Activity Status Report',       sortOrder: 283 },
  { key: 'report.rh_status_summary.view',  resource: 'reports', screen: 'reports', tab: 'rh_status_summary',  type: 'action', action: 'view', label: 'View Shipment Status Summary RH Report', sortOrder: 284 },
];
const REPORTS_PERMISSION_KEYS = REPORTS_PERMISSION_TEMPLATES.map((template) => template.key);

// Local Purchase — independent screen/tab set for the new nearby-store-purchase flow
// (menu.local_purchase.view lives in MENU_PERMISSION_TEMPLATES above). Same
// {key, resource, screen, tab?, type, action?, label, sortOrder} shape as SHIPMENT_PERMISSION_TEMPLATES.
const LOCAL_PURCHASE_PERMISSION_TEMPLATES = [
  { key: 'local_purchase.screen.create.view', resource: 'local_purchase', screen: 'create_local_purchase', type: 'screen', label: 'View Create Local Purchase', sortOrder: 500 },
  { key: 'local_purchase.screen.create.save', resource: 'local_purchase', screen: 'create_local_purchase', type: 'action', action: 'save', label: 'Save Local Purchase', sortOrder: 501 },
  { key: 'local_purchase.screen.create.extract', resource: 'local_purchase', screen: 'create_local_purchase', type: 'action', action: 'extract', label: 'Extract LPO Document', sortOrder: 502 },
  { key: 'local_purchase.tab.entry.view', resource: 'local_purchase', screen: 'local_purchase_tracker', tab: 'entry', type: 'tab', label: 'View Local Purchase Entry', sortOrder: 510 },
  { key: 'local_purchase.tab.storage_allocation.view', resource: 'local_purchase', screen: 'local_purchase_tracker', tab: 'storage_allocation', type: 'tab', label: 'View Storage Allocation', sortOrder: 515 },
  { key: 'local_purchase.tab.storage_allocation.edit', resource: 'local_purchase', screen: 'local_purchase_tracker', tab: 'storage_allocation', type: 'action', action: 'edit', label: 'Edit Storage Allocation', sortOrder: 516 },
  { key: 'local_purchase.tab.storage_allocation.approve_warehouse_manager', resource: 'local_purchase', screen: 'local_purchase_tracker', tab: 'storage_allocation', type: 'action', action: 'approve_warehouse_manager', label: 'Approve Storage Allocation', sortOrder: 517 },
  { key: 'local_purchase.tab.storage_arrival.view', resource: 'local_purchase', screen: 'local_purchase_tracker', tab: 'storage_arrival', type: 'tab', label: 'View Storage Allocation & Arrival', sortOrder: 520 },
  { key: 'local_purchase.tab.storage_arrival.edit', resource: 'local_purchase', screen: 'local_purchase_tracker', tab: 'storage_arrival', type: 'action', action: 'edit', label: 'Edit Storage Allocation & Arrival', sortOrder: 521 },
  { key: 'local_purchase.tab.quality.view', resource: 'local_purchase', screen: 'local_purchase_tracker', tab: 'quality', type: 'tab', label: 'View Quality', sortOrder: 530 },
  { key: 'local_purchase.tab.quality.edit', resource: 'local_purchase', screen: 'local_purchase_tracker', tab: 'quality', type: 'action', action: 'edit', label: 'Edit Quality', sortOrder: 531 },
];
const LOCAL_PURCHASE_PERMISSION_KEYS = LOCAL_PURCHASE_PERMISSION_TEMPLATES.map((template) => template.key);

const ALL_PERMISSION_TEMPLATES = [
  ...MENU_PERMISSION_TEMPLATES,
  ...DASHBOARD_PERMISSION_TEMPLATES,
  ...DASHBOARD_DEPARTMENT_CHART_TEMPLATES,
  ...SETTINGS_PERMISSION_TEMPLATES,
  ...SHIPMENT_PERMISSION_TEMPLATES,
  ...REPORTS_PERMISSION_TEMPLATES,
  ...LEGACY_PERMISSION_TEMPLATES,
  ...LOCAL_PURCHASE_PERMISSION_TEMPLATES,
];

const DEFAULT_ROLE_PERMISSION_MAP = {
  Admin: 'ALL',
  Manager: 'ALL',
  Purchase: [
    'menu.dashboard.view',
    ...DASHBOARD_PERMISSION_KEYS,
    'menu.shipments.view',
    'menu.all_shipments.view',
    'menu.local_purchase.view',
    ...LOCAL_PURCHASE_PERMISSION_KEYS,
    'menu.suppliers.view',
    'menu.reports.view',
    ...REPORTS_PERMISSION_KEYS,
    'menu.settings.view',
    'settings.tab.warehouses.view',
    'settings.tab.exchange_rates.view',
    'shipment.screen.create_shipment.view',
    'shipment.screen.create_shipment.save',
    'shipment.screen.create_shipment.extract',
    'shipment.screen.shipment_tracker.view',
    'shipment.tab.shipment_entry.view',
    'shipment.field.shipment_entry.supplierEmail.edit',
    'shipment.tab.shipment_tracker_split.view',
    'shipment.tab.shipment_tracker_split.edit',
    'shipment.tab.shipment_tracker_split.lock_baseline',
    'shipment.tab.shipment_tracker_split.scheduled.view',
    'shipment.tab.shipment_tracker_split.scheduled.edit',
    'shipment.tab.shipment_tracker_split.actual.view',
    'shipment.tab.shipment_tracker_split.actual.edit',
    'shipment.tab.shipment_tracker_split.actual.upload_packing',
    'shipment.tab.shipment_tracker_split.actual.upload_bl',
    'shipment.tab.shipment_tracker_split.history.view',
    'shipment.tab.shipment_tracker_split.history.edit',
    'shipment.tab.shipment_tracker_split.report.view',
    'shipment.tab.shipment_tracker_split.report.edit',
    'shipment.field.shipment_tracker_split.plannedEtd.edit',
    'shipment.field.shipment_tracker_split.plannedEta.edit',
    'shipment.tab.bl_details.view',
    'shipment.tab.bl_details.edit',
    'shipment.tab.bl_details.clearing_advance.view',
    'shipment.tab.bl_details.clearing_advance.edit',
    'shipment.tab.bl_details.storage_allocations.view',
    'shipment.tab.bl_details.storage_allocations.edit',
    'shipment.tab.bl_details.packaging_list.view',
    'shipment.tab.bl_details.packaging_list.edit',
    'shipment.tab.document_tracker.view',
    'shipment.tab.document_tracker.edit',
    'shipment.tab.document_tracker.preview',
    'shipment.tab.document_tracker.milestone_1.view',
    'shipment.tab.document_tracker.milestone_1.edit',
    'shipment.tab.document_tracker.milestone_2.view',
    'shipment.tab.document_tracker.milestone_2.edit',
    'shipment.tab.document_tracker.milestone_3.view',
    'shipment.tab.document_tracker.milestone_4.view',
    'shipment.tab.document_tracker.milestone_5.view',
    'shipment.tab.document_tracker.milestone_6.view',
    'shipment.tab.quality.view',
    'shipment.tab.quality.edit',
    'shipment.action.reports.view',
  ],
  Logistic: [
    'menu.dashboard.view',
    ...DASHBOARD_PERMISSION_KEYS,
    'dashboard.section.logistics_chart.view',
    'dashboard.section.logistics_pending_completed.view',
    'menu.shipments.view',
    'menu.all_shipments.view',
    'menu.reports.view',
    ...REPORTS_PERMISSION_KEYS,
    'menu.settings.view',
    'settings.tab.warehouses.view',
    'settings.tab.transportation.view',
    'shipment.screen.shipment_tracker.view',
    'shipment.tab.port_customs.view',
    'shipment.tab.port_customs.edit',
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
    'shipment.tab.port_customs.transportation.view',
    'shipment.tab.port_customs.transportation.edit',
    'shipment.tab.storage.view',
    'shipment.tab.storage.storage_allocation.view',
    'shipment.tab.storage.storage_allocation.edit',
    'shipment.tab.storage.storage_arrival.view',
    'shipment.tab.storage.storage_arrival.edit',
  ],
  FAS: [
    'menu.dashboard.view',
    ...DASHBOARD_PERMISSION_KEYS,
    'dashboard.section.fas_chart.view',
    'dashboard.section.fas_pending_completed.view',
    'menu.shipments.view',
    'menu.all_shipments.view',
    'menu.reports.view',
    ...REPORTS_PERMISSION_KEYS,
    'menu.settings.view',
    'settings.tab.exchange_rates.view',
    'settings.tab.exchange_rates.edit',
    'shipment.screen.shipment_tracker.view',
    'shipment.tab.shipment_tracker_split.view',
    'shipment.tab.shipment_tracker_split.scheduled.view',
    'shipment.tab.shipment_tracker_split.actual.view',
    'shipment.tab.shipment_tracker_split.history.view',
    'shipment.tab.shipment_tracker_split.report.view',
    'shipment.tab.document_tracker.view',
    'shipment.tab.document_tracker.edit',
    'shipment.tab.document_tracker.preview',
    'shipment.tab.document_tracker.milestone_1.view',
    'shipment.tab.document_tracker.milestone_2.view',
    'shipment.tab.document_tracker.milestone_3.view',
    'shipment.tab.document_tracker.milestone_3.edit',
    'shipment.tab.document_tracker.milestone_4.view',
    'shipment.tab.document_tracker.milestone_4.edit',
    'shipment.tab.document_tracker.milestone_5.view',
    'shipment.tab.document_tracker.milestone_5.edit',
    'shipment.tab.document_tracker.milestone_6.view',
    'shipment.tab.document_tracker.milestone_6.edit',
    'shipment.tab.payment_costing.view',
    'shipment.tab.payment_costing.payment_allocation.view',
    'shipment.tab.payment_costing.payment_allocation.edit',
    'shipment.tab.payment_costing.costing_table.view',
    'shipment.tab.payment_costing.costing_table.edit',
    'shipment.tab.bl_details.clearing_advance.approve_fas',
    'shipment.tab.bl_details.clearing_advance.edit_payment_details',
    'shipment.tab.payment_costing.packaging_expenses.view',
    'shipment.tab.payment_costing.packaging_expenses.edit',
    'shipment.tab.payment_costing.generate_report',
    'shipment.tab.bl_details.clearing_advance.view',
    'shipment.tab.bl_details.storage_allocations.view',
    'shipment.tab.bl_details.packaging_list.view',
    'shipment.field.payment_costing.paidAmount.edit',
    'shipment.action.reports.view',
  ],
  FasManager: [
    'menu.dashboard.view',
    ...DASHBOARD_PERMISSION_KEYS,
    'dashboard.section.fas_chart.view',
    'dashboard.section.fas_pending_completed.view',
    'menu.shipments.view',
    'menu.all_shipments.view',
    'menu.reports.view',
    ...REPORTS_PERMISSION_KEYS,
    'menu.settings.view',
    'settings.tab.exchange_rates.view',
    'shipment.screen.shipment_tracker.view',
    'shipment.tab.bl_details.view',
    'shipment.tab.bl_details.clearing_advance.view',
    'shipment.tab.bl_details.clearing_advance.approve_fas_manager',
    'shipment.tab.bl_details.clearing_advance.edit_payment_details',
    'shipment.tab.payment_costing.view',
    'shipment.tab.payment_costing.payment_allocation.view',
    'shipment.tab.payment_costing.costing_table.view',
    'shipment.tab.payment_costing.costing_table.approve_fas_manager',
    'shipment.tab.payment_costing.packaging_expenses.view',
    'shipment.action.reports.view',
  ],
  warehouse: [
    'menu.dashboard.view',
    ...DASHBOARD_PERMISSION_KEYS,
    'dashboard.section.warehouse_allocation_status.view',
    'dashboard.section.warehouse_allocation_table.view',
    'dashboard.section.warehouse_receiving_status.view',
    'menu.shipments.view',
    'menu.all_shipments.view',
    'menu.local_purchase.view',
    'local_purchase.tab.entry.view',
    'local_purchase.tab.storage_allocation.view',
    'local_purchase.tab.storage_allocation.edit',
    'local_purchase.tab.storage_allocation.approve_warehouse_manager',
    'local_purchase.tab.storage_arrival.view',
    'local_purchase.tab.storage_arrival.edit',
    'menu.reports.view',
    ...REPORTS_PERMISSION_KEYS,
    'menu.settings.view',
    'settings.tab.warehouses.view',
    'shipment.screen.shipment_tracker.view',
    'shipment.tab.bl_details.view',
    'shipment.tab.bl_details.storage_allocations.view',
    'shipment.tab.bl_details.storage_allocations.approve_warehouse_manager',
    'shipment.tab.storage.view',
    'shipment.tab.storage.storage_allocation.view',
    'shipment.tab.storage.storage_arrival.view',
    'shipment.tab.storage.storage_arrival.approve_warehouse_manager',
    'shipment.action.reports.view',
  ],
  StoreKeeper: [
    'menu.dashboard.view',
    'dashboard.section.storekeeper_receiving_status.view',
    'dashboard.section.storekeeper_receiving_timeline.view',
    'dashboard.section.storekeeper_summary.view',
    'menu.shipments.view',
    'menu.all_shipments.view',
    'menu.settings.view',
    'settings.tab.warehouses.view',
    'shipment.screen.shipment_tracker.view',
    'shipment.tab.bl_details.view',
    'shipment.tab.bl_details.storage_allocations.view',
    'shipment.tab.storage.view',
    'shipment.tab.storage.storage_allocation.view',
    'shipment.tab.storage.storage_arrival.view',
    'shipment.tab.storage.storage_arrival.approve_warehouse_manager',
  ],
};

async function ensureRolesSeeded() {
  for (const role of DEFAULT_ROLES) {
    await Role.updateOne(
      { key: role.key },
      {
        $setOnInsert: { key: role.key },
        $set: {
          isSystem: role.isSystem,
        },
      },
      { upsert: true }
    );
  }

  const legacyWarehouseRole = await Role.findOne({ key: 'WarehouseManager', isSystem: true });
  if (legacyWarehouseRole) {
    const hasLinkedUsers = await User.exists({ role: 'WarehouseManager' });
    if (!hasLinkedUsers) {
      await RolePermission.deleteMany({ roleKey: 'WarehouseManager' });
      await Role.deleteOne({ _id: legacyWarehouseRole._id });
    }
  }
}

async function seedShipmentPermissionsAndDefaults() {
  await ensureRolesSeeded();

  for (const template of ALL_PERMISSION_TEMPLATES) {
    const { key, ...permissionUpdates } = template;
    await Permission.updateOne(
      { key },
      {
        $setOnInsert: { key },
        $set: { ...permissionUpdates, isActive: true },
      },
      { upsert: true }
    );
  }

  for (const roleKey of Object.keys(DEFAULT_ROLE_PERMISSION_MAP)) {
    const configured = DEFAULT_ROLE_PERMISSION_MAP[roleKey];
    const permissionKeys = configured === 'ALL'
      ? ALL_PERMISSION_TEMPLATES.map((permission) => permission.key)
      : configured;

    for (const permissionKey of permissionKeys) {
      // `allowed` must only be set on first insert (the default grant). Previously this used
      // `$set: { allowed: true }`, which re-ran on every server restart and silently reverted
      // any permission an admin had manually unchecked in Access Control back to allowed —
      // making saved changes look like they "didn't stick" after the next restart/deploy.
      await RolePermission.updateOne(
        { roleKey, permissionKey },
        {
          $setOnInsert: { roleKey, permissionKey, allowed: true },
        },
        { upsert: true }
      );
    }
  }
}

module.exports = {
  DEFAULT_ROLES,
  MENU_PERMISSION_TEMPLATES,
  DASHBOARD_PERMISSION_TEMPLATES,
  DASHBOARD_DEPARTMENT_CHART_TEMPLATES,
  SETTINGS_PERMISSION_TEMPLATES,
  SHIPMENT_PERMISSION_TEMPLATES,
  LEGACY_PERMISSION_TEMPLATES,
  ALL_PERMISSION_TEMPLATES,
  DEFAULT_ROLE_PERMISSION_MAP,
  ensureRolesSeeded,
  seedShipmentPermissionsAndDefaults,
};
