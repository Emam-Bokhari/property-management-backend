import { z } from "zod";
import { INVENTORY_CONDITION } from "./inventory.constant";

// 1. Room Validations
const createRoomZodSchema = z.object({
  body: z.object({
    property: z.string({ required_error: "Property ID is required" }),
    flat: z.string({ required_error: "Flat ID is required" }),
    roomName: z
      .string({ required_error: "Room name is required" })
      .min(1, "Room name cannot be empty"),
    roomSize: z.coerce.number().optional().default(0),
  }),
});

const updateRoomZodSchema = z.object({
  body: z.object({
    roomName: z.string().min(1, "Room name cannot be empty").optional(),
    roomSize: z.coerce.number().optional(),
  }),
});

// 2. Item Validations
const createItemZodSchema = z.object({
  body: z.object({
    property: z.string({ required_error: "Property ID is required" }),
    flat: z.string({ required_error: "Flat ID is required" }),
    room: z.string({ required_error: "Room ID is required" }),
    itemName: z
      .string({ required_error: "Item name is required" })
      .min(1, "Item name cannot be empty"),
    itemPhotos: z.array(z.string()).optional(),
    quantity: z.coerce
      .number()
      .min(1, "Quantity must be at least 1")
      .default(1),
    warrantyExpiry: z.union([z.string(), z.date()]).optional(),
    purchasedDate: z.union([z.string(), z.date()]).optional(),
    condition: z
      .nativeEnum(INVENTORY_CONDITION, {
        required_error: "Condition is required",
      })
      .default(INVENTORY_CONDITION.PASS),
  }),
});

const updateItemZodSchema = z.object({
  body: z.object({
    room: z.string().optional(),
    itemName: z.string().min(1, "Item name cannot be empty").optional(),
    itemPhotos: z.array(z.string()).optional(),
    quantity: z.coerce.number().min(1).optional(),
    warrantyExpiry: z.union([z.string(), z.date()]).optional(),
    purchasedDate: z.union([z.string(), z.date()]).optional(),
    condition: z.nativeEnum(INVENTORY_CONDITION).optional(),
  }),
});

export const InventoryValidation = {
  createRoomZodSchema,
  updateRoomZodSchema,
  createItemZodSchema,
  updateItemZodSchema,
  // Backward compatibility alias
  createInventoryZodSchema: createItemZodSchema,
  updateInventoryZodSchema: updateItemZodSchema,
};
