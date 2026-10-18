import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { StatusCodes } from "http-status-codes";
import { BroadcastServices } from "./broadcast.service";

// 1. Send push broadcast notification
const sendBroadcast = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const result = await BroadcastServices.sendBroadcastToLandlords(
    user,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Push notification broadcast sent successfully",
    data: result,
  });
});

// 2. Get broadcast history for admin
const getBroadcasts = catchAsync(async (req: Request, res: Response) => {
  const result = await BroadcastServices.getBroadcastsFromDB(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Broadcast history retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});

// 3. Get single broadcast details
const getSingleBroadcast = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await BroadcastServices.getSingleBroadcastFromDB(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Broadcast retrieved successfully",
    data: result,
  });
});

// 4. Delete broadcast from history
const deleteBroadcast = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await BroadcastServices.deleteBroadcastFromDB(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Broadcast deleted successfully",
    data: result,
  });
});

// 5. Get landlords list for audience dropdown / selection
const getLandlordsList = catchAsync(async (req: Request, res: Response) => {
  const result = await BroadcastServices.getLandlordsListForSelect(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Landlords list retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});

export const BroadcastController = {
  sendBroadcast,
  getBroadcasts,
  getSingleBroadcast,
  deleteBroadcast,
  getLandlordsList,
};
