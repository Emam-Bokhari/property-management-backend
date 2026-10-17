import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import auth from "../../middlewares/auth";
import { USER_ROLES } from "../../../enums/user";
import { SmartReminderValidation } from "./smartReminder.validation";
import { SmartReminderController } from "./smartReminder.controller";

const router = express.Router();

// Summary route for tab counts (all, overdue, dueSoon)
router.get(
  "/summary",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  SmartReminderController.getSmartReminderSummary,
);

// Manual trigger for testing push notification
router.post(
  "/:id/trigger-notification",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  SmartReminderController.testTriggerNotification,
);

router
  .route("/")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(SmartReminderValidation.createSmartReminderZodSchema),
    SmartReminderController.createSmartReminder,
  )
  .get(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    SmartReminderController.getAllSmartReminders,
  );

router
  .route("/:id")
  .get(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    SmartReminderController.getSingleSmartReminder,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(SmartReminderValidation.updateSmartReminderZodSchema),
    SmartReminderController.updateSmartReminder,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    SmartReminderController.deleteSmartReminder,
  );

export const SmartReminderRoutes = router;
