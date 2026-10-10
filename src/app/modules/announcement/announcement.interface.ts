import { Types } from "mongoose"
import { VISIBILITY_SCOPE } from "./announcement.constant";

export type TAnnouncement = {
    property: Types.ObjectId;
    flats?: Types.ObjectId[];
    visibilityScope: VISIBILITY_SCOPE;
    title: string;
    message: string;
    image?: string;
} 