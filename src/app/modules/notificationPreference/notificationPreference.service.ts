import { JwtPayload } from "jsonwebtoken";
import { USER_ROLES } from "../../../enums/user";
import { User } from "../user/user.model";
import { INotificationPreference } from "./notificationPreference.interface";
import { NotificationPreference } from "./notificationPreference.model";

// Helper to format role-specific preferences matching UI screenshots
const formatRoleNotificationPreferences = (
  preferenceDoc: any,
  userRole?: string,
) => {
  const plain = preferenceDoc?.toObject
    ? preferenceDoc.toObject()
    : preferenceDoc;

  // Normalized defaults in case DB has old records without new fields
  const safePref = {
    ...plain,
    rentReminders: plain?.rentReminders ?? true,
    maintenanceUpdates: plain?.maintenanceUpdates ?? true,
    complianceAlerts: plain?.complianceAlerts ?? true,
    newMessages: plain?.newMessages ?? true,
    jobUpdates: plain?.jobUpdates ?? true,
  };

  const normalizedRole = (userRole || "").toLowerCase();

  let rolePreferences: Record<string, boolean> = {};
  let settings: Array<{ key: string; label: string; value: boolean }> = [];

  switch (normalizedRole) {
    case USER_ROLES.LANDLORD:
      // 1st screenshot: Landlord
      rolePreferences = {
        rentReminders: safePref.rentReminders,
        maintenanceUpdates: safePref.maintenanceUpdates,
        complianceAlerts: safePref.complianceAlerts,
      };
      settings = [
        {
          key: "rentReminders",
          label: "Rent reminders",
          value: safePref.rentReminders,
        },
        {
          key: "maintenanceUpdates",
          label: "Maintenance updates",
          value: safePref.maintenanceUpdates,
        },
        {
          key: "complianceAlerts",
          label: "Compliance alerts",
          value: safePref.complianceAlerts,
        },
      ];
      break;

    case USER_ROLES.TENANT:
      // 2nd screenshot: Tenant
      rolePreferences = {
        maintenanceUpdates: safePref.maintenanceUpdates,
        newMessages: safePref.newMessages,
        rentReminders: safePref.rentReminders,
      };
      settings = [
        {
          key: "maintenanceUpdates",
          label: "Maintenance updates",
          value: safePref.maintenanceUpdates,
        },
        {
          key: "newMessages",
          label: "New messages",
          value: safePref.newMessages,
        },
        {
          key: "rentReminders",
          label: "Rent reminders",
          value: safePref.rentReminders,
        },
      ];
      break;

    case USER_ROLES.CONTRACTOR:
      // 3rd screenshot: Contractor
      rolePreferences = {
        jobUpdates: safePref.jobUpdates,
        newMessages: safePref.newMessages,
      };
      settings = [
        {
          key: "jobUpdates",
          label: "Job updates",
          value: safePref.jobUpdates,
        },
        {
          key: "newMessages",
          label: "New messages",
          value: safePref.newMessages,
        },
      ];
      break;

    default:
      // Admin or default view
      rolePreferences = {
        rentReminders: safePref.rentReminders,
        maintenanceUpdates: safePref.maintenanceUpdates,
        complianceAlerts: safePref.complianceAlerts,
        newMessages: safePref.newMessages,
        jobUpdates: safePref.jobUpdates,
      };
      settings = [
        {
          key: "rentReminders",
          label: "Rent reminders",
          value: safePref.rentReminders,
        },
        {
          key: "maintenanceUpdates",
          label: "Maintenance updates",
          value: safePref.maintenanceUpdates,
        },
        {
          key: "complianceAlerts",
          label: "Compliance alerts",
          value: safePref.complianceAlerts,
        },
        {
          key: "newMessages",
          label: "New messages",
          value: safePref.newMessages,
        },
        {
          key: "jobUpdates",
          label: "Job updates",
          value: safePref.jobUpdates,
        },
      ];
      break;
  }

  return {
    ...safePref,
    role: normalizedRole,
    rolePreferences,
    settings,
  };
};

// get notification preference by user (auto-creates if not found)
const getNotificationPreferenceByUser = async (user: JwtPayload) => {
  let userRole = user.role;
  if (!userRole) {
    const userDoc = await User.findById(user.id).select("role").lean();
    userRole = userDoc?.role;
  }

  let result = await NotificationPreference.findOne({ userId: user.id });

  if (!result) {
    result = await NotificationPreference.create({
      userId: user.id,
      rentReminders: true,
      maintenanceUpdates: true,
      complianceAlerts: true,
      newMessages: true,
      jobUpdates: true,
    });
  }

  return formatRoleNotificationPreferences(result, userRole);
};

// update notification preference (creates if not exists)
const updateNotificationPreference = async (
  user: JwtPayload,
  payload: Partial<INotificationPreference>,
) => {
  let userRole = user.role;
  if (!userRole) {
    const userDoc = await User.findById(user.id).select("role").lean();
    userRole = userDoc?.role;
  }

  const result = await NotificationPreference.findOneAndUpdate(
    { userId: user.id },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return formatRoleNotificationPreferences(result, userRole);
};

// delete notification preference
const deleteNotificationPreference = async (
  user: JwtPayload,
): Promise<INotificationPreference | null> => {
  const result = await NotificationPreference.findOneAndUpdate(
    { userId: user.id },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );
  return result;
};

export const NotificationPreferenceService = {
  getNotificationPreferenceByUser,
  updateNotificationPreference,
  deleteNotificationPreference,
  formatRoleNotificationPreferences,
};
