import { z } from "zod";

const updateNotificationPreferenceZodSchema = z.object({
  body: z.object({
    rentReminders: z.boolean().optional(),
    maintenanceUpdates: z.boolean().optional(),
    complianceAlerts: z.boolean().optional(),
    newMessages: z.boolean().optional(),
    jobUpdates: z.boolean().optional(),
  }),
});

export const NotificationPreferenceValidation = {
  updateNotificationPreferenceZodSchema,
};
