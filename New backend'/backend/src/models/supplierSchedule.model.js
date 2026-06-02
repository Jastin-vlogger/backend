const mongoose = require('mongoose');

const supplierScheduleSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    supplierAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SupplierAccount',
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    referenceNo: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    shipmentType: {
      type: String,
      trim: true,
      default: '',
    },
    origin: {
      type: String,
      trim: true,
      default: '',
    },
    destination: {
      type: String,
      trim: true,
      default: '',
    },
    plannedDepartureDate: {
      type: Date,
      default: null,
    },
    plannedArrivalDate: {
      type: Date,
      default: null,
    },
    frequency: {
      type: String,
      trim: true,
      default: '',
    },
    capacity: {
      type: Number,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['Draft', 'Submitted', 'Approved', 'Rejected'],
      default: 'Draft',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    adminSuggestion: {
      type: String,
      trim: true,
      default: '',
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    scheduleHistory: {
      type: [
        new mongoose.Schema(
          {
            action: {
              type: String,
              required: true,
              trim: true,
            },
            actorType: {
              type: String,
              enum: ['Supplier', 'Admin', 'System'],
              required: true,
            },
            actorName: {
              type: String,
              trim: true,
              default: '',
            },
            changes: {
              type: [
                new mongoose.Schema(
                  {
                    field: {
                      type: String,
                      required: true,
                      trim: true,
                    },
                    label: {
                      type: String,
                      required: true,
                      trim: true,
                    },
                    previousValue: {
                      type: String,
                      trim: true,
                      default: '',
                    },
                    nextValue: {
                      type: String,
                      trim: true,
                      default: '',
                    },
                  },
                  { _id: false }
                ),
              ],
              default: [],
            },
            createdAt: {
              type: Date,
              default: Date.now,
            },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SupplierSchedule', supplierScheduleSchema);
