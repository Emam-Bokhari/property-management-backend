import { z } from "zod";
import { DEPOSIT_PROTECTION_SCHEME, TENANCY_STATUS } from "./tenant.constant";

const inviteTenantZodSchema = z.object({
  body: z.object({
    property: z.string({ required_error: "Property ID is required" }),
    flat: z.string({ required_error: "Flat ID is required" }),
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .optional()
      .default("12345678"),
    personalMessage: z.string().optional(),
    rentAmount: z.coerce
      .number()
      .positive("Rent amount must be greater than 0")
      .optional(),
    leaseStartDate: z.string({
      required_error: "Lease start date is required",
    }),
    leaseEndDate: z.string({ required_error: "Lease end date is required" }),
    securityDeposit: z.coerce.number().nonnegative().optional().default(0),
    advanceRent: z.coerce.number().nonnegative().optional().default(0),
    depositProtectionScheme: z
      .nativeEnum(DEPOSIT_PROTECTION_SCHEME)
      .optional()
      .default(DEPOSIT_PROTECTION_SCHEME.MY_DEPOSITS),
  }),
});

const updateTenancyZodSchema = z.object({
  body: z.object({
    rentAmount: z.coerce.number().positive().optional(),
    leaseStartDate: z.string().optional(),
    leaseEndDate: z.string().optional(),
    securityDeposit: z.coerce.number().nonnegative().optional(),
    advanceRent: z.coerce.number().nonnegative().optional(),
    depositProtectionScheme: z.nativeEnum(DEPOSIT_PROTECTION_SCHEME).optional(),
    personalMessage: z.string().optional(),
    status: z.nativeEnum(TENANCY_STATUS).optional(),
  }),
});

const resendInviteZodSchema = z.object({
  body: z
    .object({
      password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .optional(),
    })
    .optional(),
});

export const TenantValidation = {
  inviteTenantZodSchema,
  updateTenancyZodSchema,
  resendInviteZodSchema,
};
