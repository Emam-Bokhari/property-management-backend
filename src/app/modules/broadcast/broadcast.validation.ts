import { z } from "zod";
import { BROADCAST_AUDIENCE } from "./broadcast.constant";

const landlordIdsSchema = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((val) => {
    if (!val) return undefined;
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [val];
      } catch {
        return [val];
      }
    }
    return val;
  });

const sendBroadcastZodSchema = z.object({
  body: z
    .object({
      title: z
        .string({ required_error: "Title is required" })
        .min(1, "Title cannot be empty")
        .max(100, "Title cannot exceed 100 characters"),
      message: z.string().optional(),
      body: z.string().optional(),
      audience: z
        .enum([
          BROADCAST_AUDIENCE.ALL_LANDLORDS,
          BROADCAST_AUDIENCE.SELECTED_LANDLORDS,
          BROADCAST_AUDIENCE.EVERYONE,
          "all",
          "selected",
          "specific",
        ])
        .optional()
        .default(BROADCAST_AUDIENCE.ALL_LANDLORDS),
      landlordIds: landlordIdsSchema,
      landlords: landlordIdsSchema,
      landlordId: z.string().optional(),
    })
    .refine((data) => data.message || data.body, {
      message: "Notification message or body is required",
      path: ["message"],
    }),
});

export const BroadcastValidation = {
  sendBroadcastZodSchema,
};
