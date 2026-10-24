import express from "express";
import auth from "../../middlewares/auth";
import { USER_ROLES } from "../../../enums/user";
import { AdminController } from "./admin.controller";

const router = express.Router();

// Admin Dashboard
router.get(
  "/dashboard",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getAdminDashboardData,
);

export const AdminRoutes = router;