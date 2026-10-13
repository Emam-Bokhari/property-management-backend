import { Types } from "mongoose";
import { INVENTORY_CONDITION } from "./inventory.constant";



export type TInventory = {
    flat: Types.ObjectId;
    property: Types.ObjectId;
    roomName: string;
    roomSize?: number;
    itemName: string;
    itemPhotos?: string[];
    quantity: number;
    warrantyExpiry?: Date;
    purchasedDate?: Date;
    condition: INVENTORY_CONDITION;
    inspectionPhotos?: string[];
    inspectionNotes?: string;
}
