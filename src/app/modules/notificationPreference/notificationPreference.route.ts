import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { NotificationPreferenceController } from "./notificationPreference.controller";
import { NotificationPreferenceValidation } from "./notificationPreference.validation";

const router = express.Router();

const authorizedRoles = [
  USER_ROLES.LANDLORD,
  USER_ROLES.TENANT,
  USER_ROLES.CONTRACTOR,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
];

// user routes
router
  .route("/")
  .get(
    auth(...authorizedRoles),
    NotificationPreferenceController.getNotificationPreference,
  )
  .patch(
    auth(...authorizedRoles),
    validateRequest(
      NotificationPreferenceValidation.updateNotificationPreferenceZodSchema,
    ),
    NotificationPreferenceController.updateNotificationPreference,
  )
  .delete(
    auth(...authorizedRoles),
    NotificationPreferenceController.deleteNotificationPreference,
  );

export const NotificationPreferenceRoutes = router;
