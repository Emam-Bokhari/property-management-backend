import { z } from "zod";

const updateLandlordStatusZodSchema = z.object({
  body: z.object({
    status: z.enum(["active", "inactive", "suspended"], {
      required_error: "Status is required (active, inactive, or suspended)",
    }),
  }),
});

export const AdminValidation = {
  updateLandlordStatusZodSchema,
};
