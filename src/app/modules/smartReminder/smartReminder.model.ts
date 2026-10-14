import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { model, Schema } from "mongoose";
import { SmartReminderModel, TSmartReminder } from "./smartReminder.interface";
import { REMINDER_STATUS, REMINDER_TYPE } from "./smartReminder.constant";

const smartReminderSchema = new Schema<TSmartReminder, SmartReminderModel>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    reminderType: {
      type: String,
      enum: Object.values(REMINDER_TYPE),
      required: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
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
