import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { model, Schema } from "mongoose";
import { SmartReminderModel, TSmartReminder } from "./smartReminder.interface";

const smartReminderSchema = new Schema<TSmartReminder, SmartReminderModel>(
  {
    reminderType: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
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
