import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import {
  BILL_CATEGORY,
  BILL_STATUS,
  CHARGE_TYPE,
  PAYMENT_METHOD,
  WHO_IS_BILLED,
} from "./finance.constant";
import { FinanceBillModel, IFinanceBill } from "./finance.interface";

const financeBillSchema = new Schema<IFinanceBill, FinanceBillModel>(
  {
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    flat: {
      type: Schema.Types.ObjectId,
      ref: "Flat",
      required: true,
      index: true,
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    billType: {
      type: String,
      enum: Object.values(CHARGE_TYPE),
      required: true,
      index: true,
    },
    billCategory: {
      type: String,
      enum: Object.values(BILL_CATEGORY),
      required: true,
      index: true,
    },
    whoIsBilled: {
      type: String,
      enum: Object.values(WHO_IS_BILLED),
      required: true,
      default: WHO_IS_BILLED.SPECIFIC_TENANT,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    periodMonth: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: Object.values(BILL_STATUS),
      default: BILL_STATUS.PENDING,
      index: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHOD),
      default: null,
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: null,
    },
    receiptSent: {
      type: Boolean,
      default: false,
    },
    paymentNotes: {
      type: String,
      trim: true,
      default: null,
    },
    stripeSessionId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    stripePaymentIntentId: {
      type: String,
      trim: true,
      default: null,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

financeBillSchema.plugin(softDeletePlugin);

export const FinanceBill = model<IFinanceBill, FinanceBillModel>(
  "FinanceBill",
  financeBillSchema,
);
