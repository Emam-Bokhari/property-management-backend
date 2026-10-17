import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { INVENTORY_CONDITION } from "./inventory.constant";

export type TInventoryRoom = {
  _id?: Types.ObjectId;
  flat: Types.ObjectId;
  property: Types.ObjectId;
  landlord?: Types.ObjectId;
  roomName: string;
  roomSize?: number;
  itemsCount?: number;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type InventoryRoomModel = ISoftDeleteModel<TInventoryRoom>;

export type TInventoryItem = {
  _id?: Types.ObjectId;
  flat: Types.ObjectId;
  property: Types.ObjectId;
  landlord?: Types.ObjectId;
  room: Types.ObjectId;
  roomName?: string;
  roomSize?: number;
  itemName: string;
  itemPhotos?: string[];
  quantity: number;
  condition: INVENTORY_CONDITION;
  warrantyExpiry?: Date | string;
  purchasedDate?: Date | string;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type InventoryItemModel = ISoftDeleteModel<TInventoryItem>;

// Backward compatibility alias
export type TInventory = TInventoryItem;
export type InventoryModel = InventoryItemModel;
