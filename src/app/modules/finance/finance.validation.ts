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

const normalizePaymentMethod = (val: unknown) => {
  if (typeof val === "string") {
    return val.trim().toLowerCase().replace(/\s+/g, "_");
  }
  return val;
};

const recordPaymentZodSchema = z.object({
  body: z.preprocess(
    (val) => {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const obj = { ...(val as Record<string, unknown>) };
        if (!obj.paymentDate && obj.paymentReceivedOn) {
          obj.paymentDate = obj.paymentReceivedOn;
        }
        return obj;
      }
      return val;
    },
    z
      .object({
        billIds: z.array(z.string()).optional(),
        property: z.string().optional(),
        flat: z.string().optional(),
        tenant: z.string().optional(),
        amount: z.coerce
          .number()
          .positive("Amount must be greater than zero")
          .optional(),
        amountReceived: z.coerce
          .number()
          .positive("Amount received must be greater than zero")
          .optional(),
        periodMonth: z.union([z.string(), z.date()]).optional(),
        paymentDate: z.union([
          z.string({ required_error: "Payment date is required" }).min(1, "Payment date is required"),
          z.date(),
        ]),
        paymentMethod: z.preprocess(
          normalizePaymentMethod,
          z.enum(
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
        ),
        referenceNumber: z.string().optional(),
        notes: z.string().optional(),
        receiptSentToTenant: z.boolean().optional().default(false),
      })
      .refine(
        (data) =>
          (Array.isArray(data.billIds) && data.billIds.length > 0) ||
          Boolean(
            data.property &&
              data.flat &&
              data.tenant &&
              (data.amount !== undefined || data.amountReceived !== undefined),
          ),
        {
          message:
            "At least one bill ID must be selected, or property, flat, tenant, and amount must be provided",
        },
      ),
  ),
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
  sendReminderZodSchema,
  stripeCheckoutZodSchema,
};
