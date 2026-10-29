import mongoose, { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { USER_ROLES } from "../../../enums/user";
import {
  MAINTENANCE_STATUS,
  PAYMENT_STATUS,
} from "../maintenance/maintenance.constant";
import { Maintenance } from "../maintenance/maintenance.model";
import { Contractor } from "../contractor/contractor.model";
import { User } from "../user/user.model";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import QueryBuilder from "../../builder/queryBuilder";
import { reviewSearchableFields } from "./review.constant";
import {
  TContractorReviewSummary,
  TCreateReviewPayload,
  TReview,
} from "./review.interface";
import { Review } from "./review.model";

/**
 * 1. Create Review (Tenant reviews Contractor for a completed & paid maintenance job)
 * Rules:
 * - Only tenant can review
 * - Maintenance status must be completed
 * - Maintenance paymentStatus must be paid
 * - Only 1 review per maintenance job
 * - Contractor cannot review themselves
 * - Contractor cannot reply (no reply functionality provided)
 */
const createReviewIntoDB = async (
  authUser: JwtPayload,
  payload: TCreateReviewPayload,
) => {
  // Role check: Only tenants can review contractors
  if (authUser.role !== USER_ROLES.TENANT) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Only tenants can submit a review for a contractor",
    );
  }

  const tenantId = (authUser.userId || authUser.id)?.toString();
  if (!tenantId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  // Validate maintenance job ID
  if (!mongoose.Types.ObjectId.isValid(payload.maintenance)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance job ID");
  }

  const maintenanceDoc = await Maintenance.findById(payload.maintenance);
  if (!maintenanceDoc || maintenanceDoc.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance request not found");
  }

  // Check 1: Maintenance must be completed
  if (maintenanceDoc.status !== MAINTENANCE_STATUS.COMPLETED) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Review can only be submitted once the maintenance job is completed",
    );
  }

  // Check 2: Payment must be completed
  if (maintenanceDoc.paymentStatus !== PAYMENT_STATUS.PAID) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Review can only be submitted once the maintenance job payment is completed",
    );
  }

  // Check 3: Maintenance must have an assigned contractor
  if (!maintenanceDoc.contractor) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "This maintenance job does not have an assigned contractor",
    );
  }

  const assignedContractorId = maintenanceDoc.contractor.toString();

  // If contractor ID was passed in payload, ensure it matches assigned contractor
  if (payload.contractor && payload.contractor !== assignedContractorId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "The specified contractor does not match the contractor assigned to this job",
    );
  }

  // Check 4: Tenant authorization - Only the tenant associated with this job can submit review
  const jobTenantId = maintenanceDoc.tenant
    ? maintenanceDoc.tenant.toString()
    : maintenanceDoc.requestedBy?.toString();

  if (jobTenantId && jobTenantId !== tenantId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Only the tenant associated with this maintenance job can submit a review",
    );
  }

  // Check 5: Contractor cannot review themselves
  if (tenantId === assignedContractorId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "You cannot review or rate yourself",
    );
  }

  // Check 6: Exactly one review per maintenance job
  const existingReview = await Review.findOne({
    maintenance: payload.maintenance,
  });

  if (existingReview) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      "A review has already been submitted for this maintenance job. Only one review is allowed per job",
    );
  }

  // Create review
  const review = await Review.create({
    contractor: new Types.ObjectId(assignedContractorId),
    tenant: new Types.ObjectId(tenantId),
    maintenance: new Types.ObjectId(payload.maintenance),
    rating: payload.rating,
    feedback: payload.feedback || "",
  });

  // Automatically recalculate contractor average rating and total reviews
  try {
    const summary = await Review.calculateAverageRating(assignedContractorId);
    await Contractor.updateMany(
      { contractor: new Types.ObjectId(assignedContractorId) },
      {
        $set: {
          rating: summary.averageRating,
          totalReviews: summary.totalReviews,
        },
      },
    );
  } catch (syncError) {
    // Non-blocking sync error
  }

  // Send real-time notification to the contractor
  try {
    const tenantUser = await User.findById(tenantId);
    const tenantName = tenantUser?.name || "A tenant";
    await sendNotifications({
      receiver: new Types.ObjectId(assignedContractorId),
      sender: new Types.ObjectId(tenantId),
      type: NOTIFICATION_TYPE.REVIEW_UPDATE,
      title: "New Review Received",
      text: `${tenantName} gave you a ${payload.rating}-star review for maintenance job ${maintenanceDoc.jobId || maintenanceDoc.issueTitle || ""}.`,
      referenceId: review._id as Types.ObjectId,
      referenceModel: "Review",
    });
  } catch (notifError) {
    // Non-blocking notification error
  }

  // Return populated review
  const populatedReview = await Review.findById(review._id)
    .populate({
      path: "contractor",
      select: "name email profileImage phone companyName primaryTrade",
    })
    .populate({
      path: "tenant",
      select: "name email profileImage phone",
    })
    .populate({
      path: "maintenance",
      select: "issueTitle jobId status paymentStatus completedAt",
    });

  return populatedReview;
};

