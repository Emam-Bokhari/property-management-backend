import { z } from "zod";
import {
  CONTRACTOR_STATUS,
  MAINTENANCE_LOCATION_TYPE,
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
    attachments: z.union([z.string(), z.array(z.string())]).optional(),
    locationType: z
      .nativeEnum(MAINTENANCE_LOCATION_TYPE)
      .optional()
      .default(MAINTENANCE_LOCATION_TYPE.UNIT),
    communalArea: z.string().optional(),
    locationInProperty: z.string().optional(),
    property: z.string().optional(), // Required for Landlord, auto-attached for Tenant
    flat: z.string().optional(),
    landlord: z.string().optional(),
    tenant: z.string().optional(),
    paidBy: z
      .nativeEnum(MAINTENANCE_PAID_BY)
      .optional()
      .default(MAINTENANCE_PAID_BY.LANDLORD),
    requesterRole: z.nativeEnum(MAINTENANCE_REQUESTER).optional(),
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
    attachments: z.union([z.string(), z.array(z.string())]).optional(),
    locationType: z.nativeEnum(MAINTENANCE_LOCATION_TYPE).optional(),
    communalArea: z.string().optional(),
    locationInProperty: z.string().optional(),
    property: z.string().optional(),
    flat: z.string().optional(),
    status: z.nativeEnum(MAINTENANCE_STATUS).optional(),
    contractor: z.string().optional(),
    contractorStatus: z.nativeEnum(CONTRACTOR_STATUS).optional(),
    assignedDate: z.union([z.string(), z.date()]).optional(),
    scheduledDate: z.union([z.string(), z.date()]).optional(),
    scheduledTime: z.string().optional(),
    scheduleNotes: z.string().optional(),
    startedAt: z.union([z.string(), z.date()]).optional(),
    paidBy: z.nativeEnum(MAINTENANCE_PAID_BY).optional(),
    invoiceAmount: z.coerce.number().optional(),
    invoiceAmounts: z.coerce.number().optional(),
    invoiceNotes: z.string().optional(),
    notes: z.string().optional(),
    certificates: z.union([z.string(), z.array(z.string())]).optional(),
    completionPhotos: z.union([z.string(), z.array(z.string())]).optional(),
    completionNotes: z.string().optional(),
    completedAt: z.union([z.string(), z.date()]).optional(),
    cancellationReason: z.string().optional(),
  }),
});

const assignContractorZodSchema = z.object({
  body: z.object({
    contractor: z.string({ required_error: "Contractor ID is required" }),
    contractorStatus: z
      .nativeEnum(CONTRACTOR_STATUS)
      .optional()
      .default(CONTRACTOR_STATUS.PENDING),
    notes: z.string().optional(),
  }),
});

const scheduleVisitZodSchema = z.object({
  body: z.object({
    visitDate: z.union([z.string(), z.date()], {
      required_error: "Visit date is required",
    }),
    visitTime: z.string({ required_error: "Visit time is required" }),
    notes: z.string().optional(),
  }),
});

const submitInvoiceZodSchema = z.object({
  body: z.object({
    invoiceAmount: z.coerce
      .number({ required_error: "Invoice amount is required" })
      .min(0, "Invoice amount cannot be negative"),
    invoiceNotes: z.string().optional(),
    notes: z.string().optional(),
    certificates: z.union([z.string(), z.array(z.string())]).optional(),
    completionPhotos: z.union([z.string(), z.array(z.string())]).optional(),
    completionNotes: z.string().optional(),
  }),
});

const cancelMaintenanceZodSchema = z.object({
  body: z.object({
    cancellationReason: z.string().optional(),
  }),
});

const updateMaintenanceStatusZodSchema = z.object({
  body: z.object({
    status: z.nativeEnum(MAINTENANCE_STATUS, {
      required_error: "Status is required",
    }),
    notes: z.string().optional(),
    completionPhotos: z.union([z.string(), z.array(z.string())]).optional(),
    completionNotes: z.string().optional(),
    cancellationReason: z.string().optional(),
  }),
});

const payMaintenanceZodSchema = z.object({
  body: z.object({
    successUrl: z.string().optional(),
    cancelUrl: z.string().optional(),
    notes: z.string().optional(),
  }),
});

const rejectInvoiceZodSchema = z.object({
  body: z.object({
    rejectionReason: z
      .string({ required_error: "Rejection reason is required" })
      .min(1, "Rejection reason cannot be empty"),
  }),
});

export const MaintenanceValidation = {
  createMaintenanceZodSchema,
  updateMaintenanceZodSchema,
  assignContractorZodSchema,
  scheduleVisitZodSchema,
  submitInvoiceZodSchema,
  cancelMaintenanceZodSchema,
  updateMaintenanceStatusZodSchema,
  payMaintenanceZodSchema,
  rejectInvoiceZodSchema,
};
