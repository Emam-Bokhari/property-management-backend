import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";

export interface INotificationPreference {
  userId: Types.ObjectId;

  // Real estate role preferences (matching UI screenshots)
  // Landlord: rentReminders, maintenanceUpdates, complianceAlerts
  // Tenant: maintenanceUpdates, newMessages, rentReminders
  // Contractor: jobUpdates, newMessages
  rentReminders: boolean;
  maintenanceUpdates: boolean;
  complianceAlerts: boolean;
  newMessages: boolean;
  jobUpdates: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export type NotificationPreferenceModel =
  ISoftDeleteModel<INotificationPreference>;
