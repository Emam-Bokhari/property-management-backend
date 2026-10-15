import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { INVENTORY_CONDITION } from "./inventory.constant";

export type TInventory = {
  flat: Types.ObjectId;
  property: Types.ObjectId;
  roomName: string;
  roomSize?: number;
  itemName: string;
  itemPhotos?: string[];
  quantity: number;
  warrantyExpiry?: Date | string;
  purchasedDate?: Date | string;
  condition: INVENTORY_CONDITION;
  inspectionPhotos?: string[];
  inspectionNotes?: string;
};

export type InventoryModel = ISoftDeleteModel<TInventory>;