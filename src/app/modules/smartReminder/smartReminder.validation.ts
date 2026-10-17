import { z } from "zod";
import { REMINDER_STATUS } from "./smartReminder.constant";

const createSmartReminderZodSchema = z.object({
  body: z.object({
    title: z
      .string({ required_error: "Title is required" })
      .min(1, "Title cannot be empty"),
    property: z.string({ required_error: "Property ID is required" }),
    dueDate: z
      .string({ required_error: "Due date is required" })
      .refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid date format",
      }),
    status: z.nativeEnum(REMINDER_STATUS).optional(),
    note: z.string().optional(),
  }),
});

const updateSmartReminderZodSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title cannot be empty").optional(),
    property: z.string().optional(),
    dueDate: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid date format",
      })
      .optional(),
    status: z.nativeEnum(REMINDER_STATUS).optional(),
    note: z.string().optional(),
    isNotified: z.boolean().optional(),
  }),
});

export const SmartReminderValidation = {
  createSmartReminderZodSchema,
  updateSmartReminderZodSchema,
};
