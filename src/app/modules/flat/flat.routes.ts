import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import auth from "../../middlewares/auth";
import { USER_ROLES } from "../../../enums/user";
import { FlatValidation } from "./flat.validation";
import { FlatController } from "./flat.controller";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import { checkFlatLimit } from "../../middlewares/checkSubscriptionLimit";

const router = express.Router();

// 1. Base Flat CRUD (POST, GET All)
router
  .route("/")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    checkFlatLimit,
    fileUploadHandler(),
    parseFileData({ fieldName: "flatPhotos", mode: "multiple" }),
    validateRequest(FlatValidation.createFlatZodSchema),
    FlatController.createFlat,
  )
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getAllFlats,
  );

// 2. Single Flat Operations (GET, PATCH, DELETE)
router
  .route("/:id")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getSingleFlat,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "flatPhotos", mode: "multiple" }),
    validateRequest(FlatValidation.updateFlatZodSchema),
    FlatController.updateFlat,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    FlatController.deleteFlat,
  );

// ------------------- KEY REGISTER ROUTES -------------------
// Add key set / Get all keys for flat
router
  .route("/:id/keys")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getKeysByFlatId,
  )
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(FlatValidation.addKeyZodSchema),
    FlatController.addKey,
  );

// Update / Delete specific key set
router
  .route("/:id/keys/:keyId")
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(FlatValidation.updateKeyZodSchema),
    FlatController.updateKey,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    FlatController.deleteKey,
  );

// ------------------- UTILITIES (Combined: WiFi, Water, Electricity, Gas) -------------------
router
  .route("/:id/utilities")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getUtilitiesByFlatId,
  );

// ------------------- UTILITIES (Gas, Electricity, Water, WiFi) ROUTES -------------------
// Gas
router
  .route("/:id/gas")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getGas,
  )
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "meterPhoto", mode: "single" }),
    validateRequest(FlatValidation.upsertGasZodSchema),
    FlatController.upsertGas,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "meterPhoto", mode: "single" }),
    validateRequest(FlatValidation.upsertGasZodSchema),
    FlatController.upsertGas,
  );

// Electricity
router
  .route("/:id/electricity")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getElectricity,
  )
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "meterPhoto", mode: "single" }),
    validateRequest(FlatValidation.upsertElectricityZodSchema),
    FlatController.upsertElectricity,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "meterPhoto", mode: "single" }),
    validateRequest(FlatValidation.upsertElectricityZodSchema),
    FlatController.upsertElectricity,
  );

// Water
router
  .route("/:id/water")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getWater,
  )
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "meterPhoto", mode: "single" }),
    validateRequest(FlatValidation.upsertWaterZodSchema),
    FlatController.upsertWater,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "meterPhoto", mode: "single" }),
    validateRequest(FlatValidation.upsertWaterZodSchema),
    FlatController.upsertWater,
  );

// WiFi
router
  .route("/:id/wifi")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getWifi,
  )
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "routerPhoto", mode: "single" }),
    validateRequest(FlatValidation.upsertWifiZodSchema),
    FlatController.upsertWifi,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "routerPhoto", mode: "single" }),
    validateRequest(FlatValidation.upsertWifiZodSchema),
    FlatController.upsertWifi,
  );

// ------------------- SAFETY ALARMS ROUTES (Multiple, add, update, delete) -------------------
// Add safety alarm / Get all safety alarms for flat
router
  .route("/:id/safety-alarms")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getSafetyAlarmsByFlatId,
  )
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "alarmPhoto", mode: "single" }),
    validateRequest(FlatValidation.addSafetyAlarmZodSchema),
    FlatController.addSafetyAlarm,
  );

// Update / Delete specific safety alarm
router
  .route("/:id/safety-alarms/:alarmId")
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "alarmPhoto", mode: "single" }),
    validateRequest(FlatValidation.updateSafetyAlarmZodSchema),
    FlatController.updateSafetyAlarm,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    FlatController.deleteSafetyAlarm,
  );

// ------------------- APPLIANCES ROUTES (Multiple, add, update, delete) -------------------
// Add appliance / Get all appliances for flat
router
  .route("/:id/appliances")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getAppliancesByFlatId,
  )
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "appliancePhoto", mode: "single" }),
    validateRequest(FlatValidation.addApplianceZodSchema),
    FlatController.addAppliance,
  );

// Update / Delete specific appliance
router
  .route("/:id/appliances/:applianceId")
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "appliancePhoto", mode: "single" }),
    validateRequest(FlatValidation.updateApplianceZodSchema),
    FlatController.updateAppliance,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    FlatController.deleteAppliance,
  );

// ------------------- TENANTS ROUTES -------------------
// Flat-wise tenant(s) details
router
  .route("/:id/tenants")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    FlatController.getTenantsByFlatId,
  );

export const FlatRoutes = router;