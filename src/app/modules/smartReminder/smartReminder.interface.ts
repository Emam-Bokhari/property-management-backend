import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";

export type TSmartReminder = {
  reminderType: string;
  title: string;
  property: Types.ObjectId;
  dueDate: Date | string;
};

export type SmartReminderModel = ISoftDeleteModel<TSmartReminder>;
