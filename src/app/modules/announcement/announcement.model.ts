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
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipients: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

announcementSchema.plugin(softDeletePlugin);

announcementSchema.index({ property: 1 });
announcementSchema.index({ landlord: 1 });
announcementSchema.index({ flats: 1 });
announcementSchema.index({ recipients: 1 });
announcementSchema.index({ createdAt: -1 });

export const Announcement = model<TAnnouncement, AnnouncementModel>(
  "Announcement",
  announcementSchema,
);
