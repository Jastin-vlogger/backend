# Python Extraction API Integration

The backend calls the Python extraction service to extract shipment form data from uploaded documents.

## Python API

- **URL:** Configurable via `PYTHON_EXTRACTION_API_URL` (default: `http://localhost:8096`). Full endpoint: `{base}/shipment-form`.
- **Docs:** e.g. `http://localhost:8096/docs#/extraction/shipment_form_shipment_form_post`

## Request (from Node to Python)

- **Method:** `POST`
- **Content-Type:** `multipart/form-data`
- **Body keys:**
  - `lpo_invoice` — file (Purchase order). From frontend: `document1`.
  - `rice_quality_report` — file (S1 Quality Report). From frontend: `s1QualityReport`.
  - `inco_terms_list` — string, e.g. `CIF,FOB,EXWORKS` (from `PYTHON_INCO_TERMS_LIST`).
  - `suppliers` — string, comma-separated supplier names (from `PYTHON_SUPPLIERS_LIST`).

Example curl:

```bash
curl -X 'POST' \
  'http://localhost:8096/shipment-form' \
  -H 'accept: application/json' \
  -H 'Content-Type: multipart/form-data' \
  -F 'lpo_invoice=@lpo.pdf;type=application/pdf' \
  -F 'rice_quality_report=@quality.pdf;type=application/pdf' \
  -F 'inco_terms_list=CIF,FOB,EXWORKS' \
  -F 'suppliers=LEKH RAJ,M RAHEEM RICE PROCESSING MILLS'
```

## Response (Python → Node)

JSON with `lpo_invoice`, `shipment_calculations`, `s1_quality_report`, and `metadata`:

```json
{
  "lpo_invoice": {
    "po_number": "P001/26/00635",
    "po_date": "2026-03-03",
    "vendor": "LEKH RAJ NARINDER KUMAR",
    "item_code": "1-RH1-01B-0056",
    "commodity": "Rice",
    "item": "Goldasteh Long Grain Sella Rice 1718 - 10 Kg",
    "quantity": "48,000.00",
    "unit": "9.80",
    "price": "470,400.00"
  },
  "metadata": {
    "input_tokens": 4342,
    "output_tokens": 310,
    "total_tokens": 4652,
    "cost_incurred": 0.013955,
    "cost_currency": "USD",
    "latency_ms": 11917.14,
    "model": "gpt-4o"
  }
}
```

The Node controller maps this into the frontend shape (see `mapPythonResponseToExtraction` in `src/controller/shipment.controller.js` and `EXTRACTION_RESPONSE_SCHEMA.md`). All keys are optional; missing values are left empty.

## Env vars

| Variable | Description | Default |
|----------|-------------|---------|
| `PYTHON_EXTRACTION_API_URL` | Base URL of Python service | `http://localhost:8096` |
| `PYTHON_INCO_TERMS_LIST` | Comma-separated inco terms sent to Python | `CIF,FOB,EXWORKS` |
| `PYTHON_SUPPLIERS_LIST` | Comma-separated supplier names for Python | (empty) |

When the Python service is deployed, set `PYTHON_EXTRACTION_API_URL` to the deployed base URL (e.g. `https://extraction.example.com`).
