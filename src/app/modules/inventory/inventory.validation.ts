import { z } from "zod";
import { INVENTORY_CONDITION } from "./inventory.constant";

const createInventoryZodSchema = z.object({
  body: z.object({
    flat: z.string({ required_error: "Flat ID is required" }),
    property: z.string({ required_error: "Property ID is required" }),
    roomName: z
      .string({ required_error: "Room name is required" })
      .min(1, "Room name cannot be empty"),
    roomSize: z.number().optional(),
    itemName: z
      .string({ required_error: "Item name is required" })
      .min(1, "Item name cannot be empty"),
    itemPhotos: z.array(z.string()).optional(),
    quantity: z.number().min(1, "Quantity must be at least 1").default(1),
    warrantyExpiry: z.union([z.string(), z.date()]).optional(),
    purchasedDate: z.union([z.string(), z.date()]).optional(),
    condition: z
      .nativeEnum(INVENTORY_CONDITION, {
        required_error: "Condition is required",
      })
      .default(INVENTORY_CONDITION.PASS),
    inspectionPhotos: z.array(z.string()).optional(),
    inspectionNotes: z.string().optional(),
  }),
});

const updateInventoryZodSchema = z.object({
  body: z.object({
    flat: z.string().optional(),
    property: z.string().optional(),
    roomName: z.string().min(1, "Room name cannot be empty").optional(),
    roomSize: z.number().optional(),
    itemName: z.string().min(1, "Item name cannot be empty").optional(),
    itemPhotos: z.array(z.string()).optional(),
    quantity: z.number().min(1).optional(),
    warrantyExpiry: z.union([z.string(), z.date()]).optional(),
    purchasedDate: z.union([z.string(), z.date()]).optional(),
    condition: z.nativeEnum(INVENTORY_CONDITION).optional(),
    inspectionPhotos: z.array(z.string()).optional(),
    inspectionNotes: z.string().optional(),
  }),
});

export const InventoryValidation = {
  createInventoryZodSchema,
  updateInventoryZodSchema,
};
