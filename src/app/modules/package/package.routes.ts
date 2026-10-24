import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { PackageController } from "./package.controller";
import { PackageValidation } from "./package.validation";

const router = express.Router();

router
  .route("/")
  .post(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(PackageValidation.createPackageZodSchema),
    PackageController.createPackage,
  )
  .get(PackageController.getAllPackages);

router
  .route("/:id")
  .get(PackageController.getPackageById)
  .patch(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(PackageValidation.updatePackageZodSchema),
    PackageController.updatePackage,
  )
  .delete(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    PackageController.deletePackage,
  );

export const PackageRoutes = router;
