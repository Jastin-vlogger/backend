import { Component, OnDestroy, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

// PrimeNG Imports (v21 matching package.json)
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';

import { PrimaryButtonDirective } from '../../../../shared/directives/button.directive';
import { ShipmentService } from '../../../../core/services/shipment.service';
import { CreateShipmentPayload, ExtractedShipmentData, ExtractedShipmentItem } from '../../../../core/models/shipment.model';
import { ItemService } from '../../../../core/services/item.service';
import { ExchangeRateService, ExchangeRate } from '../../../../core/services/exchange-rate.service';

@Component({
  selector: 'app-create-shipment',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    InputTextModule,
    SelectModule,
    InputNumberModule,
    DatePickerModule,
    TextareaModule,
    ButtonModule,
    ToastModule,
    DialogModule,
    PrimaryButtonDirective
  ],
  providers: [MessageService],
  templateUrl: './create-shipment.component.html',
  styleUrls: ['./create-shipment.component.scss']
})
export class CreateShipmentComponent implements OnInit, OnDestroy {
  readonly appDateFormat = 'dd/mm/yy';
  readonly extractionMessages = [
    'Uploading your documents securely',
    'Royal AI is reading the purchase order',
    'Matching extracted items with your item master',
    'Structuring shipment header and pricing details',
    'Preparing the extracted result for review'
  ];
  shipmentForm!: FormGroup;
  submitting = signal(false);

  /** Active exchange rates loaded from the API */
  exchangeRates = signal<ExchangeRate[]>([]);
  /** Options for the bank selector in the form */
  exchangeRateOptions = signal<Array<{ label: string; value: string; rate: number }>>([]);
  /** The currently selected exchange rate (AED per USD). Falls back to 3.67 if not loaded. */
  selectedExchangeRate = signal<number>(3.67);

  // Document handling: document1 = Purchase order, document2 = optional Pro-forma Invoice
  document1File = signal<File | null>(null);
  document2File = signal<File | null>(null);
  s1QualityReportFile = signal<File | null>(null);
  extracting = signal(false);
  extractedQ1Report = signal<Record<string, unknown> | null>(null);
  extractedFclPerUnit = signal<number | null>(null);
  extractedItems = signal<ExtractedShipmentItem[]>([]);
  extractionMessageIndex = signal(0);
  extractionProgress = signal(18);
  /** Set after extract & autopopulate when response includes shipment_calculations; used for price-mismatch warning. */
  extractionPriceMismatch = signal<{ isPriceMatching: boolean; diffPercent?: number } | null>(null);
  private subscriptions = new Subscription();
  private extractionTicker: ReturnType<typeof setInterval> | null = null;

