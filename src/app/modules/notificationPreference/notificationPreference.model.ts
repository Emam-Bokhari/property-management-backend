import { model, Schema } from "mongoose";
import {
  INotificationPreference,
  NotificationPreferenceModel,
} from "./notificationPreference.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";

const notificationPreferenceSchema = new Schema<
  INotificationPreference,
  NotificationPreferenceModel
>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // Event preferences matching UI settings
    rentReminders: {
      type: Boolean,
      default: true,
    },
    maintenanceUpdates: {
      type: Boolean,
      default: true,
    },
    complianceAlerts: {
      type: Boolean,
      default: true,
    },
    newMessages: {
      type: Boolean,
      default: true,
    },
    jobUpdates: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        delete ret.id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        delete ret.id;
        return ret;
      },
    },
  },
);

notificationPreferenceSchema.plugin(softDeletePlugin);

export const NotificationPreference = model<
  INotificationPreference,
  NotificationPreferenceModel
>("NotificationPreference", notificationPreferenceSchema);
