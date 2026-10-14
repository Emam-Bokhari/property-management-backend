import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import auth from "../../middlewares/auth";
import { USER_ROLES } from "../../../enums/user";
import { AnnouncementValidation } from "./announcement.validation";
import { AnnouncementController } from "./announcement.controller";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";

const router = express.Router();

// Specific routes first to prevent collision with /:id

// 1. Get announcements for the authenticated tenant / recipient
router.get(
  "/my-announcements",
  auth(USER_ROLES.TENANT, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AnnouncementController.getMyAnnouncements,
);

// 2. Get flats for a property with tenant vacancy/active status (for Create Announcement screen)
router.get(
  "/property/:propertyId/flats",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AnnouncementController.getPropertyFlatsForAnnouncement,
);

// 3. Main CRUD routes
router
  .route("/")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "image", mode: "single" }),
    validateRequest(AnnouncementValidation.createAnnouncementZodSchema),
    AnnouncementController.createAnnouncement,
  )
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    AnnouncementController.getAllAnnouncements,
  );

router
  .route("/:id")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    AnnouncementController.getSingleAnnouncement,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "image", mode: "single" }),
    validateRequest(AnnouncementValidation.updateAnnouncementZodSchema),
    AnnouncementController.updateAnnouncement,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    AnnouncementController.deleteAnnouncement,
  );

export const AnnouncementRoutes = router;
