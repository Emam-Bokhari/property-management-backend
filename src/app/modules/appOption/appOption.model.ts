import { AppOptionType } from "./appOption.constant";
import { model, Schema } from "mongoose";
import { TAppOption } from "./appOption.interface";

const appOptionSchema = new Schema<TAppOption>({
    name: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: Object.values(AppOptionType),
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
    versionKey: false,
});

export const AppOption = model<TAppOption>("AppOption", appOptionSchema);