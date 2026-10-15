import { z } from "zod";
import { VISIBILITY_SCOPE } from "./announcement.constant";

const flatsSchema = z
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

const createAnnouncementZodSchema = z.object({
  body: z.object({
    property: z.string({ required_error: "Property ID is required" }),
    flats: flatsSchema,
    visibilityScope: z
      .nativeEnum(VISIBILITY_SCOPE, {
        required_error: "Visibility scope is required",
      })
      .default(VISIBILITY_SCOPE.ENTIRE_PROPERTY),
    title: z
      .string({ required_error: "Title is required" })
      .min(1, "Title cannot be empty"),
    message: z
      .string({ required_error: "Message is required" })
      .min(1, "Message cannot be empty"),
    image: z.string().optional().nullable(),
  }),
});

const updateAnnouncementZodSchema = z.object({
  body: z.object({
    property: z.string().optional(),
    flats: flatsSchema,
    visibilityScope: z.nativeEnum(VISIBILITY_SCOPE).optional(),
    title: z.string().min(1, "Title cannot be empty").optional(),
    message: z.string().min(1, "Message cannot be empty").optional(),
    image: z.string().optional().nullable(),
  }),
});

export const AnnouncementValidation = {
  createAnnouncementZodSchema,
  updateAnnouncementZodSchema,
};
