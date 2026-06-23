const {
  Item,
  normalizeDpwCargoExtraction,
  parseJsonField,
  toDateOrNull,
  parseNum,
  normalizeCatalogKey,
} = require('./shipment.helper');

function mapPythonResponseToExtraction(pythonRes) {
  const out = {};
  if (!pythonRes || typeof pythonRes !== 'object') return out;

  const lpo = pythonRes.lpo_invoice || {};
  const sc = pythonRes.shipment_calculations || {};

  const getIndexedValue = (value, index) => {
    if (Array.isArray(value)) return value[index];
    return value;
  };

  const toContainerSizeValue = (value) => {
    if (value == null || value === '') return undefined;
    const size = String(value).trim().toLowerCase();
    if (size.startsWith('40')) return '40';
    if (size.startsWith('20')) return '20';
    return undefined;
  };

  const parsePackagingKg = (value) => {
    if (value == null || value === '') return undefined;
    const match = String(value).toUpperCase().match(/1X\s*(\d+(?:\.\d+)?)\s*KG/);
    if (!match) return undefined;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const allocateWholeUnits = (total, weights) => {
    const normalizedTotal = parseNum(total);
    if (normalizedTotal == null || normalizedTotal < 0) return [];

    const normalizedWeights = weights.map((weight) => (Number.isFinite(Number(weight)) ? Math.max(Number(weight), 0) : 0));
    const weightSum = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
    if (!weightSum) return [];

    const rawShares = normalizedWeights.map((weight) => (normalizedTotal * weight) / weightSum);
    const baseShares = rawShares.map((share) => Math.floor(share));
    let remainder = Math.round(normalizedTotal - baseShares.reduce((sum, share) => sum + share, 0));

    const byRemainder = rawShares
      .map((share, index) => ({ index, remainder: share - baseShares[index] }))
      .sort((a, b) => b.remainder - a.remainder);

    for (let i = 0; i < byRemainder.length && remainder > 0; i += 1) {
      baseShares[byRemainder[i].index] += 1;
      remainder -= 1;
    }

    return baseShares;
  };

  const normalizeItemShape = (itemLike, index = 0, options = {}) => {
    const item = itemLike || {};
    const itemCount = options.itemCount || 1;
    const allowScalarShipmentFallback = itemCount === 1;
    const line = {};

    const lineItemCode = item.item_code ?? item.itemCode ?? getIndexedValue(lpo.item_code, index);
    if (lineItemCode != null && lineItemCode !== '') line.itemCode = String(lineItemCode).trim();

    const lineDescription = item.item ?? item.description ?? item.itemDescription ?? getIndexedValue(lpo.item, index);
    if (lineDescription != null && lineDescription !== '') line.itemDescription = String(lineDescription).trim();

    const lineCommodity = item.commodity ?? getIndexedValue(lpo.commodity, index);
    if (lineCommodity != null && lineCommodity !== '') line.commodity = String(lineCommodity).trim();

    const lineCountry = item.country_of_origin ?? item.countryOfOrigin ?? getIndexedValue(lpo.country_of_origin, index);
    if (lineCountry != null && lineCountry !== '') line.countryOfOrigin = String(lineCountry).trim();

    const linePackaging = item.packaging ?? item.packing ?? getIndexedValue(lpo.packaging, index);
    if (linePackaging != null && linePackaging !== '') line.packagingType = String(linePackaging).trim();

    line.buyingUnit = 'MT';

    const lineQuantityMt = item.quantity_in_mt
      ?? item.quantityInMt
      ?? getIndexedValue(lpo.quantity_in_mt, index)
      ?? getIndexedValue(lpo.quantity, index);
    const parsedQtyMt = parseNum(lineQuantityMt);
    if (parsedQtyMt != null) {
      line.plannedContainers = parsedQtyMt;
    } else {
      const parsedBagQty = parseNum(item.quantity_in_bags ?? item.quantityInBags ?? getIndexedValue(lpo.quantity_in_bags, index));
      const packagingKg = parsePackagingKg(item.packaging ?? item.packing ?? getIndexedValue(lpo.packaging, index));
      if (parsedBagQty != null && packagingKg != null) {
        line.plannedContainers = Number(((parsedBagQty * packagingKg) / 1000).toFixed(2));
      } else if (allowScalarShipmentFallback) {
        const fallbackQtyMt = parseNum(getIndexedValue(sc.quantity_in_mt, index));
        if (fallbackQtyMt != null) line.plannedContainers = fallbackQtyMt;
      }
    }

    const lineFcl = item.fcl ?? (allowScalarShipmentFallback ? getIndexedValue(sc.fcl, index) : undefined);
    const parsedFcl = parseNum(lineFcl);
    if (parsedFcl != null) line.fcl = parsedFcl;

    const linePallet = item.pallets ?? item.pallet ?? (allowScalarShipmentFallback ? getIndexedValue(sc.pallets, index) : undefined);
    const parsedPallet = parseNum(linePallet);
    if (parsedPallet != null) line.pallet = parsedPallet;

    const lineBags = item.bags ?? item.quantity_in_bags ?? item.quantityInBags ?? getIndexedValue(sc.bags, index) ?? getIndexedValue(lpo.quantity_in_bags, index);
    const parsedBags = parseNum(lineBags);
    if (parsedBags != null) line.bags = parsedBags;

    const lineFclPerUnit = item.fcl_per_unit ?? item.fclPerUnit ?? (allowScalarShipmentFallback ? getIndexedValue(sc.fcl_per_unit, index) : undefined);
    const parsedFclPerUnit = parseNum(lineFclPerUnit);
    if (parsedFclPerUnit != null) line.fclPerUnit = parsedFclPerUnit;

    const linePrice = item.price_per_mt
      ?? item.pricePerMt
      ?? item.unit_price
      ?? item.unitPrice
      ?? item.unit
      ?? (allowScalarShipmentFallback ? getIndexedValue(sc.price_per_mt, index) : undefined)
      ?? getIndexedValue(lpo.price_per_mt, index);
    const parsedPrice = parseNum(linePrice);
    if (parsedPrice != null) line.fcPerUnit = parsedPrice;

    const lineTotal = item.total_amount ?? item.totalAmount ?? item.total_price ?? item.totalPrice ?? item.price ?? getIndexedValue(lpo.total_amount, index);
    const parsedTotal = parseNum(lineTotal);
    if (parsedTotal != null) {
      line.totalUSD = parsedTotal;
      line.totalAED = Math.round(parsedTotal * 3.67 * 100) / 100;
    }

    const lineContainerSize = toContainerSizeValue(item.container_size ?? item.containerSize ?? getIndexedValue(sc.container_size, index));
    if (lineContainerSize) line.containerSize = lineContainerSize;

    const lineNo = parseNum(item.line_no ?? item.lineNo ?? item.s_no ?? index + 1);
    if (lineNo != null) line.lineNo = lineNo;

    return line;
  };

  const inferItemsFromArrays = () => {
    const candidateFields = [
      lpo.item_code,
      lpo.item,
      lpo.commodity,
      lpo.packaging,
      lpo.buying_unit,
      lpo.unit,
      lpo.quantity_in_mt,
      lpo.quantity_in_bags,
      lpo.price_per_mt,
      lpo.total_amount,
      sc.quantity_in_mt,
      sc.fcl,
      sc.pallets,
      sc.bags,
      sc.fcl_per_unit,
      sc.price_per_mt,
      sc.container_size,
    ];

    const inferredLength = candidateFields.reduce((max, value) => (Array.isArray(value) ? Math.max(max, value.length) : max), 0);
    if (!inferredLength) return [];

    return Array.from({ length: inferredLength }, (_, index) => normalizeItemShape({}, index, { itemCount: inferredLength }));
  };

  if (lpo.po_number != null && lpo.po_number !== '') out.fpoNo = String(lpo.po_number).trim();
  if (lpo.po_date != null && lpo.po_date !== '') out.purchaseDate = String(lpo.po_date).trim();
  if (lpo.pi_number != null && lpo.pi_number !== '') out.piNo = String(lpo.pi_number).trim();
  if (lpo.pi_date != null && lpo.pi_date !== '') out.piDate = String(lpo.pi_date).trim();
  if (lpo.inco_terms != null && lpo.inco_terms !== '') out.incoTerms = String(lpo.inco_terms).trim();
  if (lpo.port_of_loading != null && lpo.port_of_loading !== '') out.portOfLoading = String(lpo.port_of_loading).trim();
  if (lpo.port_of_discharge != null && lpo.port_of_discharge !== '') out.portOfDischarge = String(lpo.port_of_discharge).trim();
  if (lpo.commodity != null && lpo.commodity !== '') out.commodity = String(lpo.commodity).trim();
  const itemDesc = lpo.item ?? '';
  if (itemDesc !== '') out.itemDescription = String(itemDesc).trim();

  const supplierName = lpo.vendor ?? '';
  if (supplierName !== '') out.supplierName = String(supplierName).trim();

  if (lpo.payment_terms != null && lpo.payment_terms !== '') out.paymentTerms = String(lpo.payment_terms).trim();

  if (sc && typeof sc === 'object') {
    if (!Array.isArray(sc.quantity_in_mt) && sc.quantity_in_mt != null) out.plannedContainers = Number(sc.quantity_in_mt);
    if (!Array.isArray(sc.fcl) && sc.fcl != null) out.fcl = Number(sc.fcl);
    if (!Array.isArray(sc.pallets) && sc.pallets != null) out.pallet = Number(sc.pallets);
    if (!Array.isArray(sc.bags) && sc.bags != null) out.bags = Number(sc.bags);
    if (!Array.isArray(sc.fcl_per_unit) && sc.fcl_per_unit != null) out.fclPerUnit = Number(sc.fcl_per_unit);
    if (!Array.isArray(sc.container_size)) {
      const size = toContainerSizeValue(sc.container_size);
      if (size) out.containerSize = size;
    }
    out.shipmentCalculations = {
      fcl: !Array.isArray(sc.fcl) && sc.fcl != null ? Number(sc.fcl) : undefined,
      bags: !Array.isArray(sc.bags) && sc.bags != null ? Number(sc.bags) : undefined,
      quantity_in_mt: !Array.isArray(sc.quantity_in_mt) && sc.quantity_in_mt != null ? Number(sc.quantity_in_mt) : undefined,
      container_size: !Array.isArray(sc.container_size) && sc.container_size != null ? String(sc.container_size) : undefined,
      bags_per_container: !Array.isArray(sc.bags_per_container) && sc.bags_per_container != null ? Number(sc.bags_per_container) : undefined,
      fcl_per_unit: !Array.isArray(sc.fcl_per_unit) && sc.fcl_per_unit != null ? Number(sc.fcl_per_unit) : undefined,
      pallets: !Array.isArray(sc.pallets) && sc.pallets != null ? Number(sc.pallets) : undefined,
      price_per_mt: !Array.isArray(sc.price_per_mt) && sc.price_per_mt != null ? Number(sc.price_per_mt) : undefined,
      is_price_matching: sc.is_price_matching === true,
      lpo_price_per_mt: !Array.isArray(sc.lpo_price_per_mt) && sc.lpo_price_per_mt != null ? Number(sc.lpo_price_per_mt) : undefined,
      pi_price_per_mt: !Array.isArray(sc.pi_price_per_mt) && sc.pi_price_per_mt != null ? Number(sc.pi_price_per_mt) : undefined,
      mt_variation: !Array.isArray(sc.mt_variation) && sc.mt_variation != null ? Number(sc.mt_variation) : undefined,
      diff_percent: !Array.isArray(sc.diff_percent) && sc.diff_percent != null ? Number(sc.diff_percent) : undefined
    };
  }

  const itemCount = Array.isArray(lpo.items) ? lpo.items.length : 0;
  const rawItems = Array.isArray(lpo.items)
    ? lpo.items.map((item, index) => normalizeItemShape(item, index, { itemCount }))
    : inferItemsFromArrays();

  if (rawItems.length > 1) {
    const itemWeights = rawItems.map((item) => item.plannedContainers || 0);

    if (rawItems.some((item) => item.fcl == null)) {
      const allocatedFcl = allocateWholeUnits(sc.fcl, itemWeights);
      if (allocatedFcl.length === rawItems.length) {
        rawItems.forEach((item, index) => {
          if (item.fcl == null) item.fcl = allocatedFcl[index];
        });
      }
    }

    if (rawItems.some((item) => item.pallet == null)) {
      const allocatedPallet = allocateWholeUnits(sc.pallets, itemWeights);
      if (allocatedPallet.length === rawItems.length) {
        rawItems.forEach((item, index) => {
          if (item.pallet == null) item.pallet = allocatedPallet[index];
        });
      }
    }

    rawItems.forEach((item) => {
      if ((item.fclPerUnit == null || item.fclPerUnit === 0) && item.fcl && item.totalUSD) {
        item.fclPerUnit = Number((item.totalUSD / item.fcl).toFixed(2));
      }
    });
  }
  out.items = (rawItems.length ? rawItems : [normalizeItemShape({}, 0)]).map((item, index) => ({
    lineNo: item.lineNo ?? index + 1,
    ...item,
  }));

  const firstItem = out.items[0] || {};
  if (firstItem.itemCode) out.itemCode = firstItem.itemCode;
  if (firstItem.itemDescription) out.itemDescription = firstItem.itemDescription;
  if (firstItem.commodity) out.commodity = firstItem.commodity;
  if (firstItem.countryOfOrigin) out.countryOfOrigin = firstItem.countryOfOrigin;
  if (firstItem.packagingType) out.packagingType = firstItem.packagingType;
  if (firstItem.plannedContainers != null) out.plannedContainers = firstItem.plannedContainers;
  if (firstItem.buyingUnit) out.buyingUnit = firstItem.buyingUnit;
  if (firstItem.fcPerUnit != null) out.fcPerUnit = firstItem.fcPerUnit;
  if (firstItem.totalUSD != null) out.totalUSD = firstItem.totalUSD;
  if (firstItem.totalAED != null) out.totalAED = firstItem.totalAED;
  if (firstItem.fcl != null) out.fcl = firstItem.fcl;
  if (firstItem.pallet != null) out.pallet = firstItem.pallet;
  if (firstItem.bags != null) out.bags = firstItem.bags;
  if (firstItem.fclPerUnit != null) out.fclPerUnit = firstItem.fclPerUnit;
  if (firstItem.containerSize) out.containerSize = firstItem.containerSize;

  if (pythonRes.s1_quality_report && typeof pythonRes.s1_quality_report === 'object') {
    out.q1Report = pythonRes.s1_quality_report;
  }

  return out;
}

async function enrichExtractionItemsFromCatalog(data) {
  if (!data || !Array.isArray(data.items) || !data.items.length) return data;

  const rawItemCodes = [...new Set(data.items.map((item) => String(item?.itemCode || '').trim()).filter(Boolean))];
  if (!rawItemCodes.length) return data;

  const catalogItems = await Item.find({ itemCode: { $in: rawItemCodes } }).lean();
  const catalogByCode = new Map(catalogItems.map((item) => [normalizeCatalogKey(item.itemCode), item]));

  data.items = data.items.map((item) => {
    const catalogItem = catalogByCode.get(normalizeCatalogKey(item?.itemCode));
    if (!catalogItem) return item;

    return {
      ...item,
      countryOfOrigin: item.countryOfOrigin || catalogItem.countryOfOrigin || '',
      brandName: item.brandName || catalogItem.brand || catalogItem.riceName || '',
      barcode: item.barcode || catalogItem.barcode || '',
      dmBarcode: item.dmBarcode || catalogItem.dmBarcode || '',
      variant: item.variant || catalogItem.variant || '',
      hsCode: item.hsCode || catalogItem.hsCode || '',
      packagingType: item.packagingType || catalogItem.packing || '',
      buyingUnit: item.buyingUnit || 'MT',
    };
  });

  const firstItem = data.items[0] || {};
  if (firstItem.countryOfOrigin && !data.countryOfOrigin) data.countryOfOrigin = firstItem.countryOfOrigin;
  if (firstItem.brandName && !data.brandName) data.brandName = firstItem.brandName;
  if (firstItem.barcode && !data.barcode) data.barcode = firstItem.barcode;
  if (firstItem.variant && !data.variant) data.variant = firstItem.variant;
  if (firstItem.hsCode && !data.hsCode) data.hsCode = firstItem.hsCode;
  if (firstItem.packagingType && !data.packagingType) data.packagingType = firstItem.packagingType;
  if (!data.buyingUnit) data.buyingUnit = firstItem.buyingUnit || 'MT';

  return data;
}

exports.extractFromDocuments = async (req, res) => {
  try {
    const files = req.files;
    if (!files?.document1?.[0] || !files?.s1QualityReport?.[0]) {
      return res.status(400).json({
        message: 'Purchase order (document1) and S1 Quality Report (s1QualityReport) are required'
      });
    }

    const pythonUrl = process.env.PYTHON_EXTRACTION_API_URL || 'http://localhost:8096';
    const endpoint = `${pythonUrl.replace(/\/$/, '')}/shipment-form`;
    const incoTermsList = process.env.PYTHON_INCO_TERMS_LIST || 'CIF,FOB,EXWORKS';
    const suppliersList = process.env.PYTHON_SUPPLIERS_LIST || '';

    const lpoFile = files.document1[0];
    const qualityFile = files.s1QualityReport[0];

    const FormData = globalThis.FormData;
    const form = new FormData();
    const lpoBlob = new Blob([lpoFile.buffer], { type: lpoFile.mimetype || 'application/octet-stream' });
    const qualityBlob = new Blob([qualityFile.buffer], { type: qualityFile.mimetype || 'application/octet-stream' });
    form.append('lpo_invoice', lpoBlob, lpoFile.originalname || 'lpo.pdf');
    form.append('rice_quality_report', qualityBlob, qualityFile.originalname || 'quality-report.pdf');
    form.append('inco_terms_list', incoTermsList);
    form.append('suppliers', suppliersList);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { detail: errText }; }
      return res.status(response.status).json({
        message: errJson.detail || errJson.message || `Python extraction service returned ${response.status}`,
        error: errJson
      });
    }

    const pythonRes = await response.json();
    const data = await enrichExtractionItemsFromCatalog(mapPythonResponseToExtraction(pythonRes));

    return res.status(200).json({
      message: 'Data extracted successfully',
      data: data || {}
    });
  } catch (err) {
    console.error('Extract from documents error:', err);
    const isNetwork = err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED';
    return res.status(500).json({
      message: isNetwork
        ? 'Extraction service unavailable. Check PYTHON_EXTRACTION_API_URL and that the Python service is running.'
        : (err.message || 'Server error'),
      error: err.message
    });
  }
};

