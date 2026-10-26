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

// Transaction Summary Cards (Paying Landlords, Transactions, Total Collected)
router.get(
  "/transactions/stats",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getTransactionStats,
);

// Transactions List (Table with search, status tabs, date filter, pagination)
router.get(
  "/transactions",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getTransactions,
);

// ==========================================
// Landlord Management Routes (Users Tab in Dashboard)
// ==========================================

// 1. Landlords List (Screen 1 Table: status tabs, plan filter, search, pagination)
router.get(
  "/users",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getLandlords,
);

// 2. Landlord Overview Header & Details (Screen 2 Header & Stat Cards)
router.get(
  "/users/:id",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getLandlordById,
);

// 3. Landlord Properties & Units (Screen 3 Properties Tab)
router.get(
  "/users/:id/properties",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getLandlordProperties,
);

// 4. Landlord Tenants (Screen 4 Tenants Tab)
router.get(
  "/users/:id/tenants",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getLandlordTenants,
);

// 5. Landlord Contractors (Screen 5 Contractors Tab)
router.get(
  "/users/:id/contractors",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getLandlordContractors,
);

// 6. Complete Landlord Full Details (All-in-one for SPA Frontend)
router.get(
  "/users/:id/full-details",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.getLandlordFullDetails,
);

// 7. Update Landlord Status (Auto-cascade suspend/activate associated tenants & contractors)
router.patch(
  "/users/:id/status",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.updateLandlordStatus,
);
router.patch(
  "/users/:id/suspend",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.updateLandlordStatus,
);

// 8. Delete Landlord (Cascade soft delete)
router.delete(
  "/users/:id",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  AdminController.deleteLandlord,
);

export const AdminRoutes = router;
