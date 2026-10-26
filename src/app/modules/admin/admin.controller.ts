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

// 4. Transaction Summary Cards (Paying Landlords, Transactions, Total Collected)
const getTransactionStats = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getTransactionStatsFromDB(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Transaction summary stats retrieved successfully",
    data: result,
  });
});

// 5. Transactions List (Table with search, status tabs, date filter, pagination)
const getTransactions = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getTransactionsFromDB(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Transactions retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// 6. Landlords List (Screen 1 Table)
const getLandlords = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getLandlordsFromDB(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Landlords retrieved successfully",
    meta: {
      ...result.meta,
      summary: result.summary,
    },
    data: result.data,
  });
});

// 7. Landlord Overview Header & Detail (Screen 2 Header & Cards)
const getLandlordById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AdminService.getLandlordByIdFromDB(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Landlord details retrieved successfully",
    data: result,
  });
});

// 8. Landlord Properties & Units (Screen 3 Properties Tab)
const getLandlordProperties = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await AdminService.getLandlordPropertiesFromDB(id);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Landlord properties retrieved successfully",
      data: result,
    });
  },
);

// 9. Landlord Tenants (Screen 4 Tenants Tab)
const getLandlordTenants = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AdminService.getLandlordTenantsFromDB(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Landlord tenants retrieved successfully",
    data: result,
  });
});

// 10. Landlord Contractors (Screen 5 Contractors Tab)
const getLandlordContractors = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await AdminService.getLandlordContractorsFromDB(id);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Landlord contractors retrieved successfully",
      data: result,
    });
  },
);

// 11. Landlord Full Details (All-in-one for SPA Frontend)
const getLandlordFullDetails = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await AdminService.getLandlordFullDetailsFromDB(id);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Landlord full details retrieved successfully",
      data: result,
    });
  },
);

// 12. Update Landlord Status (Auto-cascade suspend/activate)
const updateLandlordStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const status =
    req.body.status || (req.path.includes("suspend") ? "suspended" : "active");

  const result = await AdminService.updateLandlordStatusToDB(id, status);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

// 13. Delete Landlord (Cascade soft delete)
const deleteLandlord = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AdminService.deleteLandlordFromDB(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

export const AdminController = {
  getAdminDashboardData,
  getMonthlyRevenue,
  getUserGrowth,
  getTransactionStats,
  getTransactions,
  getLandlords,
  getLandlordById,
  getLandlordProperties,
  getLandlordTenants,
  getLandlordContractors,
  getLandlordFullDetails,
  updateLandlordStatus,
  deleteLandlord,
};