exports.extractBillNo = async (req, res) => {
  try {
    const files = req.files || {};
    const blFile = files.file?.[0];
    const pkgFile = files.packaging_list_file?.[0];
    const packagingBrand = req.body.packaging_brand || '';

    if (!blFile) {
      return res.status(400).json({ message: 'Bill of Lading file is required' });
    }

    const baseUrl = (process.env.PYTHON_EXTRACTION_API_URL || 'http://localhost:8096').replace(/\/$/, '');
    const endpoint = `${baseUrl}/purchase-tracker/fetch-details`;

    const FormData = globalThis.FormData;
    const form = new FormData();
    
    const blBlob = new Blob([blFile.buffer], { type: blFile.mimetype || 'application/octet-stream' });
    form.append('file', blBlob, blFile.originalname || 'document');
    
    if (pkgFile) {
      const pkgBlob = new Blob([pkgFile.buffer], { type: pkgFile.mimetype || 'application/octet-stream' });
      form.append('packaging_list_file', pkgBlob, pkgFile.originalname || 'packaging_list');
    }
    
    if (packagingBrand) {
      form.append('packaging_brand', packagingBrand);
    }

    console.log("Calling extraction endpoint:", endpoint);
    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { detail: errText }; }
      return res.status(response.status).json({
        message: errJson.detail || errJson.message || `Extraction service returned ${response.status}`,
        error: errJson
      });
    }

    const pythonRes = await response.json();
    
    return res.status(200).json({
      bill_extracted_data: pythonRes.bill_extracted_data || pythonRes.bill_no_data || {},
      packaging_list: pythonRes.packaging_list || {},
      bill_no: pythonRes.bill_extracted_data?.bill_no || '',
      invoice_number: pythonRes.bill_extracted_data?.invoice_number || '',
      metadata: pythonRes.metadata,
      ...pythonRes
    });
  } catch (err) {
    console.error('Extract bill no error:', err);
    const isNetwork = err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED';
    return res.status(500).json({
      message: isNetwork
        ? 'Bill-no extraction service unavailable. Check PYTHON_BILLNO_API_URL/PYTHON_EXTRACTION_API_URL and that the Python service is running.'
        : (err.message || 'Server error'),
      error: err.message
    });
  }
};

