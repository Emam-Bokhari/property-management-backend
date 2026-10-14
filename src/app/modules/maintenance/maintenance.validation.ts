import { z } from "zod";
import {
  CONTRACTOR_STATUS,
  MAINTENANCE_PAID_BY,
  MAINTENANCE_PRIORITY,
  MAINTENANCE_REQUESTER,
  MAINTENANCE_STATUS,
} from "./maintenance.constant";

const createMaintenanceZodSchema = z.object({
  body: z.object({
    jobId: z.string().optional(),
    issueTitle: z
      .string({ required_error: "Issue title is required" })
      .min(1, "Issue title cannot be empty"),
    issueType: z.string({ required_error: "Issue type is required" }),
    priority: z
      .nativeEnum(MAINTENANCE_PRIORITY)
      .optional()
      .default(MAINTENANCE_PRIORITY.MEDIUM),
    description: z
      .string({ required_error: "Description is required" })
      .min(1, "Description cannot be empty"),
    attachments: z.string().optional(),
    locationInProperty: z.string().optional(),
    property: z.string({ required_error: "Property ID is required" }),
    flat: z.string().optional(),
    requestedBy: z.string().optional(),
    requesterRole: z
      .nativeEnum(MAINTENANCE_REQUESTER, {
        required_error: "Requester role is required",
      })
      .optional()
      .default(MAINTENANCE_REQUESTER.TENANT),
    landlord: z.string({ required_error: "Landlord ID is required" }),
    tenant: z.string().optional(),
    status: z
      .nativeEnum(MAINTENANCE_STATUS)
      .optional()
      .default(MAINTENANCE_STATUS.PENDING),
  }),
});

const updateMaintenanceZodSchema = z.object({
  body: z.object({
    jobId: z.string().optional(),
    issueTitle: z.string().min(1, "Issue title cannot be empty").optional(),
    issueType: z.string().optional(),
    priority: z.nativeEnum(MAINTENANCE_PRIORITY).optional(),
    description: z.string().min(1, "Description cannot be empty").optional(),
    attachments: z.string().optional(),
    locationInProperty: z.string().optional(),
    property: z.string().optional(),
    flat: z.string().optional(),
    requestedBy: z.string().optional(),
    requesterRole: z.nativeEnum(MAINTENANCE_REQUESTER).optional(),
    landlord: z.string().optional(),
    tenant: z.string().optional(),
    status: z.nativeEnum(MAINTENANCE_STATUS).optional(),
    contractor: z.string().optional(),
    contractorStatus: z.nativeEnum(CONTRACTOR_STATUS).optional(),
    assignedDate: z.union([z.string(), z.date()]).optional(),
    scheduledDate: z.union([z.string(), z.date()]).optional(),
    scheduledTime: z.string().optional(),
    scheduleNotes: z.string().optional(),
    paidBy: z.nativeEnum(MAINTENANCE_PAID_BY).optional(),
    invoiceAmounts: z.number().optional(),
    notes: z.string().optional(),
    certificates: z.array(z.string()).optional(),
    completionPhotos: z.array(z.string()).optional(),
    completionNotes: z.string().optional(),
    completedAt: z.union([z.string(), z.date()]).optional(),
    cancellationReason: z.string().optional(),
    cancelledBy: z.string().optional(),
    cancelledAt: z.union([z.string(), z.date()]).optional(),
  }),
});

const assignContractorZodSchema = z.object({
  body: z.object({
    contractor: z.string({ required_error: "Contractor ID is required" }),
    contractorStatus: z
      .nativeEnum(CONTRACTOR_STATUS)
      .optional()
      .default(CONTRACTOR_STATUS.PENDING),
    assignedDate: z.union([z.string(), z.date()]).optional(),
    scheduledDate: z.union([z.string(), z.date()]).optional(),
    scheduledTime: z.string().optional(),
    scheduleNotes: z.string().optional(),
  }),
});

const updateMaintenanceStatusZodSchema = z.object({
  body: z.object({
    status: z.nativeEnum(MAINTENANCE_STATUS, {
      required_error: "Status is required",
    }),
    notes: z.string().optional(),
    completionPhotos: z.array(z.string()).optional(),
    completionNotes: z.string().optional(),
    cancellationReason: z.string().optional(),
  }),
});

export const MaintenanceValidation = {
  createMaintenanceZodSchema,
  updateMaintenanceZodSchema,
  assignContractorZodSchema,
  updateMaintenanceStatusZodSchema,
};
