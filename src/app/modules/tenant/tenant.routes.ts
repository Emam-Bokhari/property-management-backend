import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { TenantValidation } from "./tenant.validation";
import { TenantController } from "./tenant.controller";

const router = express.Router();

// 1. Invite Tenant (Landlord / Admin)
router.post(
  "/invite",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(TenantValidation.inviteTenantZodSchema),
  TenantController.inviteTenant,
);

// 2. Tenant Home Dashboard
router.get(
  "/dashboard",
  auth(
    USER_ROLES.TENANT,
    USER_ROLES.LANDLORD,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  TenantController.getTenantHomeDashboard,
);

// 3. Tenant's Own Active Tenancy Details (Tenant only)
router.get(
  "/my-tenancy",
  auth(USER_ROLES.TENANT),
  TenantController.getMyTenancy,
);

// 3. Get All Tenancies (Landlord / Tenant / Admin - SaaS isolated)
router.get(
  "/",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  TenantController.getAllTenants,
);

// 4. Single Tenancy Operations (GET, PATCH, DELETE)
router
  .route("/:id")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    TenantController.getSingleTenant,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(TenantValidation.updateTenancyZodSchema),
    TenantController.updateTenancy,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    TenantController.removeTenant,
  );

// 5. Resend Invitation Email (Landlord / Admin)
router.post(
  "/:id/resend-invite",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(TenantValidation.resendInviteZodSchema),
  TenantController.resendInvitation,
);

export const TenantRoutes = router;
