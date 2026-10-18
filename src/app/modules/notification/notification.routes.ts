import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { NotificationController } from "./notification.controller";
import { BroadcastValidation } from "../broadcast/broadcast.validation";
import { BroadcastController } from "../broadcast/broadcast.controller";
const router = express.Router();

const allRoles = [
  USER_ROLES.LANDLORD,
  USER_ROLES.TENANT,
  USER_ROLES.CONTRACTOR,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
];

// user notification collection routes
router
  .route("/")
  .get(auth(...allRoles), NotificationController.getNotificationFromDB)
  .patch(auth(...allRoles), NotificationController.readNotification)
  .delete(auth(...allRoles), NotificationController.deleteNotification);

router.get(
  "/recent",
  auth(...allRoles),
  NotificationController.getRecentActivities,
);

// message notification routes
router
  .route("/messages")
  .get(auth(...allRoles), NotificationController.getMessageNotifications)
  .patch(auth(...allRoles), NotificationController.readMessageNotifications)
  .delete(auth(...allRoles), NotificationController.deleteMessageNotifications);

router.patch(
  "/messages/read",
  auth(...allRoles),
  NotificationController.readMessageNotifications,
);

// admin routes
router
  .route("/admin")
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminNotificationFromDB,
  )
  .patch(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminReadNotification,
  )
  .delete(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminDeleteNotification,
  );

router.get(
  "/admin/recent",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  NotificationController.adminRecentActivities,
);

router
  .route("/admin/:id")
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminGetSingleNotification,
  )
  .delete(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminDeleteSingleNotification,
  );

router.patch(
  "/admin/:id/read",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  NotificationController.adminReadSingleNotification,
);

// broadcast push notifications to landlords
router.get(
  "/broadcast/landlords",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  BroadcastController.getLandlordsList,
);

router
  .route("/broadcast")
  .post(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(BroadcastValidation.sendBroadcastZodSchema),
    BroadcastController.sendBroadcast,
  )
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    BroadcastController.getBroadcasts,
  );

router
  .route("/broadcast/:id")
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    BroadcastController.getSingleBroadcast,
  )
  .delete(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    BroadcastController.deleteBroadcast,
  );

// user single routes
router
  .route("/:id")
  .get(auth(...allRoles), NotificationController.getSingleNotification)
  .delete(auth(...allRoles), NotificationController.deleteSingleNotification);

router.patch(
  "/:id/read",
  auth(...allRoles),
  NotificationController.readSingleNotification,
);

export const NotificationRoutes = router;
