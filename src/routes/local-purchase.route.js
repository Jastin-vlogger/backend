// Local Purchase — fully independent route set. Mirrors shipment.route.js's auth/multer
// wiring exactly, but mounted separately (see app.js) and pointed at the new
// local-purchase-*.controller.js files — no shared controller/route file with the Shipment
// flow, per the plan's independence requirement.
const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

const actionsController = require('../controller/local-purchase-actions.controller');
const allocationController = require('../controller/local-purchase-allocation.controller');
const storageController = require('../controller/local-purchase-storage.controller');
const qualityController = require('../controller/local-purchase-quality.controller');
const extractionController = require('../controller/local-purchase-extraction.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(file.originalname);
    if (allowed) cb(null, true);
    else cb(new Error('Only PDF and image files are allowed'));
  },
});

// ── Read ──────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, authorize({ tag: 'any-active' }), actionsController.getLocalPurchaseList);
router.get('/:id', authMiddleware, authorize({ tag: 'any-active' }), actionsController.getLocalPurchaseById);

// ── Extraction ────────────────────────────────────────────────────────────
// Both LPO and S1 Quality Report are uploaded together — same document pair as the regular
// Shipment flow, which is what lets this reuse the Python service's real /shipment-form
// endpoint unmodified (see local-purchase-extraction.controller.js).
router.post(
  '/extract-lpo',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  upload.fields([
    { name: 'lpoDocument', maxCount: 1 },
    { name: 's1QualityReport', maxCount: 1 },
  ]),
  extractionController.extractLocalPurchaseLpo
);

// ── Create ────────────────────────────────────────────────────────────────
// commercialDocument is optional — not used for extraction, just stored/attached
// (that's why it's only here, not on /extract-lpo above).
router.post(
  '/create',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  upload.fields([
    { name: 'lpoDocument', maxCount: 1 },
    { name: 's1QualityReport', maxCount: 1 },
    { name: 'commercialDocument', maxCount: 1 },
  ]),
  actionsController.createLocalPurchase
);

// ── Storage Allocation ────────────────────────────────────────────────────
// Approve is role-gated inside the controller (mirrors the real Shipment flow's approve route,
// also just 'any-active' at the route level with the finer-grained check internal).
router.patch(
  '/:id/storage-allocation',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  allocationController.updateLocalPurchaseAllocation
);
router.patch(
  '/:id/storage-allocation/approve',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  allocationController.approveLocalPurchaseAllocation
);

// ── Storage & Arrival ─────────────────────────────────────────────────────
router.patch(
  '/:id/storage',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  storageController.updateLocalPurchaseStorage
);

// ── Quality ───────────────────────────────────────────────────────────────
router.patch(
  '/:id/quality',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  qualityController.updateLocalPurchaseQuality
);

module.exports = router;
