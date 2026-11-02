import mongoose, { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { SmartReminder } from "./smartReminder.model";
import { TSmartReminder } from "./smartReminder.interface";
import {
  REMINDER_STATUS,
  smartReminderSearchableFields,
} from "./smartReminder.constant";
import { Property } from "../property/property.model";
import { USER_ROLES } from "../../../enums/user";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import { logger } from "../../../shared/logger";
import colors from "colors";

// Helper function to format and compute reminder status text & days
const enhanceReminderData = (item: any) => {
  const reminderObj = item.toObject ? item.toObject() : { ...item };
  const now = new Date();
  const dueDate = new Date(reminderObj.dueDate);

  // Difference in whole days
  const diffTime = now.getTime() - dueDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const isOverdue =
    diffDays > 0 && reminderObj.status !== REMINDER_STATUS.COMPLETED;

  let statusText = "";
  if (reminderObj.status === REMINDER_STATUS.COMPLETED) {
    statusText = "Completed";
  } else if (diffDays > 0) {
    statusText = `${diffDays} ${diffDays === 1 ? "day" : "days"} late`;
  } else if (diffDays === 0) {
    statusText = "Due today";
  } else {
    const daysRemaining = Math.abs(diffDays);
    statusText = `Due in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`;
  }

  return {
    ...reminderObj,
    isOverdue,
    daysLate: diffDays > 0 ? diffDays : 0,
    daysRemaining: diffDays < 0 ? Math.abs(diffDays) : 0,
    statusText,
  };
};

// 1. Create Smart Reminder
const createSmartReminderToDB = async (
  user: any,
  payload: Partial<TSmartReminder>,
) => {
  const userId = typeof user === "string" ? user : user.id;
  const userRole = typeof user === "string" ? USER_ROLES.LANDLORD : user.role;

  if (
    userRole !== USER_ROLES.LANDLORD &&
    userRole !== USER_ROLES.ADMIN &&
    userRole !== USER_ROLES.SUPER_ADMIN
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Only landlords and admins can create smart reminders",
    );
  }

  if (
    !payload.property ||
    !mongoose.Types.ObjectId.isValid(String(payload.property))
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Valid Property ID is required",
    );
  }

  // Validate property exists
  const property = await Property.findById(payload.property);
  if (!property) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  // If landlord, verify property belongs to them
  if (
    userRole === USER_ROLES.LANDLORD &&
    property.landlord &&
    property.landlord.toString() !== userId
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to create a reminder for this property",
    );
  }

  // Set landlord to the authenticated user (or property landlord)
  payload.landlord = new Types.ObjectId(userId);
  payload.property = new Types.ObjectId(String(payload.property));
  if (!payload.status) {
    payload.status = REMINDER_STATUS.PENDING;
  }
  payload.isNotified = false;

  const result = await SmartReminder.create(payload);

  const populated = await SmartReminder.findById(result._id).populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode propertyPhotos",
    },
    {
      path: "landlord",
      select: "firstName lastName email role profileImage",
    },
  ]);

  // If the due date is already reached or in the past, trigger push notification immediately
  const now = new Date();
  if (new Date(result.dueDate) <= now) {
    try {
      await sendNotifications({
        receiver: payload.landlord,
        title: `Smart Reminder: ${result.title}`,
        text: `Your reminder for ${property.propertyName} is due today!`,
        type: NOTIFICATION_TYPE.COMPLIANCE_ALERT,
        referenceId: result._id,
        referenceModel: "SmartReminder",
      });

      result.isNotified = true;
      result.status = REMINDER_STATUS.OVERDUE;
      await result.save();
    } catch (notifErr) {
      logger.error(
        colors.yellow("Failed to send immediate notification on creation:"),
        notifErr,
      );
    }
  }

  return enhanceReminderData(populated || result);
};

