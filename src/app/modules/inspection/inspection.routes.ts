import express, { NextFunction, Request, Response } from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import { InspectionValidation } from "./inspection.validation";
import { InspectionController } from "./inspection.controller";

const router = express.Router();

// Helper middleware to normalize inspection photo fields
const normalizeInspectionPhotos = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.body.images && !req.body.inspectionPhotos) {
    req.body.inspectionPhotos = Array.isArray(req.body.images)
      ? req.body.images
      : [req.body.images];
  }
  if (req.body.photos && !req.body.inspectionPhotos) {
    req.body.inspectionPhotos = Array.isArray(req.body.photos)
      ? req.body.photos
      : [req.body.photos];
  }
  next();
};

// 1. Base Inspection CRUD
router
  .route("/")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "inspectionPhotos", mode: "multiple" },
      { fieldName: "images", mode: "multiple" },
    ),
    normalizeInspectionPhotos,
    validateRequest(InspectionValidation.createInspectionZodSchema),
    InspectionController.createInspection,
  )
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    InspectionController.getAllInspections,
  );

// 2. Checklist Template Pre-loader for Conduct Inspection screen
router.get(
  "/template/flat/:flatId",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  InspectionController.getChecklistTemplate,
);

// 3. Single Inspection Operations
router
  .route("/:id")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    InspectionController.getSingleInspection,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "inspectionPhotos", mode: "multiple" },
      { fieldName: "images", mode: "multiple" },
    ),
    normalizeInspectionPhotos,
    validateRequest(InspectionValidation.updateInspectionZodSchema),
    InspectionController.updateInspection,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    InspectionController.deleteInspection,
  );

// 4. Log Repair directly for a defect item
router.post(
  "/:id/log-repair",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(InspectionValidation.logRepairZodSchema),
  InspectionController.logRepair,
);

export const InspectionRoutes = router;
