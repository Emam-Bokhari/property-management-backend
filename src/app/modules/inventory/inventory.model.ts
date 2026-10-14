import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { INVENTORY_CONDITION } from "./inventory.constant";
import { InventoryModel, TInventory } from "./inventory.interface";

const inventorySchema = new Schema<TInventory, InventoryModel>(
  {
    flat: {
      type: Schema.Types.ObjectId,
      ref: "Flat",
      required: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
    },
    roomSize: {
      type: Number,
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    itemPhotos: [
      {
        type: String,
      },
    ],
    quantity: {
      type: Number,
      required: true,
      default: 1,
    },
    warrantyExpiry: {
      type: Date,
    },
    purchasedDate: {
      type: Date,
    },
    condition: {
      type: String,
      enum: Object.values(INVENTORY_CONDITION),
      default: INVENTORY_CONDITION.PASS,
      required: true,
    },
    inspectionPhotos: [
      {
        type: String,
      },
    ],
    inspectionNotes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

inventorySchema.plugin(softDeletePlugin);

export const Inventory = model<TInventory, InventoryModel>(
  "Inventory",
  inventorySchema,
);
