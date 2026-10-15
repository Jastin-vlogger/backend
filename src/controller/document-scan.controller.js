// General image scan: thin PUBLIC proxy to the Python document-AI service (no token, no database).
// Nothing here stores or logs the images or the extracted content (cards/IDs are sensitive).
const mongoose = require('mongoose');

// Covers the slowest valid scan: the main model call plus the logo-refinement calls.
const SCAN_TIMEOUT_MS = 250 * 1000;

exports.scanImages = async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ message: 'At least one image is required (field name: images).' });
    }

    const baseUrl = (process.env.PYTHON_EXTRACTION_API_URL || 'http://localhost:8000').replace(/\/$/, '');
    const endpoint = `${baseUrl}/image-scan/extract`;

    const form = new FormData();
    files.forEach((file, index) => {
      const blob = new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' });
      form.append('images', blob, file.originalname || `image-${index + 1}`);
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { detail: errText }; }
      const detail = typeof errJson.detail === 'string' ? errJson.detail : null;
      return res.status(response.status).json({
        message: detail || errJson.message || `Image scan service returned ${response.status}`,
        error: errJson,
      });
    }

    const result = await response.json();
    const scanId = new mongoose.Types.ObjectId();

    return res.status(200).json({ scan_id: String(scanId), ...result });
  } catch (err) {
    console.error('Document scan error:', err.name, err.message);
    const unavailable = err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED';
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ message: 'Image scan timed out. Try fewer or smaller images.' });
    }
    return res.status(unavailable ? 503 : 500).json({
      message: unavailable
        ? 'Image scan service unavailable. Check PYTHON_EXTRACTION_API_URL and that the Python service is running.'
        : (err.message || 'Server error'),
    });
  }
};
