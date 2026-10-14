import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { REMINDER_STATUS, REMINDER_TYPE } from "./smartReminder.constant";

export type TReminderType = (typeof REMINDER_TYPE)[keyof typeof REMINDER_TYPE];
export type TReminderStatus =
  (typeof REMINDER_STATUS)[keyof typeof REMINDER_STATUS];

export type TSmartReminder = {
  title: string;
  reminderType: TReminderType;
  property: Types.ObjectId;
  dueDate: Date;
  status: TReminderStatus;
  note?: string;
};

export type SmartReminderModel = ISoftDeleteModel<TSmartReminder>;
