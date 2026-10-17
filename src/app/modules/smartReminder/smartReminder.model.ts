import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { model, Schema } from "mongoose";
import { SmartReminderModel, TSmartReminder } from "./smartReminder.interface";
import { REMINDER_STATUS } from "./smartReminder.constant";

const smartReminderSchema = new Schema<TSmartReminder, SmartReminderModel>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(REMINDER_STATUS),
      default: REMINDER_STATUS.PENDING,
      required: true,
    },
    note: {
      type: String,
      trim: true,
    },
    isNotified: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

smartReminderSchema.plugin(softDeletePlugin);

export const SmartReminder = model<TSmartReminder, SmartReminderModel>(
  "SmartReminder",
  smartReminderSchema,
);
