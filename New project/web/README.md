# Shipment Tracker – Frontend

Angular web application for the Shipment Tracker: create shipments, manage planned/actual containers, documentation, clearing, and GRN.

## Tech Stack

- **Angular** 21
- **PrimeNG** 21 (UI components)
- **Tailwind CSS** 4
- **NgRx** (Store, Effects, Router Store)
- **RxJS** 7.8
- **TypeScript** 5.9

## Prerequisites

- Node.js 18+ (recommended: 20+)
- npm 10.x (or use the project’s `packageManager`)

## Setup

```bash
npm install
```

## Development

```bash
npm start
```

Runs the app at **http://localhost:4200**. The app uses `environment.apiUrl` (see **Environment** below) for API calls.

## Build

```bash
npm run build
```

Production build output is in `dist/`.

## Environment

- **`src/environments/environment.ts`** – development (default `apiUrl: 'http://localhost:5000/api/v1'`)
- **`src/environments/environment.prod.ts`** – production (set your backend URL)

Ensure the backend is running and reachable at the configured `apiUrl`.

## Project Structure (high level)

- **`src/app/core/`** – models, services, interceptors (e.g. API base URL)
- **`src/app/features/shipment/`** – shipment feature:
  - **Create Shipment** – new shipment form; document upload + extract & autopopulate from PI/PO
  - **Shipment Form** – multi-step form (Planned → Actual → Document Tracker → Shipment Clearing → Clearance Paid → Clearance Final → GRN)
- **`src/app/store/shipment/`** – NgRx state, actions, effects, selectors for shipment
- **`src/app/shared/`** – shared directives/components
- **`src/environments/`** – `apiUrl` and other env config

## Main Features

- **Auth** – login; role-based access (Purchase, FAS, Logistic, Admin)
- **Create Shipment** – form with optional PI/PO upload and “Extract & autopopulate” (calls backend extraction API)
- **Shipment list & detail** – list shipments, open shipment and go through steps
- **Step 2 – Shipment Tracker** – planned containers, actual containers (with BL No extraction from document)
- **Step 3 – Document Tracker** – B/L No, Courier Track #, document dates, Bank Advance documents (upload + preview)
- **Step 4 – Shipment Clearing Tracker** – delivery order/token/transport/customs/municipality docs + dates, delivery schedule, warehouse rows
- **Steps 5–7** – clearance payment, clearance final, GRN

## API Integration

All HTTP calls go through `ShipmentService` and an HTTP interceptor that prefixes relative URLs with `environment.apiUrl`. Endpoints used include:

- `GET/POST /shipment` – list, create
- `GET /shipment/:id` – detail
- `POST /shipment/extract-documents` – extract from PI/PO (Create Shipment)
- `POST /shipment/extract-bill-no` – extract BL No from document
- `POST /shipment/container/planned` – planned containers
- `PATCH /shipment/container/actual/:id` – actual container
- `PATCH /shipment/container/payment/:id` – Step 3 documentation
- `PATCH /shipment/container/logistic/:id` – Step 4 logistics/clearing
- Plus clearance payment, clearance, GRN endpoints

## Tests

```bash
npm test
```

(Uses Vitest as per project config.)

## License

Private / internal use.
