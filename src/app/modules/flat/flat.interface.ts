import { Types } from "mongoose";

export type TKey = {
    keyType: string;
    quantity: number;
    location: string;
    heldBy: string;
}


export type TFalt = {
    unitName: string;
    rentPerMonth: number;
    beds?: number;
    baths?: number;
    sqft?: number;
    floor: number;
    floorNote?: string;
    unitType?: string;
    furnished?: string;
    property: Types.ObjectId;
    key: TKey[];
}