// 2. Get All Smart Reminders (with tabs: all, overdue, dueSoon, completed + property filter)
const getAllSmartRemindersFromDB = async (
  user: any,
  query: Record<string, unknown>,
) => {
  const userId = typeof user === "string" ? user : user.id;
  const userRole = typeof user === "string" ? USER_ROLES.LANDLORD : user.role;

  const filter: Record<string, any> = {};

  // SaaS scoping: Landlords only see their own smart reminders
  if (userRole === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(userId);
  }

  // Filter by property dropdown (e.g. from "All Properties")
  if (
    query.property &&
    mongoose.Types.ObjectId.isValid(String(query.property))
  ) {
    filter.property = new Types.ObjectId(String(query.property));
  }

  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Calculate summary counts for tabs (based on landlord and optional property filter)
  const baseFilter = { ...filter };

  const [allCount, overdueCount, dueSoonCount] = await Promise.all([
    SmartReminder.countDocuments({ ...baseFilter, isDeleted: { $ne: true } }),
    SmartReminder.countDocuments({
      ...baseFilter,
      dueDate: { $lt: now },
      status: { $ne: REMINDER_STATUS.COMPLETED },
      isDeleted: { $ne: true },
    }),
    SmartReminder.countDocuments({
      ...baseFilter,
      dueDate: { $gte: now, $lte: thirtyDaysLater },
      status: { $ne: REMINDER_STATUS.COMPLETED },
      isDeleted: { $ne: true },
    }),
  ]);

  // Tab filtering: all | overdue | dueSoon | completed
  const tab = (query.tab as string)?.toLowerCase();
  const queryStatus = (query.status as string)?.toLowerCase();
  if (tab === "overdue" || queryStatus === REMINDER_STATUS.OVERDUE) {
    filter.dueDate = { $lt: now };
    filter.status = { $ne: REMINDER_STATUS.COMPLETED };
  } else if (tab === "duesoon") {
    filter.dueDate = { $gte: now, $lte: thirtyDaysLater };
    filter.status = { $ne: REMINDER_STATUS.COMPLETED };
  } else if (tab === "completed" || queryStatus === REMINDER_STATUS.COMPLETED) {
    filter.status = REMINDER_STATUS.COMPLETED;
  }

  // Remove tab from query copy so QueryBuilder filter() doesn't fail
  const queryCopy = { ...query };
  delete queryCopy.tab;
  delete queryCopy.property;

  const baseQuery = SmartReminder.find(filter).populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode propertyPhotos",
    },
    {
      path: "landlord",
      select: "firstName lastName email role profileImage",
    },
  ]);

  const queryBuilder = new QueryBuilder(baseQuery, queryCopy)
    .search(smartReminderSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [reminders, meta] = await Promise.all([
    queryBuilder.modelQuery,
    queryBuilder.countTotal(),
  ]);

  const enhancedData = reminders.map((item) => enhanceReminderData(item));

  return {
    meta: {
      ...meta,
      summary: {
        all: allCount,
        overdue: overdueCount,
        dueSoon: dueSoonCount,
      },
    },
    data: enhancedData,
  };
};

// 3. Get Summary stats directly
const getSmartReminderSummaryFromDB = async (
  user: any,
  query: Record<string, unknown>,
) => {
  const userId = typeof user === "string" ? user : user.id;
  const userRole = typeof user === "string" ? USER_ROLES.LANDLORD : user.role;

  const filter: Record<string, any> = {};
  if (userRole === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(userId);
  }
  if (
    query.property &&
    mongoose.Types.ObjectId.isValid(String(query.property))
  ) {
    filter.property = new Types.ObjectId(String(query.property));
  }

  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [all, overdue, dueSoon] = await Promise.all([
    SmartReminder.countDocuments({ ...filter, isDeleted: { $ne: true } }),
    SmartReminder.countDocuments({
      ...filter,
      dueDate: { $lt: now },
      status: { $ne: REMINDER_STATUS.COMPLETED },
      isDeleted: { $ne: true },
    }),
    SmartReminder.countDocuments({
      ...filter,
      dueDate: { $gte: now, $lte: thirtyDaysLater },
      status: { $ne: REMINDER_STATUS.COMPLETED },
      isDeleted: { $ne: true },
    }),
  ]);

  return { all, overdue, dueSoon };
};

// 4. Get Single Smart Reminder
const getSingleSmartReminderFromDB = async (user: any, id: string) => {
  const userId = typeof user === "string" ? user : user.id;
  const userRole = typeof user === "string" ? USER_ROLES.LANDLORD : user.role;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid reminder ID");
  }

  const filter: Record<string, any> = { _id: id };
  if (userRole === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(userId);
  }

  const reminder = await SmartReminder.findOne(filter).populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode propertyPhotos city country",
    },
    {
      path: "landlord",
      select: "firstName lastName email role profileImage",
    },
  ]);

  if (!reminder) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Smart reminder not found");
  }

  return enhanceReminderData(reminder);
};

// 5. Update Smart Reminder
const updateSmartReminderToDB = async (
  user: any,
  id: string,
  payload: Partial<TSmartReminder>,
) => {
  const userId = typeof user === "string" ? user : user.id;
  const userRole = typeof user === "string" ? USER_ROLES.LANDLORD : user.role;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid reminder ID");
  }

  const filter: Record<string, any> = { _id: id };
  if (userRole === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(userId);
  }

  const reminder = await SmartReminder.findOne(filter);
  if (!reminder) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Smart reminder not found or unauthorized",
    );
  }

  // If dueDate updated to future date, reset isNotified so alarm can fire again
  if (payload.dueDate) {
    const newDueDate = new Date(payload.dueDate);
    if (newDueDate > new Date()) {
      payload.isNotified = false;
      if (!payload.status) {
        payload.status = REMINDER_STATUS.PENDING;
      }
    }
  }

  // Optional property update check
  if (payload.property) {
    if (!mongoose.Types.ObjectId.isValid(String(payload.property))) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid Property ID");
    }
    const prop = await Property.findById(payload.property);
    if (!prop) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
    }
    payload.property = new Types.ObjectId(String(payload.property));
  }

  const updated = await SmartReminder.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  }).populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode propertyPhotos",
    },
    {
      path: "landlord",
      select: "firstName lastName email role profileImage",
    },
  ]);

  return enhanceReminderData(updated);
};

