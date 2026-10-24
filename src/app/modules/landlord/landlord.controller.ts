import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { LandlordService } from "./landlord.service";

const getLandlordHomeDashboard = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await LandlordService.getLandlordHomeDashboardFromDB(
      req.user,
      req.query,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Landlord home dashboard data retrieved successfully",
      data: result,
    });
  },
);

export const LandlordController = {
  getLandlordHomeDashboard,
};
