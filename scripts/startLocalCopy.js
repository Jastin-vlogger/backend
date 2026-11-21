// Starts the backend against a LOCAL COPY of the database, with email and S3 switched off, so the
// app can be clicked through without touching live data or sending real emails.
//
//   1. mongod --dbpath <dir> --port 27018 --bind_ip 127.0.0.1
//   2. mongodump the live db, mongorestore it into "haseeb_copy" on port 27018
//   3. node scripts/seedLocalTestUsers.js   (adds test users to the COPY only)
//   4. node scripts/startLocalCopy.js       (API on http://localhost:8080)
//
// Refuses to run unless the database URI points at localhost.

const LOCAL_URI = process.env.LOCAL_COPY_MONGO_URI || 'mongodb://127.0.0.1:27018/haseeb_copy';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(LOCAL_URI)) {
  console.error('Refusing to start: LOCAL_COPY_MONGO_URI must point at localhost.');
  process.exit(1);
}

Object.assign(process.env, {
  MONGO_URI: LOCAL_URI,
  PORT: '8080',
  // Local-only values (this launcher never runs against a real environment).
  JWT_SECRET: 'local-copy-jwt-secret-not-for-production',
  CLIENT_ORIGINS: 'http://localhost:4200,http://127.0.0.1:4200',
  AWS_REGION: 'us-east-1',
  // No real email, no real S3 (uploads and signed URLs simply fail softly).
  SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '',
  AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '',
  // The document-AI service is not started for these tests.
  PYTHON_EXTRACTION_API_URL: 'http://127.0.0.1:9', PYTHON_BILLNO_API_URL: 'http://127.0.0.1:9',
});

require('../src/server');
