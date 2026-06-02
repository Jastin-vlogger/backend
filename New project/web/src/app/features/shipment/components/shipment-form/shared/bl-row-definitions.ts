export type BlVisibleRole = string;

export interface BlRowDefinition {
  key: string;
  sn: number;
  description: string;
  visibleTo: BlVisibleRole[];
  defaultQty: number;
  defaultRate: number;
}

export const BL_ROW_DEFINITIONS: readonly BlRowDefinition[] = [
  { key: 'invoice_attestation_mofaic', sn: 1, description: 'Invoice Attestation - MOFAIC', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'do_charges', sn: 2, description: 'DO Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'do_extension', sn: 3, description: 'DO Extension', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'air_cargo_clearing_charge', sn: 4, description: 'Air Cargo Clearing Charge', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'labour_charges', sn: 5, description: 'Labour Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'other_charges', sn: 6, description: 'Other Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'boe', sn: 7, description: 'BOE', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'custom_duty_5', sn: 8, description: 'Custom Duty 5%', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'custom_pay_service_charges', sn: 9, description: 'Custom Pay Service Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'dp_charges', sn: 10, description: 'DP Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'tluc', sn: 11, description: 'TLUC', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'thc', sn: 12, description: 'THC', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'dp_storage_charges_01', sn: 13, description: 'DP Storage Charges 01', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'dp_storage_charges_02', sn: 14, description: 'DP Storage Charges 02', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'mun_charges', sn: 15, description: 'Mun Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'addi_gate_token', sn: 16, description: 'Addi Gate Token', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'dp_gate_token', sn: 17, description: 'DP Gate Token', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'transportation_single_rate_alain', sn: 18, description: 'Transportation Single @rate (ALAIN)', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'transportation_single_rate_ad', sn: 19, description: 'Transportation Single @rate (AD)', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'transportation_single_couple_rate_dic', sn: 20, description: 'Transportation Single/Couple @rate (DIC)', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'transportation_single_couple_rate_location', sn: 21, description: 'Transportation Single/Couple @rate (Location)', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'inspection_charges_01', sn: 22, description: 'Inspection Charges 01', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'inspection_charges_02', sn: 23, description: 'Inspection Charges 02', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'offloading_charges_01', sn: 24, description: 'Offloading Charges 01', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'offloading_charges_02', sn: 25, description: 'Offloading Charges 02', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'mecrec_charges', sn: 26, description: 'Mecrec Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'open_close_fees_with_sales_at_customs', sn: 27, description: 'Open & Close Fees with Sales at Customs', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'other', sn: 28, description: 'Other', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'murabaha_profit', sn: 29, description: 'Murabaha Profit', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'document_processing_charge', sn: 30, description: 'Document Processing Charge', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'exces_atm_payment', sn: 31, description: 'EXCES ATM Payment', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'do_online_payment_service_charge_1_5', sn: 32, description: 'DO ONLINE PAYMENT SERVICE CHARGE 1.5%', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'do_online_payment_service_charge_5_vat', sn: 33, description: 'DO ONLINE PAYMENT SERVICE CHARGE 5% VAT', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { key: 'mofa_invoice_cco_attestation_fees', sn: 34, description: 'MOFA INVOICE & CCO ATTESTATION FEES', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
] as const;

export function normalizeBlRole(role: string | null | undefined): BlVisibleRole | null {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'logistic' || normalized === 'logistics') return 'logistic';
  if (normalized === 'fas' || normalized === 'fasmanager' || normalized === 'fas manager') return 'fas';
  return normalized || null;
}

export function normalizeBlVisibleTo(value: unknown): BlVisibleRole[] {
  const list = Array.isArray(value) ? value : [];
  const normalized = list
    .map((entry) => normalizeBlRole(String(entry || '')))
    .filter((entry): entry is BlVisibleRole => !!entry);
  return normalized.length ? Array.from(new Set(normalized)) : ['logistic', 'fas'];
}
