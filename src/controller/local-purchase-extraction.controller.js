// Local Purchase — extraction. Local Purchase entries upload BOTH an LPO and an S1 Quality
// Report at creation (same document pair as the regular Shipment flow), so this reuses the
// Python service's real, already-working /shipment-form endpoint unmodified — no new Python
// route needed, and zero risk to that shared endpoint's existing behavior. Only the response
// mapping here is independent (a lean, Local-Purchase-specific subset of fields, not the full
// multi-line-item shipment mapper).
const mapPythonShipmentFormResponse = (pythonRes) => {
  if (!pythonRes || typeof pythonRes !== 'object') return {};
  const lpo = pythonRes.lpo_invoice || {};

  // lpo_invoice fields can be scalar (single-item LPO) or arrays (multi-item) — take index 0
  // either way, matching the pattern used by the real shipment extraction mapper.
  const first = (value) => (Array.isArray(value) ? value[0] : value);
  const asString = (value) => {
    const v = first(value);
    return v != null && v !== '' ? String(v).trim() : '';
  };
  const asNumber = (value) => {
    const v = first(value);
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    supplierName: asString(lpo.vendor),
    itemDescription: asString(lpo.item ?? lpo.description),
    commodity: asString(lpo.commodity),
    countryOfOrigin: asString(lpo.country_of_origin),
    plannedQtyMT: asNumber(lpo.quantity_in_mt),
    fcPerUnit: asNumber(lpo.price_per_mt),
    totalFC: asNumber(lpo.total_amount),
  };
};

exports.extractLocalPurchaseLpo = async (req, res) => {
  try {
    const lpoFile = req.files?.lpoDocument?.[0];
    const s1File = req.files?.s1QualityReport?.[0];
    if (!lpoFile || !s1File) {
      return res.status(400).json({ message: 'Both lpoDocument and s1QualityReport are required for extraction.' });
    }

    const pythonUrl = process.env.PYTHON_EXTRACTION_API_URL || 'http://localhost:8096';
    const endpoint = `${pythonUrl.replace(/\/$/, '')}/shipment-form`;
    const incoTermsList = process.env.PYTHON_INCO_TERMS_LIST || 'CIF,FOB,EXWORKS';
    const suppliersList = process.env.PYTHON_SUPPLIERS_LIST || '';

    const FormData = globalThis.FormData;
    const form = new FormData();
    const lpoBlob = new Blob([lpoFile.buffer], { type: lpoFile.mimetype || 'application/octet-stream' });
    const s1Blob = new Blob([s1File.buffer], { type: s1File.mimetype || 'application/octet-stream' });
    form.append('lpo_invoice', lpoBlob, lpoFile.originalname || 'lpo.pdf');
    form.append('rice_quality_report', s1Blob, s1File.originalname || 'quality-report.pdf');
    form.append('inco_terms_list', incoTermsList);
    form.append('suppliers', suppliersList);

    const response = await fetch(endpoint, { method: 'POST', body: form });

    if (!response.ok) {
      const errText = await response.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { detail: errText }; }
      return res.status(response.status).json({
        message: errJson.detail || errJson.message || `Python extraction service returned ${response.status}`,
        error: errJson,
      });
    }

    const pythonRes = await response.json();
    const data = mapPythonShipmentFormResponse(pythonRes);

    return res.status(200).json({ message: 'Data extracted successfully', data });
  } catch (err) {
    console.error('Extract local purchase LPO error:', err);
    const isNetwork = err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED';
    return res.status(500).json({
      message: isNetwork
        ? 'Extraction service unavailable. Check PYTHON_EXTRACTION_API_URL and that the Python service is running.'
        : (err.message || 'Server error'),
      error: err.message,
    });
  }
};
