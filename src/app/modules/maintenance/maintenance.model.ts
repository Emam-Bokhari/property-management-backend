import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import {
  CONTRACTOR_STATUS,
  MAINTENANCE_LOCATION_TYPE,
  MAINTENANCE_PAID_BY,
  MAINTENANCE_PRIORITY,
  MAINTENANCE_REQUESTER,
  MAINTENANCE_STATUS,
  PAYMENT_STATUS,
} from "./maintenance.constant";
import { MaintenanceModel, TMaintenance } from "./maintenance.interface";
import "../appOption/appOption.model";
import "../property/property.model";
import "../flat/flat.model";
import "../user/user.model";

const maintenanceSchema = new Schema<TMaintenance, MaintenanceModel>(
  {
    jobId: {
      type: String,
      unique: true,
      sparse: true,
    },
    issueTitle: {
      type: String,
      required: true,
      trim: true,
    },
    issueType: {
      type: Schema.Types.ObjectId,
      ref: "AppOption",
      required: true,
    },
    priority: {
      type: String,
      enum: Object.values(MAINTENANCE_PRIORITY),
      default: MAINTENANCE_PRIORITY.MEDIUM,
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    attachments: [
      {
        type: String,
      },
    ],
    locationType: {
      type: String,
      enum: Object.values(MAINTENANCE_LOCATION_TYPE),
      default: MAINTENANCE_LOCATION_TYPE.UNIT,
    },
    communalArea: {
      type: Schema.Types.ObjectId,
      ref: "AppOption",
    },
    locationInProperty: {
      type: String,
      trim: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    flat: {
      type: Schema.Types.ObjectId,
      ref: "Flat",
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requesterRole: {
      type: String,
      enum: Object.values(MAINTENANCE_REQUESTER),
      required: true,
    },
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: Object.values(MAINTENANCE_STATUS),
      default: MAINTENANCE_STATUS.PENDING,
      required: true,
    },
    contractor: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    contractorStatus: {
      type: String,
      enum: Object.values(CONTRACTOR_STATUS),
    },
    reportedAt: {
      type: Date,
      default: Date.now,
    },
    assignedDate: {
      type: Date,
    },
    scheduledDate: {
      type: Date,
    },
    scheduledTime: {
      type: String,
    },
    scheduleNotes: {
      type: String,
    },
    startedAt: {
      type: Date,
    },
    paidBy: {
      type: String,
      enum: Object.values(MAINTENANCE_PAID_BY),
      default: MAINTENANCE_PAID_BY.LANDLORD,
    },
    invoiceAmount: {
      type: Number,
    },
    invoiceAmounts: {
      type: Number,
    },
    invoiceNotes: {
      type: String,
    },
    notes: {
      type: String,
    },
    certificates: [
      {
        type: String,
      },
    ],
    // Payment & Invoice Tracking
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.UNPAID,
    },
    paidAt: {
      type: Date,
    },
    stripeSessionId: {
      type: String,
    },
    transactionId: {
      type: String,
    },
    invoiceStatus: {
      type: String,
      enum: ["submitted", "approved", "rejected"],
    },
    rejectionReason: {
      type: String,
    },
    rejectedAt: {
      type: Date,
    },
    completionPhotos: [
      {
        type: String,
      },
    ],
    completionNotes: {
      type: String,
    },
    completedAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    cancelledAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

maintenanceSchema.pre("save", async function (next) {
  if (!this.jobId) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    this.jobId = `#JOB-${randomSuffix}`;
  }
  if (!this.reportedAt) {
    this.reportedAt = this.createdAt || new Date();
  }
  next();
});

maintenanceSchema.plugin(softDeletePlugin);

export const Maintenance = model<TMaintenance, MaintenanceModel>(
  "Maintenance",
  maintenanceSchema,
);
