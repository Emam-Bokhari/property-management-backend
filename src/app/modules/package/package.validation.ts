import { z } from "zod";

const createPackageZodSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Package name is required" }),
    description: z.string().optional(),
    monthlyPrice: z.number({ required_error: "Monthly price is required" }),
    yearlyPrice: z.number({ required_error: "Yearly price is required" }),
    maxProperties: z.number({
      required_error: "Max properties limit is required",
    }),
    maxFlats: z.number({ required_error: "Max flats limit is required" }),
    features: z.array(z.string()).default([]),
    hasTrial: z.boolean().default(false),
    trialDays: z.number().min(0).default(0),
    isPopular: z.boolean().optional(),
    isActive: z.boolean().default(true),
    // Optional: Only if user wants to override with existing Stripe IDs
    stripeProductId: z.string().optional(),
    stripeMonthlyPriceId: z.string().optional(),
    stripeYearlyPriceId: z.string().optional(),
  }),
});

const updatePackageZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    monthlyPrice: z.number().optional(),
    yearlyPrice: z.number().optional(),
    maxProperties: z.number().optional(),
    maxFlats: z.number().optional(),
    features: z.array(z.string()).optional(),
    hasTrial: z.boolean().optional(),
    trialDays: z.number().min(0).optional(),
    isPopular: z.boolean().optional(),
    isActive: z.boolean().optional(),
    stripeProductId: z.string().optional(),
    stripeMonthlyPriceId: z.string().optional(),
    stripeYearlyPriceId: z.string().optional(),
  }),
});

export const PackageValidation = {
  createPackageZodSchema,
  updatePackageZodSchema,
};
