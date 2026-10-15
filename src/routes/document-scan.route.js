// General image scan route. Same JWT as every other API (authMiddleware), then forwarded to the
// Python service. Independent of the shipment routes/controllers.
const express = require('express');
const multer = require('multer');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');
const controller = require('../controller/document-scan.controller');

const router = express.Router();

const MAX_IMAGES = 6;
const IMAGE_MIME = /^image\/(jpeg|jpg|png|webp)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_IMAGES }, // 10 MB per image
  // Camera captures often arrive as nameless blobs, so the MIME type counts as much as the extension.
  fileFilter: (req, file, cb) => {
    if (IMAGE_MIME.test(file.mimetype || '') || IMAGE_EXT.test(file.originalname || '')) cb(null, true);
    else cb(new Error('Only JPEG, PNG or WEBP images are allowed'));
  },
});

router.post(
  '/extract',
  authMiddleware,
  authorize({ tag: 'any-active' }),
  (req, res, next) => {
    upload.array('images', MAX_IMAGES)(req, res, (err) => {
      if (!err) return next();
      const tooMany = err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT';
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        message: tooMany
          ? `A maximum of ${MAX_IMAGES} images is allowed per request.`
          : tooBig
            ? 'Each image must be 10 MB or smaller.'
            : err.message || 'Invalid image upload',
      });
    });
  },
  controller.scanImages
);

module.exports = router;
