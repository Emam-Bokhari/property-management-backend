import { z } from "zod";
import { CONTRACTOR_RELATION_STATUS } from "./contractor.constant";

const inviteContractorZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .optional()
      .default("12345678"),
    phone: z.string().optional(),
    trade: z.string().optional(),
    trades: z.union([z.array(z.string()), z.string()]).optional(),
    companyName: z.string().optional(),
    properties: z.array(z.string()).optional(),
    allProperties: z.boolean().optional().default(true),
    personalMessage: z.string().optional(),
  }),
});

const updateContractorZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    companyName: z.string().optional(),
    trade: z.string().optional(),
    trades: z.union([z.array(z.string()), z.string()]).optional(),
    properties: z.array(z.string()).optional(),
    allProperties: z.boolean().optional(),
    personalMessage: z.string().optional(),
    status: z.nativeEnum(CONTRACTOR_RELATION_STATUS).optional(),
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

export const ContractorValidation = {
  inviteContractorZodSchema,
  updateContractorZodSchema,
  resendInviteZodSchema,
};