// 6. Delete Smart Reminder (Soft delete)
const deleteSmartReminderFromDB = async (user: any, id: string) => {
  const userId = typeof user === "string" ? user : user.id;
  const userRole = typeof user === "string" ? USER_ROLES.LANDLORD : user.role;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid reminder ID");
  }

  const filter: Record<string, any> = { _id: id };
  if (userRole === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(userId);
  }

  const reminder = await SmartReminder.findOne(filter);
  if (!reminder) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Smart reminder not found or unauthorized",
    );
  }

  const result = await SmartReminder.softDeleteById(id);
  return result;
};

// 7. Core Cron/Dispatcher: Check and send push notifications for due reminders
const checkAndSendDueReminders = async () => {
  const now = new Date();

  // Find all unnotified reminders whose dueDate is now or in the past
  const dueReminders = await SmartReminder.find({
    isNotified: { $ne: true },
    status: { $ne: REMINDER_STATUS.COMPLETED },
    dueDate: { $lte: now },
    isDeleted: { $ne: true },
  }).populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode",
    },
  ]);

  if (!dueReminders || dueReminders.length === 0) {
    return { notifiedCount: 0 };
  }

  logger.info(
    colors.cyan(
      `🔔 [SmartReminder Cron] Found ${dueReminders.length} due reminders to dispatch.`,
    ),
  );

  let notifiedCount = 0;

  for (const reminder of dueReminders) {
    try {
      const propertyName =
        (reminder.property as any)?.propertyName || "your property";

      const title = `Smart Reminder: ${reminder.title}`;
      const body = `Your reminder for ${propertyName} is due today!`;

      // Dispatch Push Notification exclusively to the landlord
      await sendNotifications({
        receiver: reminder.landlord,
        title,
        text: body,
        type: NOTIFICATION_TYPE.COMPLIANCE_ALERT,
        referenceId: reminder._id,
        referenceModel: "SmartReminder",
      });

      // Emit real-time socket event if landlord is currently active
      //@ts-ignore
      const socketIo = global.io;
      if (socketIo) {
        socketIo.emit(`send-notification::${reminder.landlord}`, {
          title,
          text: body,
          type: NOTIFICATION_TYPE.COMPLIANCE_ALERT,
          reminderId: reminder._id,
          createdAt: new Date(),
        });
      }

      // Mark as notified and set status to OVERDUE if pending
      reminder.isNotified = true;
      if (reminder.status === REMINDER_STATUS.PENDING) {
        reminder.status = REMINDER_STATUS.OVERDUE;
      }
      await (reminder as any).save();

      notifiedCount++;
    } catch (err) {
      logger.error(
        colors.red(
          `❌ Failed to dispatch push notification for reminder ${reminder._id}:`,
        ),
        err,
      );
    }
  }

  logger.info(
    colors.green(
      `✅ [SmartReminder Cron] Dispatched push notifications for ${notifiedCount} reminders.`,
    ),
  );

  return { notifiedCount };
};

// 8. Manual Trigger/Test Notification for a specific reminder
const testTriggerNotification = async (user: any, id: string) => {
  const userId = typeof user === "string" ? user : user.id;
  const userRole = typeof user === "string" ? USER_ROLES.LANDLORD : user.role;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid reminder ID");
  }

  const filter: Record<string, any> = { _id: id };
  if (userRole === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(userId);
  }

  const reminder = await SmartReminder.findOne(filter).populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode",
    },
  ]);

  if (!reminder) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Smart reminder not found");
  }

  const propertyName =
    (reminder.property as any)?.propertyName || "your property";

  const title = `Smart Reminder: ${reminder.title}`;
  const body = `Your reminder for ${propertyName} is due today!`;

  await sendNotifications({
    receiver: reminder.landlord,
    title,
    text: body,
    type: NOTIFICATION_TYPE.COMPLIANCE_ALERT,
    referenceId: reminder._id,
    referenceModel: "SmartReminder",
  });

  //@ts-ignore
  const socketIo = global.io;
  if (socketIo) {
    socketIo.emit(`send-notification::${reminder.landlord}`, {
      title,
      text: body,
      type: NOTIFICATION_TYPE.COMPLIANCE_ALERT,
      reminderId: reminder._id,
      createdAt: new Date(),
    });
  }

  reminder.isNotified = true;
  await reminder.save();

  return {
    success: true,
    message: `Push notification sent to landlord for reminder "${reminder.title}"`,
    reminder: enhanceReminderData(reminder),
  };
};

export const SmartReminderService = {
  createSmartReminderToDB,
  getAllSmartRemindersFromDB,
  getSmartReminderSummaryFromDB,
  getSingleSmartReminderFromDB,
  updateSmartReminderToDB,
  deleteSmartReminderFromDB,
  checkAndSendDueReminders,
  testTriggerNotification,
};
