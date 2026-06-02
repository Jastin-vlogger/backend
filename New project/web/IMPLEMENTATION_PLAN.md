# Create Shipment – Implementation Plan

> **Purpose:** Living plan for the Create Shipment flow (`/shipments/create`). Update this document as requirements change.

---

## 1. Scope

- **Route:** `http://localhost:4200/shipments/create`
- **Goal:** Allow users to create a shipment, optionally by uploading documents (e.g. PI, PO) and extracting data to autopopulate the form.

---

## 2. Current State (Done)

| # | Item | Status |
|---|------|--------|
| 2.1 | Two file inputs in a row above PI No / PI Date (Document 1 e.g. PI, Document 2 e.g. PO) | ✅ Done |
| 2.2 | “Extract & autopopulate” button (enabled only when both files selected) | ✅ Done |
| 2.3 | API call to `POST /api/v1/shipment/extract-documents` with `FormData` (`document1`, `document2`) | ✅ Done |
| 2.4 | Success/error toasts and loading state (“Extracting…”) | ✅ Done |
| 2.5 | Response type `ExtractShipmentFromDocumentsResponse` and service method `extractShipmentFromDocuments()` | ✅ Done |

---

## 3. Backlog (To Do / TBD)

### 3.1 Backend / API

| # | Item | Notes |
|---|------|--------|
| 3.1.1 | Clone or implement backend API for document extraction | Endpoint: `POST /api/v1/shipment/extract-documents` |
| 3.1.2 | Define API request: `multipart/form-data` with `document1`, `document2` | |
| 3.1.3 | Define API response shape (field names matching form controls for autopopulate) | e.g. `piNo`, `piDate`, `fpoNo`, `commodity`, etc. |
| 3.1.4 | Document supported file types and size limits | |

### 3.2 Frontend – Autopopulate

| # | Item | Notes |
|---|------|--------|
| 3.2.1 | Map API response `data` to form and call `shipmentForm.patchValue(...)` | After response contract is fixed |
| 3.2.2 | Handle date fields (e.g. `piDate`, `purchaseDate`, `expectedETD`, `expectedETA`) if API returns strings | Parse and set as Date or string per form control type |
| 3.2.3 | Handle dropdowns (e.g. item, supplier, incoTerms, commodity) – match by ID or by display value | Depends on API response shape |
| 3.2.4 | Decide behavior when only partial data is extracted (e.g. show which fields were filled) | Optional UX |

### 3.3 Frontend – UX / Validation

| # | Item | Notes |
|---|------|--------|
| 3.3.1 | File type validation (client-side) | Already accept `.pdf,.doc,.docx,.jpg,.jpeg,.png` |
| 3.3.2 | File size limits (if required) | |
| 3.3.3 | Clear file inputs after successful extract (optional) | |
| 3.3.4 | Accessibility and labels for file inputs | |
| 3.3.5 | Error handling when API is down or returns 4xx/5xx | Already show toast; refine messages if needed |

### 3.4 Other

| # | Item | Notes |
|---|------|--------|
| 3.4.1 | Rename “Document 1” / “Document 2” to specific names (e.g. “PI Document”, “PO Document”) if required | |
| 3.4.2 | Allow single-file extract (e.g. only Document 1) if requirement changes | Would require API and button logic change |
| 3.4.3 | Tests (unit / e2e) for create shipment and extract flow | |

---

## 4. API Contract (Draft)

Update this when the backend is defined.

### Request

- **Method:** `POST`
- **URL:** `{apiUrl}/shipment/extract-documents`  
  (e.g. `http://api.shipmenttracker.rhutility.com:5000/api/v1/shipment/extract-documents`)
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `document1`: File (PI or similar)
  - `document2`: File (PO or similar)

### Response (to be confirmed)

```json
{
  "message": "Extraction successful",
  "data": {
    "piNo": "string",
    "piDate": "YYYY-MM-DD or ISO",
    "fpoNo": "string",
    "purchaseDate": "YYYY-MM-DD or ISO",
    "commodity": "string",
    "portOfLoading": "string",
    "portOfDischarge": "string",
    "item": "itemId or null",
    "supplier": "supplierId or null",
    "incoTerms": "string",
    "brandName": "string",
    "itemDescription": "string",
    "countryOfOrigin": "string",
    "containerSize": "string",
    "buyingUnit": "string",
    "paymentTerms": "string",
    "fcPerUnit": "number",
    "advanceAmount": "number",
    "expectedETD": "date",
    "expectedETA": "date"
  }
}
```

Form control names in `CreateShipmentComponent` should align with `data` keys for straightforward `patchValue(response.data)`.

---

## 5. Changelog

| Date | Change |
|------|--------|
| (Initial) | Plan created; current state and backlog for create shipment + extract flow documented. |

---

*Update this plan as requirements evolve. When an item is done, move it to §2 Current State and add a short note in §5 Changelog.*
