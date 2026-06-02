const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

const requiredEnv = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'];

function ensureS3Config() {
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing S3 configuration: ${missing.join(', ')}`);
  }
}

function getS3Client() {
  ensureS3Config();
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
}

function sanitizeName(name) {
  return String(name || 'file')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase();
}

function getPublicUrl(bucket, key) {
  const customBase = process.env.AWS_S3_PUBLIC_BASE_URL;
  if (customBase) {
    return `${customBase.replace(/\/$/, '')}/${key}`;
  }
  const region = process.env.AWS_REGION;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

async function uploadBufferToS3(file, folder = 'shipments') {
  if (!file || !file.buffer) {
    throw new Error('Invalid file for S3 upload');
  }

  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET;
  const prefix = (process.env.AWS_S3_SHIPMENT_PREFIX || folder || 'shipments').replace(/^\/+|\/+$/g, '');
  const ext = path.extname(file.originalname || '') || '';
  const base = path.basename(file.originalname || 'document', ext);
  const timestamp = Date.now();
  const safeName = sanitizeName(base);
  const key = `${prefix}/${timestamp}-${safeName}${ext}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/octet-stream'
  });

  await client.send(command);

  return {
    key,
    url: getPublicUrl(bucket, key),
    fileName: file.originalname || `${safeName}${ext}`,
    mimeType: file.mimetype || 'application/octet-stream',
    size: Number(file.size || 0)
  };
}

function extractS3KeyFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    const pathname = u.pathname || '';
    return decodeURIComponent(pathname.replace(/^\/+/, ''));
  } catch (_) {
    return null;
  }
}

async function createSignedGetUrl(keyOrUrl, expiresIn = 900) {
  if (!keyOrUrl) return null;
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET;
  const key = keyOrUrl.includes('http') ? extractS3KeyFromUrl(keyOrUrl) : keyOrUrl;
  if (!key) return null;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });
  return getSignedUrl(client, command, { expiresIn });
}

module.exports = { uploadBufferToS3, extractS3KeyFromUrl, createSignedGetUrl };
