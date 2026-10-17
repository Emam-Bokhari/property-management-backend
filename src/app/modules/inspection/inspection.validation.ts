import { z } from "zod";
import {
  INSPECTION_STATUS,
  ROOM_INSPECTION_STATUS,
} from "./inspection.constant";

const roomChecklistItemZodSchema = z.object({
  room: z.string().optional(),
  roomName: z.string({ required_error: "Room name is required" }),
  status: z
    .nativeEnum(ROOM_INSPECTION_STATUS)
    .default(ROOM_INSPECTION_STATUS.PASS),
  defectNotes: z.string().optional(),
  repairLogged: z.boolean().optional().default(false),
  maintenanceJob: z.string().optional(),
});

const createInspectionZodSchema = z.object({
  body: z.object({
    property: z.string({ required_error: "Property ID is required" }),
    flat: z.string().optional().nullable(),
    isCommunalArea: z.boolean().optional().default(false),
    areaName: z
      .string({ required_error: "Area or Flat name is required" })
      .min(1, "Area name cannot be empty"),
    inspectionDate: z.union([z.string(), z.date()]).optional(),
    roomChecklist: z.array(roomChecklistItemZodSchema).default([]),
    notes: z.string().optional(),
    inspectionPhotos: z.array(z.string()).optional(),
    status: z
      .nativeEnum(INSPECTION_STATUS)
      .default(INSPECTION_STATUS.COMPLETED),
  }),
});

const updateInspectionZodSchema = z.object({
  body: z.object({
    areaName: z.string().min(1).optional(),
    inspectionDate: z.union([z.string(), z.date()]).optional(),
    roomChecklist: z.array(roomChecklistItemZodSchema).optional(),
    notes: z.string().optional(),
    inspectionPhotos: z.array(z.string()).optional(),
    status: z.nativeEnum(INSPECTION_STATUS).optional(),
  }),
});

const logRepairZodSchema = z.object({
  body: z.object({
    checklistItemId: z.string({
      required_error: "Checklist item ID is required",
    }),
    issueTitle: z.string().optional(),
    priority: z.string().optional(),
    description: z.string().optional(),
  }),
});

export const InspectionValidation = {
  createInspectionZodSchema,
  updateInspectionZodSchema,
  logRepairZodSchema,
};
