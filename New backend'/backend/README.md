# Shipment Tracker – Backend

Node.js/Express API for the Shipment Tracker: shipments, containers (planned/actual), documentation, logistics, clearance, and GRN. Integrates with MongoDB and an optional Python extraction service for document parsing.

## Tech Stack

- **Node.js** (Express 5)
- **MongoDB** (Mongoose 9)
- **JWT** (jsonwebtoken) for auth
- **Multer** for file uploads (e.g. PI/PO, BL No extraction)
- **dotenv** for environment config

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- (Optional) Python extraction service for “Extract & autopopulate” and BL No extraction

## Setup

```bash
npm install
```

Create a **`.env`** file in the project root (see **Environment variables** below).

## Run

```bash
npm start
```

Runs the server on **http://localhost:5000** (or `PORT` from `.env`).

Development with auto-reload:

```bash
npm run dev
```

(Uses `nodemon`.)

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://user:pass@host/dbname` |
| `JWT_SECRET` | Secret for signing JWT | (any string) |
| `PYTHON_EXTRACTION_API_URL` | Base URL of Python extraction service | `http://localhost:8096` |
| `FRONTEND_ORIGIN` | Allowed CORS origin(s), comma-separated | `http://localhost:4200` |

- **Auth**: Login returns a JWT; protected routes use `authMiddleware` and optional `authorize(roles)`.
- **Python service**: Used for `POST /api/v1/shipment/extract-documents` (PI/PO → autopopulate) and `POST /api/v1/shipment/extract-bill-no` (single file → BL No). If not running, those endpoints will fail; other APIs work without it.

## API base

All shipment-related routes are under **`/api/v1/shipment`**.

### Auth

- `POST /api/v1/auth/login` – login (returns JWT). Include `Authorization: Bearer <token>` for protected routes.

### Shipments

- `GET /api/v1/shipment` – list shipments (paginated)
- `GET /api/v1/shipment/dashboard` – summary
- `GET /api/v1/shipment/:id` – shipment detail (with planned/actual containers)
- `POST /api/v1/shipment/create` – create shipment (Purchase/Admin)

### Document extraction (optional Python service)

- `POST /api/v1/shipment/extract-documents` – `multipart/form-data`: `document1` (LPO), `document2` (PI). Returns mapped data for Create Shipment autopopulate and `shipment_calculations` (FCL, bags, pallets, price mismatch, etc.).
- `POST /api/v1/shipment/extract-bill-no` – `multipart/form-data`: `file` (PDF/image). Returns extracted bill number for Step 2 Actual BL No.

### Containers (per shipment)

- `POST /api/v1/shipment/container/planned` – create/replace planned containers (Purchase/Admin)
- `PATCH /api/v1/shipment/container/actual/:id` – add/update actual container (qtyMT, bags, BLNo, dates, etc.) (Purchase/Admin)
- `PATCH /api/v1/shipment/container/payment/:id` – Step 3 documentation (B/L No, DHL, dates, document URLs) (FAS/Admin)
- `PATCH /api/v1/shipment/container/logistic/:id` – Step 4 shipment clearing (doc URLs + dates, delivery schedule, warehouse schedule) (Logistic/Admin)
- `PATCH /api/v1/shipment/container/clearence-payment/:id` – Step 5 clearance payment (FAS/Admin)
- `PATCH /api/v1/shipment/container/clearance/:id` – Step 6 clearance final (Logistic/Admin)
- `PATCH /api/v1/shipment/container/grn/:id` – Step 7 GRN (Purchase/Admin)

Document URL fields (e.g. Step 3 and Step 4) are stored as strings; ready for future S3 integration.

## Project structure (high level)

- **`src/server.js`** – entry point; connects DB, starts app
- **`src/app.js`** – Express app, CORS, body-parser, route mounting
- **`src/config/`** – DB connection, first-admin creation
- **`src/controller/shipment.controller.js`** – shipment + container + extraction logic
- **`src/routes/`** – auth, supplier, item, shipment
- **`src/models/`** – Mongoose schemas (Shipment, Container, User, etc.)
- **`src/core/`** – auth middleware, authorize, audit logging

## Roles

- **Purchase** – create shipment, planned/actual, document tracker, GRN
- **FAS** – document tracker (Step 3), clearance payment (Step 5)
- **Logistic** – shipment clearing (Step 4), clearance final (Step 6)
- **Admin** – all of the above

## License

Private / internal use.
