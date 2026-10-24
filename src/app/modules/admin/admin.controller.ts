import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AdminService } from "./admin.service";

const getAdminDashboardData = catchAsync(
  async (req: Request, res: Response) => {
    const result = await AdminService.getAdminDashboardDataFromDB();

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Admin dashboard data retrieved successfully",
      data: result,
    });
  },
);

export const AdminController = {
  getAdminDashboardData,
};
