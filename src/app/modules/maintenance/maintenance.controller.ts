import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { MaintenanceService } from "./maintenance.service";

// Helper to normalize attachments from string, JSON string, array, or aliased fields
const normalizeAttachments = (body: Record<string, any>): string[] => {
  let raw =
    body.attachments ??
    body.attachment ??
    body.images ??
    body.image ??
    body.photos;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        raw = trimmed.length > 0 ? [trimmed] : [];
      }
    } else if (trimmed.length > 0) {
      raw = [trimmed];
    } else {
      raw = [];
    }
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item: any) => (typeof item === "string" ? item.trim() : item))
      .filter((item: any) => typeof item === "string" && item.length > 0);
  } else if (raw && typeof raw === "string" && raw.trim().length > 0) {
    return [raw.trim()];
  }
  return [];
};

// 1. Create Maintenance Issue (Tenant or Landlord)
const createMaintenance = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  req.body.attachments = normalizeAttachments(req.body);

  const result = await MaintenanceService.createMaintenanceIssueIntoDB(
    req.user,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Maintenance issue logged successfully",
    data: result,
  });
});

// 2. Get All Maintenance Issues (Scoped by user role)
const getAllMaintenance = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await MaintenanceService.getAllMaintenanceFromDB(
    req.user,
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Maintenance issues fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

// 3. Get Single Maintenance Issue
const getSingleMaintenance = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await MaintenanceService.getSingleMaintenanceFromDB(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Maintenance issue details fetched successfully",
    data: result,
  });
});

// 4. Get Suggested Contractors for an Issue
const getSuggestedContractors = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await MaintenanceService.getSuggestedContractorsFromDB(
      req.user,
      req.params.id,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Suggested contractors fetched successfully",
      data: result,
    });
  },
);

// 5. Landlord: Assign Contractor
const assignContractor = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await MaintenanceService.assignContractorIntoDB(
    req.user,
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Contractor assigned successfully",
    data: result,
  });
});

// 6. Contractor: Schedule Visit (Accept & Confirm Date/Time/Notes)
const scheduleVisit = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await MaintenanceService.contractorScheduleVisitIntoDB(
    req.user,
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Visit scheduled successfully",
    data: result,
  });
});

// 7. Contractor: Reject Job
const rejectJob = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await MaintenanceService.contractorRejectJobIntoDB(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job rejected successfully",
    data: result,
  });
});

// 8. Contractor: Start Job (On-Site Execution)
const startJob = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await MaintenanceService.contractorStartJobIntoDB(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job started successfully",
    data: result,
  });
});

// 9. Contractor: Finish & Submit Invoice
const submitInvoice = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  // Normalize certificates & photos
  if (req.body.certificates && !Array.isArray(req.body.certificates)) {
    req.body.certificates = [req.body.certificates];
  }
  if (req.body.completionPhotos && !Array.isArray(req.body.completionPhotos)) {
    req.body.completionPhotos = [req.body.completionPhotos];
  }

  const result = await MaintenanceService.contractorSubmitInvoiceIntoDB(
    req.user,
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Invoice submitted and job marked as completed",
    data: result,
  });
});

// 10. Cancel Maintenance Issue (Landlord or Reporting Tenant)
const cancelMaintenance = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await MaintenanceService.cancelMaintenanceIntoDB(
    req.user,
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Maintenance issue cancelled successfully",
    data: result,
  });
});

// 11. Update Maintenance (Landlord / Admin)
const updateMaintenance = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  if (
    req.body.attachments !== undefined ||
    req.body.attachment !== undefined ||
    req.body.images !== undefined ||
    req.body.image !== undefined ||
    req.body.photos !== undefined
  ) {
    req.body.attachments = normalizeAttachments(req.body);
  }

  const result = await MaintenanceService.updateMaintenanceIntoDB(
    req.user,
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Maintenance issue updated successfully",
    data: result,
  });
});

// 12. Delete Maintenance Issue (Soft Delete)
const deleteMaintenance = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await MaintenanceService.deleteMaintenanceFromDB(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Maintenance issue deleted successfully",
    data: result,
  });
});

// 13. Create Stripe Payment Session (Landlord / Tenant)
const createPaymentSession = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await MaintenanceService.createPaymentSessionIntoDB(
    req.user,
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Payment checkout session created successfully",
    data: result,
  });
});

// 14. Reject Invoice (Landlord / Tenant)
const rejectInvoice = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await MaintenanceService.rejectInvoiceIntoDB(
    req.user,
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Invoice rejected successfully",
    data: result,
  });
});

export const MaintenanceController = {
  createMaintenance,
  getAllMaintenance,
  getSingleMaintenance,
  getSuggestedContractors,
  assignContractor,
  scheduleVisit,
  rejectJob,
  startJob,
  submitInvoice,
  cancelMaintenance,
  updateMaintenance,
  deleteMaintenance,
  createPaymentSession,
  rejectInvoice,
};
