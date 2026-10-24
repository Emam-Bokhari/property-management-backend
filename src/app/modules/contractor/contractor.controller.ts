import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { ContractorService } from "./contractor.service";

const inviteContractor = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await ContractorService.inviteContractorToDB(
    req.user,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Contractor invited successfully and credentials sent to email",
    data: result,
  });
});

const getAllContractors = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await ContractorService.getAllContractorsFromDB(
    req.user,
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Contractors retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getSingleContractor = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await ContractorService.getSingleContractorFromDB(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Contractor retrieved successfully",
    data: result,
  });
});

const getMyAssignedLandlords = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await ContractorService.getMyAssignedLandlordsFromDB(
      req.user,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Contractor assignments retrieved successfully",
      data: result,
    });
  },
);

const updateContractor = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await ContractorService.updateContractorToDB(
    req.user,
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Contractor updated successfully",
    data: result,
  });
});

const resendInvitation = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await ContractorService.resendInvitationEmail(
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

const removeContractor = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await ContractorService.removeContractorFromDB(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message || "Contractor removed successfully",
    data: result,
  });
});

const getContractorHomeDashboard = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await ContractorService.getContractorHomeDashboardFromDB(
      req.user,
      req.query,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Contractor home dashboard data retrieved successfully",
      data: result,
    });
  },
);

export const ContractorController = {
  inviteContractor,
  getAllContractors,
  getSingleContractor,
  getMyAssignedLandlords,
  updateContractor,
  resendInvitation,
  removeContractor,
  getContractorHomeDashboard,
};
