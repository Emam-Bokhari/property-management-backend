import express from "express";
import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";
import validateRequest from "../../middlewares/validateRequest";
import { parseFileData } from "../../middlewares/parseFileData";

import {
  isAdmin,
  isAuthenticated,
  isSuperAdmin,
} from "../../../helpers/authHelper";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { AdminController } from "../admin/admin.controller";

const router = express.Router();

/* ---------------------------- PROFILE ROUTES ---------------------------- */
router
  .route("/profile")
  .get(isAuthenticated, UserController.getMyProfile)
  .patch(
    isAuthenticated,
    fileUploadHandler(),
    parseFileData(
      {
        fieldName: "profileImage",
        mode: "single",
      },
      {
        fieldName: "nidPhoto",
        mode: "single",
      },
    ),
    validateRequest(UserValidation.updateProfileZodSchema),
    UserController.updateProfile,
  )
  .delete(isAuthenticated, UserController.deleteProfile);

/* ---------------------------- SUPER ADMIN ------------------------------- */
router.get("/super-admin", UserController.getSuperAdmin);

/* ---------------------------- ADMIN CREATE ------------------------------ */
router.post(
  "/create-admin",
  isSuperAdmin,
  validateRequest(UserValidation.createAdminZodSchema),
  UserController.createAdmin,
);

/* ---------------------------- ADMINS LIST ------------------------------- */
router.get("/admins", isSuperAdmin, UserController.getAdmin);
router.delete("/admins/:id", isSuperAdmin, UserController.deleteAdmin);

/* ---------------------------- USER CREATE & LIST ------------------------ */
router
  .route("/")
  .get(isAdmin, UserController.getUsers)
  .post(
    fileUploadHandler(),
    parseFileData(
      {
        fieldName: "profileImage",
        mode: "single",
      },
      {
        fieldName: "nidPhoto",
        mode: "single",
      },
    ),
    validateRequest(UserValidation.createUserZodSchema),
    UserController.createUser,
  )
  .patch(
    isAuthenticated,
    fileUploadHandler(),
    parseFileData(
      {
        fieldName: "profileImage",
        mode: "single",
      },
      {
        fieldName: "nidPhoto",
        mode: "single",
      },
    ),
    validateRequest(UserValidation.updateProfileZodSchema),
    UserController.updateProfile,
  );

/* ---------------------------- STATUS UPDATE ----------------------------- */
router.patch(
  "/admin/status/:id",
  isAdmin,
  UserController.updateAdminStatusById,
);
router.patch(
  "/status/:id",
  isAdmin,
  validateRequest(UserValidation.updateUserStatusZodSchema),
  UserController.updateUserStatusById,
);

/* ---------------------------- LANDLORD SUB-ROUTES ----------------------- */
router.get("/:id/properties", isAdmin, AdminController.getLandlordProperties);
router.get("/:id/tenants", isAdmin, AdminController.getLandlordTenants);
router.get("/:id/contractors", isAdmin, AdminController.getLandlordContractors);
router.get(
  "/:id/full-details",
  isAdmin,
  AdminController.getLandlordFullDetails,
);

/* ---------------------------- DYNAMIC USER ID ROUTES (KEEP LAST!) ------- */
router
  .route("/:id")
  .get(isAdmin, UserController.getUserById)
  .delete(isAdmin, UserController.deleteUserById);

export const UserRoutes = router;
