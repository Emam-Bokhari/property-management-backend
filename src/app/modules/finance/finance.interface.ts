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
  periodMonth: string; // e.g., "Jul 2026", "Sept 2026"
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
  billIds: string[];
  paymentDate: string | Date;
  paymentMethod: PAYMENT_METHOD;
  referenceNumber?: string;
  amountReceived: number;
  notes?: string;
  receiptSentToTenant?: boolean;
};

export type IRecordRentReceivedPayload = {
  property: string;
  flat: string;
  tenant: string;
  amount: number;
  periodMonth?: string;
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
