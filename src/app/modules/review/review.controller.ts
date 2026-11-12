import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { USER_ROLES } from "../../../enums/user";
import { ReviewService } from "./review.service";

/**
 * 1. Create Review (Tenant submits review & rating for Contractor on completed & paid job)
 */
const createReview = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await ReviewService.createReviewIntoDB(req.user, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Review submitted successfully",
    data: result,
  });
});

/**
 * 2. Get All Reviews for a Contractor
 */
const getContractorReviews = catchAsync(async (req: Request, res: Response) => {
  const result = await ReviewService.getContractorReviewsFromDB(
    req.params.contractorId,
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Contractor reviews retrieved successfully",
    meta: result.meta,
    data: {
      summary: result.summary,
      reviews: result.data,
    },
  });
});

/**
 * 3. Get Contractor Review Summary & Star Breakdown
 */
const getContractorReviewSummary = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ReviewService.getContractorReviewSummaryFromDB(
      req.params.contractorId,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Contractor review summary retrieved successfully",
      data: result,
    });
  },
);

/**
 * 4. Get Review by Maintenance Job ID
 */
const getReviewByMaintenanceId = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ReviewService.getReviewByMaintenanceFromDB(
      req.params.maintenanceId,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: result
        ? "Maintenance review retrieved successfully"
        : "No review found for this maintenance job",
      data: result,
    });
  },
);

/**
 * 5. Get My Reviews (Tenant: submitted reviews, Contractor: received reviews & summary)
 */
const getMyReviews = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await ReviewService.getMyReviewsFromDB(req.user, req.query);

  if (req.user.role === USER_ROLES.CONTRACTOR && "summary" in result) {
    return sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Contractor reviews retrieved successfully",
      meta: result.meta,
      data: {
        summary: result.summary,
        reviews: result.data,
      },
    });
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "My reviews retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

/**
 * 5b. Get My Review Summary (Contractor only)
 */
const getMyReviewSummary = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await ReviewService.getMyReviewSummaryFromDB(req.user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Contractor review summary retrieved successfully",
    data: result,
  });
});

/**
 * 6. Get Single Review by ID
 */
const getSingleReview = catchAsync(async (req: Request, res: Response) => {
  const result = await ReviewService.getSingleReviewFromDB(req.params.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Review retrieved successfully",
    data: result,
  });
});

export const ReviewController = {
  createReview,
  getContractorReviews,
  getContractorReviewSummary,
  getReviewByMaintenanceId,
  getMyReviews,
  getMyReviewSummary,
  getSingleReview,
};
