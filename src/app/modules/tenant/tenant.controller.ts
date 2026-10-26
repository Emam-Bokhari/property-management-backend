import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { TenantService } from "./tenant.service";

const inviteTenant = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await TenantService.inviteTenantToDB(req.user, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Tenant invited successfully and credentials sent to email",
    data: result,
  });
});

const getAllTenants = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await TenantService.getAllTenantsFromDB(req.user, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Tenants retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getSingleTenant = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await TenantService.getSingleTenantFromDB(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Tenant retrieved successfully",
    data: result,
  });
});

const getMyTenancy = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await TenantService.getMyTenancyFromDB(req.user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Tenancy retrieved successfully",
    data: result,
  });
});

const updateTenancy = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await TenantService.updateTenancyToDB(
    req.user,
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Tenancy updated successfully",
    data: result,
  });
});

const resendInvitation = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await TenantService.resendInvitationEmail(
    req.user,
    req.params.id,
    req.body?.password,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message || "Invitation email resent successfully",
    data: result,
  });
});

const removeTenant = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await TenantService.removeTenantFromDB(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message || "Tenant removed successfully",
    data: result,
  });
});

const getTenantHomeDashboard = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await TenantService.getTenantHomeDashboardFromDB(
      req.user,
      req.query,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Tenant home dashboard data retrieved successfully",
      data: result,
    });
  },
);

export const TenantController = {
  inviteTenant,
  getAllTenants,
  getSingleTenant,
  getMyTenancy,
  updateTenancy,
  resendInvitation,
  removeTenant,
  getTenantHomeDashboard,
};
