const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('../controller/shipment.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

// Multer: memory storage for document uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(file.originalname);
    if (allowed) cb(null, true);
    else cb(new Error('Only PDF and image files are allowed'));
  },
});

// ── Read endpoints — any active role ────────────────────────────────────────

router.get('/',                    authMiddleware, authorize({ tag: 'any-active' }), controller.getAllShipments);
router.get('/search',              authMiddleware, authorize({ tag: 'any-active' }), controller.searchShipments);
router.get('/dashboard',           authMiddleware, authorize({ tag: 'any-active' }), controller.getShipmentSummary);
router.get('/reports/export-data', authMiddleware, authorize({ tag: 'any-active' }), controller.getShipmentReportExportData);
router.get('/reports/export/excel',authMiddleware, authorize({ tag: 'any-active' }), controller.downloadShipmentReportExcel);
router.get('/reports/export/pdf',  authMiddleware, authorize({ tag: 'any-active' }), controller.downloadShipmentReportPdf);
router.get('/bl-row-definitions',  authMiddleware, authorize({ tag: 'any-active' }), controller.getBlRowDefinitions);
router.get('/:id',                 authMiddleware, authorize({ tag: 'any-active' }), controller.getShipmentById);

// ── Write endpoints — role-specific (intentional business rules) ─────────────

// Create shipment — Purchase team only
router.post(
  '/create',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.fields([
      { name: 'lpoDocument', maxCount: 1 },
      { name: 'proformaDocument', maxCount: 1 },
      { name: 's1QualityReport', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.createShipment
);

// Extract PI/PO documents — Purchase team only
router.post(
  '/extract-documents',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.fields([
      { name: 'document1', maxCount: 1 },
      { name: 's1QualityReport', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.extractFromDocuments
);

// Extract bill number — Purchase team only
router.post(
  '/extract-bill-no',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'packaging_list_file', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.extractBillNo
);

// Extract arrival notice — permission-driven access
router.post(
  '/extract-arrival-notice',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.extractArrivalNotice
);

// Planned containers — Purchase team only
router.post('/container/planned', authMiddleware, authorize({ tag: 'any-active' }), controller.createPlannedContainersBulk);

// Actual container (BL entry) — Purchase team only
router.patch(
  '/container/actual/:id',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.fields([
      { name: 'blDocument', maxCount: 1 },
      { name: 'packaging_list_document', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.addActualContainer
);

// BL details — Purchase team only
router.patch(
  '/container/bl-details/:id',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.updateBLDetails
);

router.patch(
  '/container/bl-details/:id/clearing-advance/approve',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  controller.approveClearingAdvance
);

router.patch(
  '/container/bl-details/:id/storage-allocations/approve',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  controller.approveStorageAllocations
);

router.patch(
  '/container/storage/:id/approve',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  controller.approveStorageArrival
);

// Document tracker payment endpoints — permission-driven access
router.patch(
  '/container/payment/:id',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.fields([
      { name: 'inwardCollectionAdviceDocument', maxCount: 1 },
      { name: 'murabahaContractSubmittedDocument', maxCount: 1 },
      { name: 'documentsReleasedDocument', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.updateFASContainer
);

// Logistics details — permission-driven access
router.patch(
  '/container/logistic/:id',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.fields([
      { name: 'arrivalNoticeDocument', maxCount: 1 },
      { name: 'advanceRequestDocument', maxCount: 1 },
      { name: 'doReleasedDocument', maxCount: 1 },
      { name: 'boePassingDocument', maxCount: 1 },
      { name: 'customsClearanceDocument', maxCount: 1 },
      { name: 'municipalityDocument', maxCount: 1 },
      { name: 'customsDocBoe', maxCount: 1 },
      { name: 'customsDocDo', maxCount: 1 },
      { name: 'customsDocBl', maxCount: 1 },
      { name: 'customsDocInvoice', maxCount: 1 },
      { name: 'customsDocPackingList', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.updateLogisticsDetails
);

// Clearance payment — permission-driven access
router.patch('/container/clearence-payment/:id', authMiddleware, authorize({ tag: 'any-active' }), controller.addContainerPayment);

// Clearance final — permission-driven access
router.patch('/container/clearance/:id', authMiddleware, authorize({ tag: 'any-active' }), controller.clearContainer);

// Storage — permission-driven access
router.patch(
  '/container/storage/:id',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.updateStorageDetails
);

router.patch(
  '/container/storage-row/:id/:rowIndex',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.updateStorageArrivalRow
);

// Quality — Purchase team only
router.patch(
  '/container/quality/:id',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.updateQualityDetails
);

// Payment costing — permission-driven access
router.patch(
  '/container/payment-costing/:id',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Invalid file upload' });
      next();
    });
  },
  controller.updatePaymentCostingDetails
);

router.patch(
  '/container/payment-costing/:id/approve',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  controller.approvePaymentCosting
);

// GRN — Purchase team only
router.patch('/container/grn/:id', authMiddleware, authorize({ tag: 'any-active' }), controller.addContainerGRN);

// Bulk save endpoints
router.post('/container/storage/bulk-save', authMiddleware, authorize({ tag: 'any-active' }), controller.bulkSaveStorageArrival);
router.post('/container/transportation/bulk-save', authMiddleware, authorize({ tag: 'any-active' }), controller.bulkSaveTransportationArranged);

// Supplier email — Purchase team only
router.patch('/:id/supplier-email', authMiddleware, authorize({ tag: 'any-active' }), controller.updateSupplierEmail);
router.patch('/:id/bank-name', authMiddleware, authorize({ tag: 'any-active' }), controller.updateBankName);

module.exports = router;
