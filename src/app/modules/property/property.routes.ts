import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import auth from "../../middlewares/auth";
import { USER_ROLES } from "../../../enums/user";
import { PropertyValidation } from "./property.validation";
import { PropertyController } from "./property.controller";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import { checkPropertyLimit } from "../../middlewares/checkSubscriptionLimit";

const router = express.Router();

router
  .route("/")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    checkPropertyLimit,
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
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    PropertyController.getAllProperties,
  );

router
  .route("/:id")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
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
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    PropertyController.getCompliance,
  )
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "certificateUrl", mode: "auto" },
      { fieldName: "otherDocuments", mode: "auto" },
      { fieldName: "documents", mode: "auto" },
      { fieldName: "certificate", mode: "auto" },
    ),
    validateRequest(PropertyValidation.updateComplianceZodSchema),
    PropertyController.updateCompliance,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "certificateUrl", mode: "auto" },
      { fieldName: "otherDocuments", mode: "auto" },
      { fieldName: "documents", mode: "auto" },
      { fieldName: "certificate", mode: "auto" },
    ),
    validateRequest(PropertyValidation.updateComplianceZodSchema),
    PropertyController.updateCompliance,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(PropertyValidation.deleteComplianceZodSchema),
    PropertyController.deleteCompliance,
  );

router
  .route("/:id/photos")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "propertyPhotos", mode: "multiple" }),
    validateRequest(PropertyValidation.updatePropertyPhotosZodSchema),
    PropertyController.updatePropertyPhotos,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "propertyPhotos", mode: "multiple" }),
    validateRequest(PropertyValidation.updatePropertyPhotosZodSchema),
    PropertyController.updatePropertyPhotos,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(PropertyValidation.deletePropertyPhotoZodSchema),
    PropertyController.deletePropertyPhoto,
  );

router
  .route("/:id/floor-plans")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "floorPlanPhotos", mode: "multiple" }),
    validateRequest(PropertyValidation.updateFloorPlansZodSchema),
    PropertyController.updateFloorPlans,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "floorPlanPhotos", mode: "multiple" }),
    validateRequest(PropertyValidation.updateFloorPlansZodSchema),
    PropertyController.updateFloorPlans,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    PropertyController.deleteFloorPlans,
  );

router
  .route("/:id/house-rules")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    PropertyController.getHouseRules,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(),
    validateRequest(PropertyValidation.updateHouseRulesZodSchema),
    PropertyController.updateHouseRules,
  );

export const PropertyRoutes = router;
