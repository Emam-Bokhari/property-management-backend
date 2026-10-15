import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AppOptionService } from "./appOption.service";

const createAppOption = catchAsync(async (req: Request, res: Response) => {
  const result = await AppOptionService.createAppOptionToDB(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "App option created successfully",
    data: result,
  });
});

const getAllAppOptions = catchAsync(async (req: Request, res: Response) => {
  const result = await AppOptionService.getAllAppOptionsFromDB(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "App options retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getSingleAppOption = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AppOptionService.getSingleAppOptionFromDB(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "App option retrieved successfully",
    data: result,
  });
});

const updateAppOption = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AppOptionService.updateAppOptionToDB(id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "App option updated successfully",
    data: result,
  });
});

const deleteAppOption = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AppOptionService.deleteAppOptionFromDB(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "App option deleted successfully",
    data: result,
  });
});

export const AppOptionController = {
  createAppOption,
  getAllAppOptions,
  getSingleAppOption,
  updateAppOption,
  deleteAppOption,
};
