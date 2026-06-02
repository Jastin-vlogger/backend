// src/app.js
const express = require('express');
const bodyParser = require('body-parser');

const authRoutes = require('./routes/auth.route');
const supplierRoutes = require('./routes/supplier.route');
const suppliersRoutes = require('./routes/suppliers.route');
const supplierScheduleRoutes = require('./routes/supplierSchedule.route');
const itemRoutes = require('./routes/item.route');
const shipmentRoutes = require('./routes/shipment.route');
const notificationRoutes = require('./routes/notification.route');
const accessControlRoutes = require('./routes/accessControl.route');
const warehouseRoutes = require('./routes/warehouse.route');
const transportationCompanyRoutes = require('./routes/transportationCompany.route');
const exchangeRateRoutes = require('./routes/exchangeRate.route');
// const logisticsRoutes = require('./modules/logistics/logistics.routes');

const app = express();

// CORS configuration
const cors = require('cors');
const allowedOrigins = (process.env.CLIENT_ORIGINS || '').split(',');

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin', 'Access-Control-Allow-Headers']
}));

app.use(bodyParser.json());

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/supplier', supplierRoutes);
app.use('/api/v1/suppliers', suppliersRoutes);
app.use('/api/v1/supplier-schedules', supplierScheduleRoutes);
app.use('/api/v1/item', itemRoutes);
app.use('/api/v1/shipment', shipmentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/access-control', accessControlRoutes);
app.use('/api/v1/warehouse', warehouseRoutes);
app.use('/api/v1/transportation-companies', transportationCompanyRoutes);
app.use('/api/v1/exchange-rates', exchangeRateRoutes);

app.get('/', (req, res) => res.send('Shipment Tracker Backend Running'));

module.exports = app;
