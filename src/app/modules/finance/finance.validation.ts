import { z } from "zod";
import { CHARGE_TYPE, PAYMENT_METHOD, WHO_IS_BILLED } from "./finance.constant";

const createChargeZodSchema = z.object({
  body: z.object({
    chargeType: z.enum(
      [
        CHARGE_TYPE.UTILITY_CHARGE,
        CHARGE_TYPE.REPAIR_CHARGE,
        CHARGE_TYPE.PENALTY,
        CHARGE_TYPE.SERVICE_CHARGE,
        CHARGE_TYPE.CUSTOM_CHARGE,
      ],
      { required_error: "Charge type is required" },
    ),
    whoIsBilled: z.enum(
      [
        WHO_IS_BILLED.LEAD_TENANT,
        WHO_IS_BILLED.SPECIFIC_TENANT,
        WHO_IS_BILLED.ALL_TENANTS_ON_UNIT,
      ],
      { required_error: "Who is billed is required" },
    ),
    property: z.string({ required_error: "Property is required" }),
    flat: z.string({ required_error: "Flat/Unit is required" }),
    tenant: z.string().optional(),
    amount: z.coerce
      .number({ required_error: "Amount is required" })
      .positive("Amount must be greater than zero"),
    dueDate: z.string({ required_error: "Due date is required" }),
    description: z.string().optional(),
  }),
});

const recordPaymentZodSchema = z.object({
  body: z.object({
    billIds: z
      .array(z.string())
      .min(1, "At least one bill ID must be selected"),
    paymentDate: z.string({ required_error: "Payment date is required" }),
    paymentMethod: z.enum(
      [
        PAYMENT_METHOD.BANK_TRANSFER,
        PAYMENT_METHOD.CASH,
        PAYMENT_METHOD.CHEQUE,
        PAYMENT_METHOD.DIRECT_DEBIT,
        PAYMENT_METHOD.STRIPE,
        PAYMENT_METHOD.OTHER,
      ],
      { required_error: "Payment method is required" },
    ),
    referenceNumber: z.string().optional(),
    amountReceived: z.coerce
      .number({ required_error: "Amount received is required" })
      .positive("Amount received must be greater than zero"),
    notes: z.string().optional(),
    receiptSentToTenant: z.boolean().optional().default(false),
  }),
});

const recordRentReceivedZodSchema = z.object({
  body: z.object({
    property: z.string({ required_error: "Property is required" }),
    flat: z.string({ required_error: "Flat/Unit is required" }),
    tenant: z.string({ required_error: "Tenant is required" }),
    amount: z.coerce
      .number({ required_error: "Amount is required" })
      .positive("Amount must be greater than zero"),
    periodMonth: z.string().optional(),
    paymentDate: z.string({ required_error: "Payment date is required" }),
    paymentMethod: z.enum(
      [
        PAYMENT_METHOD.BANK_TRANSFER,
        PAYMENT_METHOD.CASH,
        PAYMENT_METHOD.CHEQUE,
        PAYMENT_METHOD.DIRECT_DEBIT,
        PAYMENT_METHOD.STRIPE,
        PAYMENT_METHOD.OTHER,
      ],
      { required_error: "Payment method is required" },
    ),
    referenceNumber: z.string().optional(),
    notes: z.string().optional(),
    receiptSentToTenant: z.boolean().optional().default(false),
  }),
});

const sendReminderZodSchema = z.object({
  body: z.object({
    billIds: z.array(z.string()).optional(),
    tenantIds: z.array(z.string()).optional(),
    customMessage: z.string().optional(),
  }),
});

const stripeCheckoutZodSchema = z.object({
  body: z.object({
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  }),
});

export const FinanceValidation = {
  createChargeZodSchema,
  recordPaymentZodSchema,
  recordRentReceivedZodSchema,
  sendReminderZodSchema,
  stripeCheckoutZodSchema,
};