/**
 * 2. Get All Reviews for a Contractor with Pagination & Search
 */
const getContractorReviewsFromDB = async (
  contractorId: string,
  query: Record<string, unknown>,
) => {
  if (!mongoose.Types.ObjectId.isValid(contractorId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid contractor ID");
  }

  const baseQuery = Review.find({
    contractor: new Types.ObjectId(contractorId),
  })
    .populate({
      path: "tenant",
      select: "name profileImage email",
    })
    .populate({
      path: "maintenance",
      select: "issueTitle jobId completedAt",
    });

  const queryBuilder = new QueryBuilder<TReview>(baseQuery, query)
    .search(reviewSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [reviews, meta, summary] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
    Review.calculateAverageRating(contractorId),
  ]);

  return {
    meta,
    summary,
    data: reviews,
  };
};

/**
 * 3. Get Contractor Rating Summary & Star Breakdown
 */
const getContractorReviewSummaryFromDB = async (
  contractorId: string,
): Promise<TContractorReviewSummary> => {
  if (!mongoose.Types.ObjectId.isValid(contractorId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid contractor ID");
  }

  return await Review.calculateAverageRating(contractorId);
};

/**
 * 4. Get Review by Maintenance Job ID (To verify if review is already submitted or view it)
 */
const getReviewByMaintenanceFromDB = async (maintenanceId: string) => {
  if (!mongoose.Types.ObjectId.isValid(maintenanceId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance job ID");
  }

  const review = await Review.findOne({
    maintenance: new Types.ObjectId(maintenanceId),
  })
    .populate({
      path: "contractor",
      select: "name email profileImage phone companyName primaryTrade",
    })
    .populate({
      path: "tenant",
      select: "name email profileImage phone",
    })
    .populate({
      path: "maintenance",
      select: "issueTitle jobId status paymentStatus completedAt",
    });

  return review;
};

/**
 * 5. Get My Submitted Reviews (Tenant perspective)
 */
const getMyReviewsFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const tenantId = (authUser.userId || authUser.id)?.toString();
  if (!tenantId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const baseQuery = Review.find({
    tenant: new Types.ObjectId(tenantId),
  })
    .populate({
      path: "contractor",
      select: "name email profileImage phone companyName primaryTrade",
    })
    .populate({
      path: "maintenance",
      select: "issueTitle jobId status paymentStatus completedAt",
    });

  const queryBuilder = new QueryBuilder<TReview>(baseQuery, query)
    .search(reviewSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [reviews, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  return {
    meta,
    data: reviews,
  };
};

/**
 * 6. Get Single Review by ID
 */
const getSingleReviewFromDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid review ID");
  }

  const review = await Review.findById(id)
    .populate({
      path: "contractor",
      select: "name email profileImage phone companyName primaryTrade",
    })
    .populate({
      path: "tenant",
      select: "name email profileImage phone",
    })
    .populate({
      path: "maintenance",
      select: "issueTitle jobId status paymentStatus completedAt",
    });

  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Review not found");
  }

  return review;
};

export const ReviewService = {
  createReviewIntoDB,
  getContractorReviewsFromDB,
  getContractorReviewSummaryFromDB,
  getReviewByMaintenanceFromDB,
  getMyReviewsFromDB,
  getSingleReviewFromDB,
};
