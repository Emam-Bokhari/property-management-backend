import express from "express";
import auth from "../../middlewares/auth";
import { USER_ROLES } from "../../../enums/user";
import { AdminController } from "./admin.controller";

const router = express.Router();

// Admin Dashboard Summary Cards
router.get(
  "/dashboard",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getAdminDashboardData,
);

// Monthly Revenue (Landlord subscription income)
router.get(
  "/monthly-revenue",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getMonthlyRevenue,
);

// User Growth (Registered landlords, tenants & contractors)
router.get(
  "/user-growth",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getUserGrowth,
);


export const AdminRoutes = router;