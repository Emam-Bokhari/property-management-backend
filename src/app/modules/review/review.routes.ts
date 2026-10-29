import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { ReviewValidation } from "./review.validation";
import { ReviewController } from "./review.controller";

const router = express.Router();

/**
 * 1. Submit Review for Contractor (Tenant only)
 * Requirements:
 * - Maintenance job must be completed
 * - Payment must be completed
 * - Only 1 review per maintenance job
 * - Contractor cannot review themselves
 * - Contractor cannot reply
 */
router.post(
  "/",
  auth(USER_ROLES.TENANT),
  validateRequest(ReviewValidation.createReviewZodSchema),
  ReviewController.createReview,
);

/**
 * 2. Get reviews submitted by the logged-in tenant
 */
router.get(
  "/my-reviews",
  auth(USER_ROLES.TENANT),
  ReviewController.getMyReviews,
);

/**
 * 3. Get Contractor Rating Summary & 1-5 Star Breakdown
 */
router.get(
  "/contractor/:contractorId/summary",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.CONTRACTOR,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  ReviewController.getContractorReviewSummary,
);

/**
 * 4. Get All Reviews of a Contractor (Paginated with search)
 */
router.get(
  "/contractor/:contractorId",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.CONTRACTOR,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  ReviewController.getContractorReviews,
);

/**
 * 5. Get Review by Maintenance Job ID (To check or display review status)
 */
router.get(
  "/maintenance/:maintenanceId",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.CONTRACTOR,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  ReviewController.getReviewByMaintenanceId,
);

/**
 * 6. Get Single Review by ID
 */
router.get(
  "/:id",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.CONTRACTOR,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  ReviewController.getSingleReview,
);

export const ReviewRoutes = router;