  // Document preview modal
  showPreviewModal = signal(false);
  previewUrl = signal<string | null>(null);
  previewTitle = signal('');
  previewIsImage = signal(false);
  currentExtractionMessage = computed(() => this.extractionMessages[this.extractionMessageIndex()] || this.extractionMessages[0]);
  previewSafeUrl = computed(() => {
    const url = this.previewUrl();
    if (!url || this.previewIsImage()) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  // Static Dropdown Options
  buyingUnits = [
    { label: 'MT', value: 'MT' },
    { label: 'KG', value: 'KG' },
    { label: 'Bag', value: 'Bag' },
    { label: 'Pallet', value: 'Pallet' },
  ];

  incoTerms = [
    { label: 'CIF', value: 'CIF' },
    { label: 'FOB', value: 'FOB' },
    { label: 'EXWORKS', value: 'EXWORKS' },
    { label: 'C&F', value: 'C&F' }
  ];

  paymentTerms = [
    { label: 'CAD 100%', value: 'CAD 100%' },
    { label: 'Advance 20% BT, Balance 80% CAD', value: 'Advance 20% BT, Balance 80% CAD' },
    { label: 'Advance 30% BT, Balance 70% CAD', value: 'Advance 30% BT, Balance 70% CAD' },
    { label: 'Advance 10% BT, Balance 90% CAD', value: 'Advance 10% BT, Balance 90% CAD' },
    { label: 'BT against Delivery 100%', value: 'BT against Delivery 100%' },
    { label: 'BT against Documents 100%', value: 'BT against Documents 100%' }
  ];

  bankNames = [
    { label: 'ADIB', value: 'ADIB' },
    { label: 'EIB', value: 'EIB' },
    { label: 'DIB', value: 'DIB' }
  ];

  containerSizes = [
    { label: "20'", value: '20' },
    { label: "40'", value: '40' }
  ];

  commodities = [
    { label: 'Rice', value: 'Rice' },
    { label: 'Wheat', value: 'Wheat' },
    { label: 'Sugar', value: 'Sugar' },
    { label: 'Maize', value: 'Maize' },
    { label: 'Soybean', value: 'Soybean' },
    { label: 'Cotton', value: 'Cotton' },
    { label: 'Pulses', value: 'Pulses' },
    { label: 'Other', value: 'Other' }
  ];

  readonly extractedEditableFields: Array<keyof ExtractedShipmentItem> = [
    'itemCode',
    'itemDescription',
    'commodity',
    'countryOfOrigin',
    'brandName',
    'barcode',
    'dmBarcode',
    'variant',
    'hsCode',
    'packagingType',
    'containerSize',
    'plannedContainers',
    'fcl',
    'pallet',
    'bags',
    'buyingUnit',
    'fclPerUnit',
    'fcPerUnit',
    'totalUSD',
    'totalAED'
  ];

  constructor(
    private fb: FormBuilder,
    private shipmentService: ShipmentService,
    private itemService: ItemService,
    private messageService: MessageService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private exchangeRateService: ExchangeRateService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.setupAutoFill();
    this.loadExchangeRates();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.stopExtractionExperience();
  }

  private initForm(): void {
    this.shipmentForm = this.fb.group({
      // Shipment Info
      commodity: [''],
      piNo: ['', Validators.required],
      piDate: [null],
      fpoNo: [''],
      purchaseDate: [null],
      incoTerms: [null],
      portOfLoading: [''],
      portOfDischarge: [''],
      itemCode: [''],
      brandName: [''],
      barcode: [''],
      dmBarcode: [''],
      variant: [''],
      hsCode: [''],
      itemDescription: [''],

      // Supplier Details
      supplier: ['', Validators.required],
      supplierEmail: ['', [Validators.required, Validators.email]],
      countryOfOrigin: ['', Validators.required],

      // Quantity of Packaging
      packagingType: [''],
      containerSize: [null],
      fcl: [null],
      pallet: [null],
      bags: [null],
      plannedContainers: [null],

      // Price
      buyingUnit: [null],
      noOfShipments: [null],
      fcPerUnit: [null],
      totalUSD: [{ value: null, disabled: true }],
      totalAED: [{ value: null, disabled: true }],
      paymentTerms: [null],
      bankName: [null],
      advanceAmount: [null],
      expectedETD: [null],
      expectedETA: [null],
      s1QualityReport: [null, Validators.required]
    }, {
      validators: this.dateOrderValidator('expectedETD', 'expectedETA', 'etaBeforeEtd')
    });

    // Reactive Financial Calculation (Total USD = Planned Containers * FC per Unit)
    // Total AED = Total USD * selected bank exchange rate (falls back to 3.67 Direct rate)
    this.shipmentForm.valueChanges.subscribe(val => {
        const count = Number(val.plannedContainers) || 0;
        const rate = Number(val.fcPerUnit) || 0;
        const totalUSD = count * rate;
        const aedRate = this.selectedExchangeRate();
        const totalAED = totalUSD * aedRate;

        this.shipmentForm.get('totalUSD')?.setValue(totalUSD > 0 ? totalUSD : 0, { emitEvent: false });
        this.shipmentForm.get('totalAED')?.setValue(totalAED > 0 ? totalAED : 0, { emitEvent: false });
    });
  }

  private setupAutoFill(): void {
    const itemCodeControl = this.shipmentForm.get('itemCode');
    if (itemCodeControl) {
      this.subscriptions.add(
        itemCodeControl.valueChanges
          .pipe(debounceTime(300), distinctUntilChanged())
          .subscribe((value) => {
            const itemCode = typeof value === 'string' ? value.trim() : '';
            if (!itemCode) return;
            this.lookupItemMetadata(itemCode);
          })
      );
    }

    this.subscriptions.add(this.shipmentForm.get('paymentTerms')!.valueChanges.subscribe((term) => {
      const bankNameControl = this.shipmentForm.get('bankName');
      if (!bankNameControl) return;

      if (this.requiresBankName(term)) {
        bankNameControl.addValidators(Validators.required);
      } else {
        bankNameControl.clearValidators();
        bankNameControl.setValue(null, { emitEvent: false });
      }

      bankNameControl.updateValueAndValidity({ emitEvent: false });
    }));

    // When bank changes, update the exchange rate used for AED calculation
    this.subscriptions.add(
      this.shipmentForm.get('bankName')!.valueChanges.subscribe((bankName) => {
        this.onBankSelected(bankName);
      })
    );
  }

  requiresBankName(term: string | null | undefined): boolean {
    return typeof term === 'string' && term.includes('CAD');
  }

  /** Load active exchange rates from the API and build the bank selector options */
  private loadExchangeRates(): void {
    this.exchangeRateService.getActive().subscribe({
      next: (rates) => {
        this.exchangeRates.set(rates);
        // Build options showing only bank name (not the rate) — clean like the old bankNames dropdown
        const options = rates
          .filter((r) => !r.isDefault) // exclude Direct from the dropdown — it's the silent fallback
          .map((r) => ({
            label: r.bankName,
            value: r.bankName,
            rate: r.rate,
          }));
        this.exchangeRateOptions.set(options);

        // Set the default rate from the "Direct" entry
        const directRate = rates.find((r) => r.isDefault || r.bankName === 'Direct');
        if (directRate) {
          this.selectedExchangeRate.set(directRate.rate);
        }
      },
      error: () => {
        this.selectedExchangeRate.set(3.67);
      },
    });
  }

  /**
   * Called when the user selects a bank in the form.
   * Updates the AED exchange rate and recalculates totals.
   */
  onBankSelected(bankName: string | null): void {
    const rates = this.exchangeRates();
    let rate: number;

    if (!bankName) {
      // No bank selected → use Direct rate
      const direct = rates.find((r) => r.isDefault || r.bankName === 'Direct');
      rate = direct?.rate ?? 3.67;
    } else {
      const match = rates.find((r) => r.bankName === bankName);
      rate = match?.rate ?? 3.67;
    }

    this.selectedExchangeRate.set(rate);

    // Recalculate AED with the new rate
    const formVal = this.shipmentForm.getRawValue();
    const totalUSD = Number(formVal.totalUSD) || 0;
    this.shipmentForm.get('totalAED')?.setValue(
      totalUSD > 0 ? Number((totalUSD * rate).toFixed(2)) : 0,
      { emitEvent: false }
    );
  }

  private normalizeSearchText(value: string | null | undefined): string {
    return String(value || '')
      .toUpperCase()
      .replace(/[%]/g, ' PERCENT ')
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getPaymentTermMatch(extractedValue: string | null | undefined): string | null {
    const normalized = this.normalizeSearchText(extractedValue);
    if (!normalized) return null;

    const specialCases: Array<{ test: (value: string) => boolean; result: string }> = [
      {
        test: (value) => value.includes('ADVANCE 20') && value.includes('BALANCE 80') && value.includes('CAD'),
        result: 'Advance 20% BT, Balance 80% CAD',
      },
      {
        test: (value) => value.includes('ADVANCE 30') && value.includes('BALANCE 70') && value.includes('CAD'),
        result: 'Advance 30% BT, Balance 70% CAD',
      },
      {
        test: (value) => value.includes('ADVANCE 10') && value.includes('BALANCE 90') && value.includes('CAD'),
        result: 'Advance 10% BT, Balance 90% CAD',
      },
      {
        test: (value) => value.includes('BT AGAINST DELIVERY') && value.includes('100'),
        result: 'BT against Delivery 100%',
      },
      {
        test: (value) => value.includes('BT AGAINST DOCUMENT') && value.includes('100'),
        result: 'BT against Documents 100%',
      },
      {
        test: (value) =>
          value.includes('100') &&
          value.includes('CAD') &&
          (value.includes('BANK TO BANK') || value.includes('PAYMENT')),
        result: 'CAD 100%',
      },
    ];

    const directMatch = specialCases.find((entry) => entry.test(normalized));
    if (directMatch) {
      return directMatch.result;
    }

    const sourceTokens = normalized.split(' ').filter(Boolean);
    let bestScore = 0;
    let bestMatch: string | null = null;

    for (const option of this.paymentTerms) {
      const optionNormalized = this.normalizeSearchText(option.value);
      const optionTokens = optionNormalized.split(' ').filter(Boolean);
      const sharedTokenCount = optionTokens.filter((token) => sourceTokens.includes(token)).length;
      const score = sharedTokenCount / Math.max(optionTokens.length, 1);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = option.value;
      }
    }

    return bestScore >= 0.45 ? bestMatch : null;
  }

  // Purchase order (document1) & Pro-forma Invoice (document2) for extraction
  onDocument1Selected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.document1File.set(file);
    this.resetExtractionState();
    input.value = '';
  }

  onDocument2Selected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.document2File.set(file);
    input.value = '';
  }

