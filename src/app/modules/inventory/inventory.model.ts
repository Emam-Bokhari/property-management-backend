import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { INVENTORY_CONDITION } from "./inventory.constant";
import {
  InventoryItemModel,
  InventoryModel,
  InventoryRoomModel,
  TInventory,
  TInventoryItem,
  TInventoryRoom,
} from "./inventory.interface";

// 1. Inventory Room Schema
const inventoryRoomSchema = new Schema<TInventoryRoom, InventoryRoomModel>(
  {
    flat: {
      type: Schema.Types.ObjectId,
      ref: "Flat",
      required: true,
      index: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
    },
    roomSize: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

inventoryRoomSchema.plugin(softDeletePlugin);

export const InventoryRoom = model<TInventoryRoom, InventoryRoomModel>(
  "InventoryRoom",
  inventoryRoomSchema,
);

// 2. Inventory Item Schema
const inventoryItemSchema = new Schema<TInventoryItem, InventoryItemModel>(
  {
    flat: {
      type: Schema.Types.ObjectId,
      ref: "Flat",
      required: true,
      index: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    room: {
      type: Schema.Types.ObjectId,
      ref: "InventoryRoom",
      required: true,
      index: true,
    },
    roomName: {
      type: String,
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
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

inventoryItemSchema.plugin(softDeletePlugin);

export const InventoryItem = model<TInventoryItem, InventoryItemModel>(
  "InventoryItem",
  inventoryItemSchema,
);

// Backward compatibility
export const Inventory = model<TInventory, InventoryModel>(
  "Inventory",
  inventoryItemSchema,
);
