import { z } from "zod";
import { AppOptionType } from "./appOption.constant";

const createAppOptionZodSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: "Name is required" })
      .min(1, "Name cannot be empty"),
    type: z.nativeEnum(AppOptionType, {
      required_error: "Type is required",
    }),
    isActive: z.boolean().optional().default(true),
  }),
});

const updateAppOptionZodSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name cannot be empty").optional(),
    type: z.nativeEnum(AppOptionType).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const AppOptionValidation = {
  createAppOptionZodSchema,
  updateAppOptionZodSchema,
};
