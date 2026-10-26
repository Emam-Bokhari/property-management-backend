import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AdminService } from "./admin.service";

// 1. Existing Dashboard summary stats
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

// 2. Monthly Revenue - Landlord subscription income
const getMonthlyRevenue = catchAsync(async (req: Request, res: Response) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const result = await AdminService.getMonthlyRevenueFromDB(year);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Monthly revenue retrieved successfully",
    data: result,
  });
});

// 3. User Growth - Registered landlords, tenants & contractors
const getUserGrowth = catchAsync(async (req: Request, res: Response) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const result = await AdminService.getUserGrowthFromDB(year);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User growth retrieved successfully",
    data: result,
  });
});

export const AdminController = {
  getAdminDashboardData,
  getMonthlyRevenue,
  getUserGrowth,
};
