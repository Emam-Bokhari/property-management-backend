import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import {
  BILL_CATEGORY,
  BILL_STATUS,
  CHARGE_TYPE,
  PAYMENT_METHOD,
  WHO_IS_BILLED,
} from "./finance.constant";

export type IFinanceBill = {
  _id?: Types.ObjectId | string;
  landlord: Types.ObjectId;
  property: Types.ObjectId;
  flat: Types.ObjectId; // Unit is flat
  tenant: Types.ObjectId;
  billType: CHARGE_TYPE;
  billCategory: BILL_CATEGORY;
  whoIsBilled: WHO_IS_BILLED;
  amount: number;
  dueDate: Date;
  periodMonth: Date; // 1st of month in UTC, e.g., 2026-11-01T00:00:00.000Z
  invoiceNumber: string; // e.g., "INV-2026-1045"
  description?: string;
  status: BILL_STATUS;
  paidAmount?: number;
  paidAt?: Date | null;
  paymentMethod?: PAYMENT_METHOD | null;
  referenceNumber?: string | null;
  receiptSent?: boolean;
  paymentNotes?: string | null;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  recordedBy?: Types.ObjectId | null;
  cancelledAt?: Date | null;
  isDeleted?: boolean;
  deletedAt?: Date | null;
};

export type FinanceBillModel = ISoftDeleteModel<IFinanceBill>;

export type ICreateChargePayload = {
  chargeType: CHARGE_TYPE;
  whoIsBilled: WHO_IS_BILLED;
  property: string;
  flat: string;
  tenant?: string;
  amount: number;
  dueDate: string | Date;
  description?: string;
};

export type IRecordPaymentPayload = {
  billIds?: string[];
  property?: string;
  flat?: string;
  tenant?: string;
  amount?: number;
  amountReceived?: number;
  periodMonth?: string | Date;
  paymentDate: string | Date;
  paymentMethod: PAYMENT_METHOD;
  referenceNumber?: string;
  notes?: string;
  receiptSentToTenant?: boolean;
};

export type ISendReminderPayload = {
  billIds?: string[];
  tenantIds?: string[];
  customMessage?: string;
};

export type ICreateStripeCheckoutPayload = {
  successUrl?: string;
  cancelUrl?: string;
};
