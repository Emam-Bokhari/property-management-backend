import { ISoftDeleteModel } from "../../../types/softDelete";
import { Model, Types } from "mongoose";

export type INotification = {
  title: string;
  text: string;
  receiver?: Types.ObjectId | string;
  sender?: Types.ObjectId | string;
  read: boolean;
  referenceId?: Types.ObjectId | string;
  referenceModel?:
    | "Property"
    | "Flat"
    | "Tenancy"
    | "Maintenance"
    | "Contractor"
    | "SmartReminder"
    | "Bill"
    | "Inspection"
    | "Inventory"
    | "User"
    | "Subscription"
    | "Transaction"
    | "Support"
    | "Chat"
    | "Message"
    | "Broadcast"
    | "Announcement"
    | "Package"
    | "Review"
    | "Store"
    | "Product"
    | "Service"
    | "Advertisement";
  type?: string;
  isDeleted?: boolean;
  deletedAt?: Date | null;
};

export type NotificationModel = ISoftDeleteModel<INotification>;
