import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { REMINDER_STATUS } from "./smartReminder.constant";

export type TReminderStatus =
  (typeof REMINDER_STATUS)[keyof typeof REMINDER_STATUS];

export type TSmartReminder = {
  title: string;
  property: Types.ObjectId;
  landlord: Types.ObjectId;
  dueDate: Date;
  status: TReminderStatus;
  note?: string;
  isNotified?: boolean;
  isDeleted?: boolean;
  deletedAt?: Date;
};

export type SmartReminderModel = ISoftDeleteModel<TSmartReminder>;
