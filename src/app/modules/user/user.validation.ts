import { z } from "zod";
import { GENDER, STATUS, USER_ROLES } from "../../../enums/user";
import { PRIMARY_TRADE } from "./user.constant";

const createAdminZodSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Name is required" }),
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email format"),
    password: z
      .string({ required_error: "Password is required" })
      .min(8, "Password must be at least 8 characters"),
    role: z
      .enum([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN])
      .optional()
      .default(USER_ROLES.ADMIN),
    phone: z.string().optional(),
    countryCode: z.string().optional(),
  }),
});

const createUserZodSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Name is required" }),
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email format"),
    password: z
      .string({ required_error: "Password is required" })
      .min(8, "Password must be at least 8 characters"),
    role: z
      .enum([USER_ROLES.LANDLORD, USER_ROLES.TENANT, USER_ROLES.CONTRACTOR])
      .optional()
      .default(USER_ROLES.LANDLORD),
    phone: z.string().optional(),
    countryCode: z.string().optional(),
    profileImage: z.string().optional(),
    gender: z.nativeEnum(GENDER).optional(),
    dateOfBirth: z.string().optional(),
    address: z.string().optional(),
    homeAddress: z.string().optional(),
    emergencyPhone: z.string().optional(),
    emergencyContact: z.string().optional(),
    nidNumber: z.union([z.string(), z.number()]).optional(),
    nidPhoto: z.string().optional(),
    companyName: z.string().optional(),
    primaryTrade: z.nativeEnum(PRIMARY_TRADE).optional(),
  }),
});

const updateProfileZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    countryCode: z.string().optional(),
    profileImage: z.string().optional(),
    gender: z.nativeEnum(GENDER).optional(),
    dateOfBirth: z.string().optional(),
    address: z.string().optional(),
    homeAddress: z.string().optional(),
    emergencyPhone: z.string().optional(),
    emergencyContact: z.string().optional(),
    nidNumber: z.union([z.string(), z.number()]).optional(),
    nidPhoto: z.string().optional(),
    companyName: z.string().optional(),
    primaryTrade: z.nativeEnum(PRIMARY_TRADE).optional(),
  }),
});

const updateUserStatusZodSchema = z.object({
  body: z.object({
    status: z.nativeEnum(STATUS, {
      required_error: "Status is required (active or inactive)",
    }),
  }),
});

export const UserValidation = {
  createAdminZodSchema,
  createUserZodSchema,
  updateProfileZodSchema,
  updateUserStatusZodSchema,
};