  clearDocument1(): void {
    this.document1File.set(null);
    this.resetExtractionState();
  }

  clearDocument2(): void {
    this.document2File.set(null);
  }

  onQualityReportSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.s1QualityReportFile.set(file);
    this.shipmentForm.get('s1QualityReport')?.setValue(file, { emitEvent: false });
    this.resetExtractionState();
    input.value = '';
  }

  removeQualityReport(): void {
    this.s1QualityReportFile.set(null);
    this.shipmentForm.get('s1QualityReport')?.setValue(null, { emitEvent: false });
    this.resetExtractionState();
  }

  private resetExtractionState(): void {
    this.extractedItems.set([]);
    this.extractedQ1Report.set(null);
    this.extractedFclPerUnit.set(null);
    this.extractionPriceMismatch.set(null);
  }

  private startExtractionExperience(): void {
    this.stopExtractionExperience();
    this.extractionMessageIndex.set(0);
    this.extractionProgress.set(18);
    this.extractionTicker = setInterval(() => {
      this.extractionMessageIndex.update((index) => (index + 1) % this.extractionMessages.length);
      this.extractionProgress.update((value) => {
        if (value >= 88) return 26;
        return value + 12;
      });
    }, 1600);
  }

  private stopExtractionExperience(): void {
    if (this.extractionTicker) {
      clearInterval(this.extractionTicker);
      this.extractionTicker = null;
    }
    this.extractionMessageIndex.set(0);
    this.extractionProgress.set(18);
  }

  hasAllRequiredDocuments(): boolean {
    return !!this.document1File() && !!this.s1QualityReportFile();
  }

  openDocumentPreview(file: File, title: string): void {
    const url = URL.createObjectURL(file);
    this.previewUrl.set(url);
    this.previewTitle.set(title);
    this.previewIsImage.set(file.type.startsWith('image/'));
    this.showPreviewModal.set(true);
  }

  closeDocumentPreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
    this.previewTitle.set('');
    this.showPreviewModal.set(false);
  }

  onPreviewModalHide(): void {
    this.closeDocumentPreview();
  }

  /** Called when dialog visibility changes; only close/revoke when dialog is hidden */
  onPreviewVisibleChange(visible: boolean): void {
    if (!visible) this.closeDocumentPreview();
  }

  /** Label for price-mismatch diff_percent (e.g. "0.51%" or "—"). */
  get priceMismatchDiffLabel(): string {
    const m = this.extractionPriceMismatch();
    if (m?.diffPercent == null) return '—';
    return `${m.diffPercent.toFixed(2)}%`;
  }

  onExtractAndAutopopulate(): void {
    const file1 = this.document1File();
    const quality = this.s1QualityReportFile();
    if (!file1 || !quality) return;

    const formData = new FormData();
    formData.append('document1', file1, file1.name);
    formData.append('s1QualityReport', quality, quality.name);

    this.extracting.set(true);
    this.startExtractionExperience();
    this.extractionPriceMismatch.set(null);
    this.extractedFclPerUnit.set(null);
    this.shipmentService.extractShipmentFromDocuments(formData).subscribe({
      next: (response) => {
        this.extracting.set(false);
        this.stopExtractionExperience();
        this.messageService.add({
          severity: 'success',
          summary: 'Extraction complete',
          detail: response.message ?? 'Values extracted and form autopopulated.'
        });
        if (response.data) {
          this.applyExtractionResponse(response.data);
        }
      },
      error: (err) => {
        this.extracting.set(false);
        this.stopExtractionExperience();
        console.error('Extract documents error:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Extraction failed',
          detail: err.error?.message ?? 'Could not extract data from documents.'
        });
      }
    });
  }

  /**
   * Patch Create New Shipment form from extracted data.
   * Resolves supplier/item by supplierCode/itemCode from resolved lists.
   * All keys are optional; missing or invalid values are skipped (no error).
   */
  private applyExtractionResponse(data: ExtractedShipmentData): void {
    try {
      const patch: Record<string, unknown> = {};
      this.extractedQ1Report.set((data.q1Report as Record<string, unknown>) ?? null);

      const dateKeys = ['piDate', 'purchaseDate'];
      for (const key of dateKeys) {
        const v = (data as Record<string, unknown>)[key];
        if (v == null || v === '') continue;
        const dateVal = typeof v === 'string' ? this.parseDate(v) : v;
        if (dateVal != null) patch[key] = dateVal;
      }

      const directKeys = [
        'piNo', 'fpoNo', 'incoTerms', 'portOfLoading', 'portOfDischarge',
        'advanceAmount'
      ];
      for (const key of directKeys) {
        const v = (data as Record<string, unknown>)[key];
        if (v == null) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        patch[key] = v;
      }

      const matchedPaymentTerm = this.getPaymentTermMatch(data.paymentTerms);
      if (matchedPaymentTerm) {
        patch['paymentTerms'] = matchedPaymentTerm;
      } else if (typeof data.paymentTerms === 'string' && data.paymentTerms.trim()) {
        patch['paymentTerms'] = data.paymentTerms.trim();
      }

      const rawName = data.supplierName;
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      if (name) {
        patch['supplier'] = name;
      }

      this.shipmentForm.patchValue(patch, { emitEvent: false });

      const items = Array.isArray(data.items) && data.items.length
        ? data.items
        : [this.buildFallbackItemFromLegacyExtraction(data)];
      this.extractedItems.set(items);
      this.patchFormFromExtractedItems(items);

      const sc = data.shipmentCalculations;
      if (sc) {
        this.extractionPriceMismatch.set({
          isPriceMatching: sc.is_price_matching === true,
          diffPercent: sc.diff_percent
        });
      } else {
        this.extractionPriceMismatch.set(null);
      }
    } catch {
      // If anything fails, just skip autopopulate; user can fill manually
    }
  }

  private patchFormFromExtractedItems(items: ExtractedShipmentItem[]): void {
    if (!items.length) return;
    const primaryItem = items[0];
    const sumNumeric = (selector: (item: ExtractedShipmentItem) => number | undefined) =>
      items.reduce((sum, item) => sum + (selector(item) || 0), 0);
    const uniqueValues = (selector: (item: ExtractedShipmentItem) => string | undefined) =>
      [...new Set(items.map((item) => String(selector(item) || '').trim()).filter(Boolean))];
    const uniqueOrMixed = (selector: (item: ExtractedShipmentItem) => string | undefined, fallback = '') => {
      const values = uniqueValues(selector);
      if (!values.length) return fallback;
      return values.length === 1 ? values[0] : `Multiple (${values.length})`;
    };

    const patch: Record<string, unknown> = {};
    patch['itemCode'] = uniqueOrMixed((item) => item.itemCode, primaryItem.itemCode || '');
    patch['itemDescription'] = items.length > 1 ? `Multiple Items (${items.length})` : (primaryItem.itemDescription || '');
    patch['commodity'] = uniqueOrMixed((item) => item.commodity, primaryItem.commodity || '');
    patch['brandName'] = uniqueOrMixed((item) => item.brandName, primaryItem.brandName || '');
    patch['countryOfOrigin'] = uniqueOrMixed((item) => item.countryOfOrigin, primaryItem.countryOfOrigin || '');
    patch['barcode'] = uniqueOrMixed((item) => item.barcode, primaryItem.barcode || '');
    patch['dmBarcode'] = uniqueOrMixed((item) => item.dmBarcode, primaryItem.dmBarcode || '');
    patch['variant'] = uniqueOrMixed((item) => item.variant, primaryItem.variant || '');
    patch['hsCode'] = uniqueOrMixed((item) => item.hsCode, primaryItem.hsCode || '');
    patch['packagingType'] = uniqueOrMixed((item) => item.packagingType, primaryItem.packagingType || '');
    patch['containerSize'] = uniqueOrMixed((item) => item.containerSize, primaryItem.containerSize || '');
    patch['plannedContainers'] = sumNumeric((item) => item.plannedContainers);
    patch['fcl'] = sumNumeric((item) => item.fcl);
    patch['pallet'] = sumNumeric((item) => item.pallet);
    patch['bags'] = sumNumeric((item) => item.bags);
    patch['buyingUnit'] = uniqueOrMixed((item) => item.buyingUnit, primaryItem.buyingUnit || '');
    patch['fcPerUnit'] = patch['plannedContainers']
      ? Number((sumNumeric((item) => item.totalUSD) / Number(patch['plannedContainers'] || 0)).toFixed(2))
      : (primaryItem.fcPerUnit || 0);
    patch['totalUSD'] = sumNumeric((item) => item.totalUSD);
    patch['totalAED'] = sumNumeric((item) => item.totalAED);
    patch['expectedETD'] = primaryItem.expectedETD ? this.parseDate(primaryItem.expectedETD) : null;
    patch['expectedETA'] = primaryItem.expectedETA ? this.parseDate(primaryItem.expectedETA) : null;

    this.shipmentForm.patchValue(patch, { emitEvent: false });

    this.shipmentForm.updateValueAndValidity({ emitEvent: true });
  }

  updateExtractedItem<K extends keyof ExtractedShipmentItem>(index: number, key: K, value: ExtractedShipmentItem[K]): void {
    const nextItems = this.extractedItems().map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return {
        ...item,
        [key]: value,
      };
    });

    this.extractedItems.set(nextItems);
    this.patchFormFromExtractedItems(nextItems);
  }

  updateExtractedNumericField(index: number, key: keyof ExtractedShipmentItem, value: number | null | undefined): void {
    const normalized = value == null || Number.isNaN(Number(value)) ? 0 : Number(value);
    this.updateExtractedItem(index, key as keyof ExtractedShipmentItem, normalized as never);
  }

  updateExtractedTextField(index: number, key: keyof ExtractedShipmentItem, value: string | null | undefined): void {
    this.updateExtractedItem(index, key as keyof ExtractedShipmentItem, String(value || '') as never);
  }

  updateExtractedDateField(index: number, key: 'expectedETD' | 'expectedETA', value: Date | string | null | undefined): void {
    let normalized = '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      normalized = value.toISOString();
    } else if (typeof value === 'string' && value.trim()) {
      const parsed = this.parseDate(value);
      normalized = parsed ? parsed.toISOString() : '';
    }
    this.updateExtractedItem(index, key, normalized as never);
  }

  getExtractedDateValue(value?: string): Date | null {
    if (!value) return null;
    const parsed = this.parseDate(value);
    return parsed;
  }

  getExtractedWeightedFcPerUnit(): number {
    const totalQty = this.getExtractedTotalQuantity();
    if (!totalQty) return 0;
    return Number((this.getExtractedTotalAmount() / totalQty).toFixed(2));
  }

  getExtractedTotalAmountAed(): number {
    return this.extractedItems().reduce((sum, item) => sum + (item.totalAED || 0), 0);
  }

  private buildFallbackItemFromLegacyExtraction(data: ExtractedShipmentData): ExtractedShipmentItem {
    return {
      lineNo: 1,
      itemCode: data.itemCode,
      itemDescription: data.itemDescription,
      commodity: data.commodity,
      brandName: data.brandName,
      countryOfOrigin: data.countryOfOrigin,
      barcode: data.barcode,
      variant: data.variant,
      hsCode: data.hsCode,
      packagingType: data.packagingType,
      containerSize: data.containerSize,
      plannedContainers: data.plannedContainers,
      fcl: data.fcl,
      pallet: data.pallet,
      bags: data.bags,
      noOfShipments: data.noOfShipments,
      buyingUnit: data.buyingUnit,
      fclPerUnit: data.fclPerUnit,
      fcPerUnit: data.fcPerUnit,
      totalUSD: data.totalUSD,
      totalAED: data.totalAED,
      expectedETD: data.expectedETD,
      expectedETA: data.expectedETA,
    };
  }

  getExtractedTotalQuantity(): number {
    return this.extractedItems().reduce((sum, item) => sum + (item.plannedContainers || 0), 0);
  }

  getExtractedTotalAmount(): number {
    return this.extractedItems().reduce((sum, item) => sum + (item.totalUSD || 0), 0);
  }

  getExtractedTotalFcl(): number {
    return this.extractedItems().reduce((sum, item) => sum + (item.fcl || 0), 0);
  }

  getExtractedTotalBags(): number {
    return this.extractedItems().reduce((sum, item) => sum + (item.bags || 0), 0);
  }

  getExtractedTotalPallets(): number {
    return this.extractedItems().reduce((sum, item) => sum + (item.pallet || 0), 0);
  }

  getExtractedDisplayValue<K extends keyof ExtractedShipmentItem>(key: K): string {
    const values = [...new Set(this.extractedItems().map((item) => String(item[key] || '').trim()).filter(Boolean))];
    if (!values.length) return '—';
    return values.length === 1 ? values[0] : `Multiple (${values.length})`;
  }

  private parseDate(v: string): Date | null {
    if (!v || typeof v !== 'string') return null;
    const parsed = new Date(v.trim());
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private dateOrderValidator(startControlName: string, endControlName: string, errorKey: string): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const startValue = control.get(startControlName)?.value;
      const endValue = control.get(endControlName)?.value;
      if (!startValue || !endValue) return null;

      const startDate = new Date(startValue);
      const endDate = new Date(endValue);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return null;
      }

      return endDate <= startDate ? { [errorKey]: true } : null;
    };
  }

  private lookupItemMetadata(itemCode: string): void {
    const normalizedItemCode = itemCode.trim();
    if (!normalizedItemCode) return;

    this.subscriptions.add(
      this.itemService.getItemByCode(normalizedItemCode).subscribe({
        next: (item) => {
          const currentDescription = String(this.shipmentForm.get('itemDescription')?.value || '').trim();
          const currentCommodity = String(this.shipmentForm.get('commodity')?.value || '').trim();
          const currentPacking = String(this.shipmentForm.get('packagingType')?.value || '').trim();
          this.shipmentForm.patchValue({
            brandName: item.brand || this.shipmentForm.get('brandName')?.value || '',
            barcode: item.barcode || this.shipmentForm.get('barcode')?.value || '',
            dmBarcode: item.dm_barcode || this.shipmentForm.get('dmBarcode')?.value || '',
            variant: item.variant || this.shipmentForm.get('variant')?.value || '',
            hsCode: item.hsCode || item.hs_code || this.shipmentForm.get('hsCode')?.value || '',
            countryOfOrigin: item.country_of_origin || this.shipmentForm.get('countryOfOrigin')?.value || '',
            itemDescription: currentDescription || item.item_name || '',
            commodity: currentCommodity || item.category || '',
            packagingType: currentPacking || this.getPackagingLabel(item.unit_kg)
          }, { emitEvent: false });
          this.shipmentForm.updateValueAndValidity({ emitEvent: false });
        },
        error: () => {
          // Item enrichment is optional; leave manual/extracted values untouched.
        }
      })
    );
  }

  private getPackagingLabel(unitKg?: number): string {
    if (!unitKg || !Number.isFinite(unitKg)) return '';
    return `1X${unitKg}KG`;
  }

  onSubmit(): void {
    if (this.shipmentForm.invalid || !this.hasAllRequiredDocuments()) {
      const piNoControl = this.shipmentForm.get('piNo');
      const supplierEmailControl = this.shipmentForm.get('supplierEmail');
      const detail = this.shipmentForm.hasError('etaBeforeEtd')
        ? 'ETA must be later than ETD.'
        : piNoControl?.hasError('required')
          ? 'PI No. is required before saving the shipment.'
          : supplierEmailControl?.hasError('required')
            ? 'Supplier email is required before saving the shipment.'
            : supplierEmailControl?.hasError('email')
              ? 'Enter a valid supplier email address.'
              : this.shipmentForm.get('countryOfOrigin')?.hasError('required')
                ? 'Country of origin is required before saving the shipment.'
          : 'Please fill all required fields and upload Purchase Order plus S1 Quality Report.';
      this.messageService.add({
        severity: 'warn',
        summary: 'Validation Error',
        detail
      });
      return;
    }

    this.submitting.set(true);
    const formValue = this.shipmentForm.getRawValue();

    // poNumber is required by API (used for shipment number); use PO No. (fpoNo), else PI No., else generated default
    const poNumberValue =
      (formValue.fpoNo && String(formValue.fpoNo).trim()) ||
      (formValue.piNo && String(formValue.piNo).trim()) ||
      'PO-' + (formValue.purchaseDate ? new Date(formValue.purchaseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

    // Map form values to API payload structure
    const payload: CreateShipmentPayload = {
      poNumber: poNumberValue,
      year: new Date().getFullYear().toString(),
      orderDate: formValue.purchaseDate ? new Date(formValue.purchaseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0], // YYYY-MM-DD
      supplierName: formValue.supplier || '',
      supplierEmail: formValue.supplierEmail || '',
      itemCode: formValue.itemCode || '',
      itemDescription: formValue.itemDescription || '',
      commodity: formValue.commodity || '',
      countryOfOrigin: formValue.countryOfOrigin || '',
      brandName: formValue.brandName || '',
      barcode: formValue.barcode || '',
      dmBarcode: formValue.dmBarcode || '',
      variant: formValue.variant || '',
      hsCode: formValue.hsCode || '',
      packing: formValue.packagingType || '',
      portOfLoading: formValue.portOfLoading || '',
      portOfDischarge: formValue.portOfDischarge || '',
      plannedQtyMT: formValue.plannedContainers?.toString() || '0',
      estimatedContainerCount: formValue.noOfShipments?.toString() || '0',
      estimatedContainerSize: formValue.containerSize || '',
      plannedETD: formValue.expectedETD ? new Date(formValue.expectedETD).toISOString().split('T')[0] : '',
      plannedETA: formValue.expectedETA ? new Date(formValue.expectedETA).toISOString().split('T')[0] : '',
      piNo: formValue.piNo || '',
      piDate: formValue.piDate ? new Date(formValue.piDate).toISOString().split('T')[0] : '',
      fpoNo: formValue.fpoNo || '',
      fcl: formValue.fcl?.toString() || '0',
      pallet: formValue.pallet?.toString() || '0',
      bags: formValue.bags?.toString() || '0',
      fcPerUnit: formValue.fcPerUnit?.toString() || '0',
      totalFC: formValue.totalUSD?.toString() || '0',
      amountAED: formValue.totalAED?.toString() || '0',
      advanceAmount: formValue.advanceAmount || 0,
      totalAmount: formValue.totalUSD?.toString() || '0',
      incoterms: formValue.incoTerms || '',
      buyunit: formValue.buyingUnit || '',
      paymentTerms: formValue.paymentTerms || '',
      bankName: formValue.bankName || '',
      q1Report: JSON.stringify(this.extractedQ1Report() || {}),
      itemsJson: JSON.stringify(this.extractedItems()),
      splitContainers: formValue.noOfShipments?.toString() || '0',
      totalSplitQtyMT: formValue.noOfShipments?.toString() || '0'
    };

    const createFormData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        createFormData.append(key, String(value));
      }
    });

    const lpo = this.document1File();
    const s1 = this.s1QualityReportFile();
    if (lpo) createFormData.append('lpoDocument', lpo, lpo.name);
    if (this.document2File()) createFormData.append('proformaDocument', this.document2File()!, this.document2File()!.name);
    if (s1) createFormData.append('s1QualityReport', s1, s1.name);

    this.shipmentService.createShipment(createFormData).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: response.message || 'Shipment created successfully'
        });
        // Navigate to dashboard after 1 second
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 1000);
      },
      error: (error) => {
        this.submitting.set(false);
        console.error('Error creating shipment:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.error?.message || 'Failed to create shipment'
        });
      }
    });
  }
}
