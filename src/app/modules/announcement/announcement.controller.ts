import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { AnnouncementService } from "./announcement.service";

const createAnnouncement = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await AnnouncementService.createAnnouncementToDB(
    userId,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Announcement created and sent successfully",
    data: result,
  });
});

const getAllAnnouncements = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await AnnouncementService.getAllAnnouncementsFromDB(
    user,
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Announcements retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getMyAnnouncements = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await AnnouncementService.getMyAnnouncementsForTenantFromDB(
    user,
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Tenant announcements retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getSingleAnnouncement = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const { id } = req.params;
    if (!user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await AnnouncementService.getSingleAnnouncementFromDB(
      user,
      id,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Announcement retrieved successfully",
      data: result,
    });
  },
);

const updateAnnouncement = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await AnnouncementService.updateAnnouncementToDB(
    user,
    id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Announcement updated successfully",
    data: result,
  });
});

const deleteAnnouncement = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await AnnouncementService.deleteAnnouncementFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Announcement deleted successfully",
    data: result,
  });
});

const getPropertyFlatsForAnnouncement = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { propertyId } = req.params;
    if (!userId) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result =
      await AnnouncementService.getPropertyFlatsForAnnouncementFromDB(
        userId,
        propertyId,
      );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Property flats with status retrieved successfully",
      data: result,
    });
  },
);

export const AnnouncementController = {
  createAnnouncement,
  getAllAnnouncements,
  getMyAnnouncements,
  getSingleAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getPropertyFlatsForAnnouncement,
};
