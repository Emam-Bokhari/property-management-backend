import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { AppOptionType } from "./appOption.constant";
import { AppOptionModel, TAppOption } from "./appOption.interface";

const appOptionSchema = new Schema<TAppOption, AppOptionModel>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

appOptionSchema.plugin(softDeletePlugin);

export const AppOption = model<TAppOption, AppOptionModel>(
  "AppOption",
  appOptionSchema,
);
