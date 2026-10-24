import { z } from "zod";

const createCheckoutSessionZodSchema = z.object({
  body: z.object({
    packageId: z.string({ required_error: "Package ID is required" }),
    planType: z.enum(["monthly", "yearly"], {
      required_error: "Plan type must be either 'monthly' or 'yearly'",
    }),
  }),
});

const cancelSubscriptionZodSchema = z.object({
  body: z.object({
    cancelImmediately: z.boolean().optional().default(false),
  }),
});

export const SubscriptionValidation = {
  createCheckoutSessionZodSchema,
  cancelSubscriptionZodSchema,
};
