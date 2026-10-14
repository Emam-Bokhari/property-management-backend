import { z } from "zod";

const signUpZodSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Name is required" }),
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email format"),
    password: z
      .string({ required_error: "Password is required" })
      .min(8, "Password must be at least 8 characters"),
    fcmToken: z.string().optional(),
    deviceId: z.string().optional(),
    deviceType: z.enum(["ios", "android", "web"]).optional(),
  }),
});

const createVerifyEmailZodSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email format"),
    oneTimeCode: z.number({ required_error: "One time code is required" }),
  }),
});

const createLoginZodSchema = z.object({
  body: z.object({
    email: z.string({ required_error: "Email is required" }),
    password: z.string({ required_error: "Password is required" }),
    fcmToken: z.string().optional(),
    deviceId: z.string().optional(),
    deviceType: z.enum(["ios", "android", "web"]).optional(),
  }),
});

const createForgetPasswordZodSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email format"),
  }),
});

const createResetPasswordZodSchema = z.object({
  body: z.object({
    newPassword: z
      .string({ required_error: "Password is required" })
      .min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string({
      required_error: "Confirm Password is required",
    }),
  }),
});

const createChangePasswordZodSchema = z.object({
  body: z.object({
    currentPassword: z.string({
      required_error: "Current Password is required",
    }),
    newPassword: z
      .string({ required_error: "New Password is required" })
      .min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string({
      required_error: "Confirm Password is required",
    }),
  }),
});

export const AuthValidation = {
  signUpZodSchema,
  createVerifyEmailZodSchema,
  createForgetPasswordZodSchema,
  createLoginZodSchema,
  createResetPasswordZodSchema,
  createChangePasswordZodSchema,
};
