import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { VISIBILITY_SCOPE } from "./announcement.constant";
import { AnnouncementModel, TAnnouncement } from "./announcement.interface";

const announcementSchema = new Schema<TAnnouncement, AnnouncementModel>(
  {
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    flats: [
      {
        type: Schema.Types.ObjectId,
        ref: "Flat",
      },
    ],
    visibilityScope: {
      type: String,
      enum: Object.values(VISIBILITY_SCOPE),
      default: VISIBILITY_SCOPE.ENTIRE_PROPERTY,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

announcementSchema.plugin(softDeletePlugin);

export const Announcement = model<TAnnouncement, AnnouncementModel>(
  "Announcement",
  announcementSchema,
);