exports.extractArrivalNotice = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const baseUrl = (process.env.PYTHON_EXTRACTION_API_URL || 'http://localhost:8096').replace(/\/$/, '');
    const endpoint = `${baseUrl}/arrival-notice/extract`;
    const FormData = globalThis.FormData;
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'application/octet-stream' });
    form.append('file', blob, req.file.originalname || 'arrival-notice');

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { detail: errText }; }
      return res.status(response.status).json({
        message: errJson.detail || errJson.message || `Arrival notice extraction service returned ${response.status}`,
        error: errJson
      });
    }

    const pythonRes = await response.json();
    const rawDays = pythonRes?.free_retension_days ?? pythonRes?.free_retention_days ?? '';
    const freeRetentionDays = Number.parseInt(String(rawDays).match(/\d+/)?.[0] || '0', 10) || 0;

    return res.status(200).json({
      print_date: pythonRes?.print_date || null,
      arrival_on: pythonRes?.arrival_on || null,
      free_retension_days: freeRetentionDays,
      metadata: pythonRes?.metadata || null,
    });
  } catch (err) {
    console.error('Extract arrival notice error:', err);
    const isNetwork = err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED';
    return res.status(500).json({
      message: isNetwork
        ? 'Arrival notice extraction service unavailable. Check PYTHON_EXTRACTION_API_URL and that the Python service is running.'
        : (err.message || 'Server error'),
      error: err.message
    });
  }
};

