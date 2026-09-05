// src/app.js
const express = require('express');
const bodyParser = require('body-parser');

const authRoutes = require('./routes/auth.route');
const supplierRoutes = require('./routes/supplier.route');
const suppliersRoutes = require('./routes/suppliers.route');
const supplierScheduleRoutes = require('./routes/supplierSchedule.route');
const itemRoutes = require('./routes/item.route');
const shipmentRoutes = require('./routes/shipment.route');
const localPurchaseRoutes = require('./routes/local-purchase.route');
const notificationRoutes = require('./routes/notification.route');
const accessControlRoutes = require('./routes/accessControl.route');
const warehouseRoutes = require('./routes/warehouse.route');
const transportationCompanyRoutes = require('./routes/transportationCompany.route');
const exchangeRateRoutes = require('./routes/exchangeRate.route');
// const logisticsRoutes = require('./modules/logistics/logistics.routes');

const app = express();

// CORS configuration
const cors = require('cors');
const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

console.log('✅ Allowed CORS origins:', allowedOrigins);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS policy does not allow access from the specified Origin.'), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'X-Requested-With'
    ],
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Raised from the 100kb default: the dashboard chart-export endpoint posts a base64 PNG of the
// rendered chart canvas back to the server for Excel embedding, which routinely exceeds 100kb.
app.use(bodyParser.json({ limit: '10mb' }));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/supplier', supplierRoutes);
app.use('/api/v1/suppliers', suppliersRoutes);
app.use('/api/v1/supplier-schedules', supplierScheduleRoutes);
app.use('/api/v1/item', itemRoutes);
app.use('/api/v1/shipment', shipmentRoutes);
app.use('/api/v1/local-purchase', localPurchaseRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/access-control', accessControlRoutes);
app.use('/api/v1/warehouse', warehouseRoutes);
app.use('/api/v1/transportation-companies', transportationCompanyRoutes);
app.use('/api/v1/exchange-rates', exchangeRateRoutes);

app.get('/', (req, res) => res.send('Shipment Tracker Backend Running'));

module.exports = app;
