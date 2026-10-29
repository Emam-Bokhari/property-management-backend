import { z } from "zod";

const createReviewZodSchema = z.object({
  body: z
    .object({
      contractor: z.string().optional(),
      tenant: z
        .string({
          required_error: "Tenant ID is required",
        })
        .optional(),
      maintenance: z.string({
        required_error: "Maintenance job ID is required",
      }),
      rating: z
        .number({
          required_error: "Rating is required",
        })
        .int(
          "Rating must be an integer (1, 2, 3, 4, or 5). Float is not allowed",
        )
        .min(1, "Rating must be at least 1")
        .max(5, "Rating cannot exceed 5"),
      feedback: z.string().trim().optional(),
    })
    .refine(
      (data) => {
        // Nije k nije review/rating dite parbe na
        if (data.tenant && data.contractor) {
          return data.tenant !== data.contractor;
        }
        return true;
      },
      {
        message: "You cannot review or rate yourself",
        path: ["contractor"],
      },
    ),
});

export const ReviewValidation = {
  createReviewZodSchema,
};
