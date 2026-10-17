import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { InspectionService } from "./inspection.service";

const createInspection = catchAsync(async (req: Request, res: Response) => {
  const result = await InspectionService.createInspectionToDB(
    req.user,
    req.body,
  );
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Inspection report created successfully",
    data: result,
  });
});

const getAllInspections = catchAsync(async (req: Request, res: Response) => {
  const result = await InspectionService.getAllInspectionsFromDB(
    req.user,
    req.query,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Inspections retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getSingleInspection = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await InspectionService.getSingleInspectionFromDB(
    req.user,
    id,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Inspection report retrieved successfully",
    data: result,
  });
});

const getChecklistTemplate = catchAsync(async (req: Request, res: Response) => {
  const { flatId } = req.params;
  const result = await InspectionService.getChecklistTemplateByFlatFromDB(
    req.user,
    flatId,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Checklist template retrieved successfully",
    data: result,
  });
});

const updateInspection = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await InspectionService.updateInspectionInDB(
    req.user,
    id,
    req.body,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Inspection report updated successfully",
    data: result,
  });
});

const deleteInspection = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await InspectionService.deleteInspectionFromDB(req.user, id);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Inspection report deleted successfully",
    data: result,
  });
});

const logRepair = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await InspectionService.logRepairFromInspectionInDB(
    req.user,
    id,
    req.body,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Repair logged successfully for this defect",
    data: result,
  });
});

export const InspectionController = {
  createInspection,
  getAllInspections,
  getSingleInspection,
  getChecklistTemplate,
  updateInspection,
  deleteInspection,
  logRepair,
};
