import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { ContractorValidation } from "./contractor.validation";
import { ContractorController } from "./contractor.controller";

const router = express.Router();

// 1. Invite Contractor (Landlord / Admin / Super Admin)
router.post(
  "/invite",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(ContractorValidation.inviteContractorZodSchema),
  ContractorController.inviteContractor,
);

// 2. Contractor Home Dashboard
router.get(
  "/dashboard",
  auth(USER_ROLES.CONTRACTOR, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  ContractorController.getContractorHomeDashboard,
);

// 3. Contractor's Own Assigned Landlords & Scope (Contractor only)
router.get(
  "/my-assignments",
  auth(USER_ROLES.CONTRACTOR),
  ContractorController.getMyAssignedLandlords,
);

// 3b. Contractor Assigned Properties (Assigned Properties Screen)
router.get(
  "/assigned-properties",
  auth(USER_ROLES.CONTRACTOR, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  ContractorController.getContractorAssignedProperties,
);

// 3c. Contractor Earnings & Payouts History (Earnings & Payouts Screen)
router.get(
  "/earnings",
  auth(USER_ROLES.CONTRACTOR, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  ContractorController.getContractorEarningsHistory,
);

// 3d. Contractor Assigned Tenants (All tenants under contractor's assigned properties)
router.get(
  "/tenants",
  auth(USER_ROLES.CONTRACTOR, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  ContractorController.getContractorTenants,
);

// 3e. Single Tenant Under Contractor's Assigned Properties
router.get(
  "/tenants/:id",
  auth(USER_ROLES.CONTRACTOR, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  ContractorController.getSingleContractorTenant,
);

// 3. Get All Contractors (Landlord / Contractor / Admin - SaaS isolated)
router.get(
  "/",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.CONTRACTOR,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  ContractorController.getAllContractors,
);

// 4. Single Contractor Operations (GET, PATCH, DELETE)
router
  .route("/:id")
  .get(
    auth(
      USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
      USER_ROLES.CONTRACTOR,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    ContractorController.getSingleContractor,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(ContractorValidation.updateContractorZodSchema),
    ContractorController.updateContractor,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    ContractorController.removeContractor,
  );

// 5. Resend Invitation Email (Landlord / Admin)
router.post(
  "/:id/resend-invite",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(ContractorValidation.resendInviteZodSchema),
  ContractorController.resendInvitation,
);

export const ContractorRoutes = router;
