import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import auth from "../../middlewares/auth";
import { USER_ROLES } from "../../../enums/user";
import { PropertyValidation } from "./property.validation";
import { PropertyController } from "./property.controller";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";

const router = express.Router();

router
  .route("/")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "propertyPhotos", mode: "multiple" },
      { fieldName: "floorPlanPhotos", mode: "multiple" },
      { fieldName: "councilPhoto", mode: "single" },
      { fieldName: "parkingPhoto", mode: "single" },
    ),
    validateRequest(PropertyValidation.createPropertyZodSchema),
    PropertyController.createProperty,
  )
  .get(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    PropertyController.getAllProperties,
  );

router
  .route("/:id")
  .get(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    PropertyController.getSingleProperty,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "propertyPhotos", mode: "multiple" },
      { fieldName: "floorPlanPhotos", mode: "multiple" },
      { fieldName: "councilPhoto", mode: "single" },
      { fieldName: "parkingPhoto", mode: "single" },
    ),
    validateRequest(PropertyValidation.updatePropertyZodSchema),
    PropertyController.updateProperty,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    PropertyController.deleteProperty,
  );

router
  .route("/:id/council")
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "councilPhoto", mode: "single" }),
    validateRequest(PropertyValidation.updateCouncilZodSchema),
    PropertyController.updateCouncil,
  );

router
  .route("/:id/parking")
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "parkingPhoto", mode: "single" }),
    validateRequest(PropertyValidation.updateParkingZodSchema),
    PropertyController.updateParking,
  );

router
  .route("/:id/compliance")
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "certificateUrl", mode: "single" },

    ),
    validateRequest(PropertyValidation.updateComplianceZodSchema),
    PropertyController.updateCompliance,
  );

router
  .route("/:id/floor-plans")
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "floorPlanPhotos", mode: "multiple" }),
    validateRequest(PropertyValidation.updateFloorPlansZodSchema),
    PropertyController.updateFloorPlans,
  );

export const PropertyRoutes = router;
