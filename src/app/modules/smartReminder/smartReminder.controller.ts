import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { SmartReminderService } from "./smartReminder.service";

// 1. Create Smart Reminder
const createSmartReminder = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await SmartReminderService.createSmartReminderToDB(
    req.user,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Smart reminder created successfully",
    data: result,
  });
});

// 2. Get All Smart Reminders (with tabs: all, overdue, dueSoon, completed + property filter)
const getAllSmartReminders = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await SmartReminderService.getAllSmartRemindersFromDB(
    req.user,
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Smart reminders retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// 3. Get Smart Reminder Summary counts
const getSmartReminderSummary = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await SmartReminderService.getSmartReminderSummaryFromDB(
      req.user,
      req.query,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Smart reminders summary retrieved successfully",
      data: result,
    });
  },
);

// 4. Get Single Smart Reminder
const getSingleSmartReminder = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await SmartReminderService.getSingleSmartReminderFromDB(
      req.user,
      id,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Smart reminder retrieved successfully",
      data: result,
    });
  },
);

// 5. Update Smart Reminder
const updateSmartReminder = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await SmartReminderService.updateSmartReminderToDB(
    req.user,
    id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Smart reminder updated successfully",
    data: result,
  });
});

// 6. Delete Smart Reminder (Soft delete)
const deleteSmartReminder = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await SmartReminderService.deleteSmartReminderFromDB(
    req.user,
    id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Smart reminder deleted successfully",
    data: result,
  });
});

// 7. Test Trigger Notification for specific reminder
const testTriggerNotification = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await SmartReminderService.testTriggerNotification(
      req.user,
      id,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: result.message,
      data: result.reminder,
    });
  },
);

export const SmartReminderController = {
  createSmartReminder,
  getAllSmartReminders,
  getSmartReminderSummary,
  getSingleSmartReminder,
  updateSmartReminder,
  deleteSmartReminder,
  testTriggerNotification,
};