exports.extractDpwCargo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: 'File is required',
        ...normalizeDpwCargoExtraction({}, 'File is required'),
      });
    }

    const baseUrl = (process.env.PYTHON_EXTRACTION_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    const endpoint = `${baseUrl}/dpw-cargo-extractor`;
    const FormData = globalThis.FormData;
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'application/octet-stream' });
    form.append('file', blob, req.file.originalname || 'dpw-cargo-receipt');
    if (process.env.DPW_CARGO_MAX_PAGES) {
      form.append('max_pages', String(process.env.DPW_CARGO_MAX_PAGES));
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { detail: errText }; }
      const message = errJson.detail || errJson.message || errJson.error || `Cargo extraction service returned ${response.status}`;
      return res.status(response.status).json({
        message,
        ...normalizeDpwCargoExtraction(errJson, message),
        serviceError: errJson,
      });
    }

    const pythonRes = await response.json();
    return res.status(200).json(normalizeDpwCargoExtraction(pythonRes));
  } catch (err) {
    console.error('Extract DPW cargo error:', err);
    const isNetwork = err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED';
    const message = isNetwork
      ? 'Cargo extraction service unavailable. Check PYTHON_EXTRACTION_API_URL and that the Python service is running.'
      : (err.message || 'Server error');
    return res.status(500).json({
      message,
      ...normalizeDpwCargoExtraction({}, message),
    });
  }
};
