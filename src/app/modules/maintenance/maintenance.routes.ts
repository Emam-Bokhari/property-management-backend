import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import { MaintenanceValidation } from "./maintenance.validation";
import { MaintenanceController } from "./maintenance.controller";

const router = express.Router();

// 1. Create Maintenance Issue (Landlord / Tenant / Admin)
router.post(
  "/",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  fileUploadHandler(),
  parseFileData({ fieldName: "attachments", mode: "multiple" }),
  validateRequest(MaintenanceValidation.createMaintenanceZodSchema),
  MaintenanceController.createMaintenance,
);

// 2. Contractor Dedicated Jobs List
router.get(
  "/contractor/jobs",
  auth(USER_ROLES.CONTRACTOR),
  MaintenanceController.getAllMaintenance,
);

// 3. Get All Maintenance Issues (Role-based scoped list)
router.get(
  "/",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.CONTRACTOR,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  MaintenanceController.getAllMaintenance,
);

// 4. Suggested Contractors for an Issue (Landlord only)
router.get(
  "/:id/suggested-contractors",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  MaintenanceController.getSuggestedContractors,
);

// 5. Landlord: Assign Contractor
router.patch(
  "/:id/assign-contractor",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(MaintenanceValidation.assignContractorZodSchema),
  MaintenanceController.assignContractor,
);

// 6. Contractor: Schedule Visit (Accept & Confirm Date/Time)
router.patch(
  "/:id/schedule-visit",
  auth(USER_ROLES.CONTRACTOR),
  validateRequest(MaintenanceValidation.scheduleVisitZodSchema),
  MaintenanceController.scheduleVisit,
);

// 7. Contractor: Reject Job
router.patch(
  "/:id/reject-job",
  auth(USER_ROLES.CONTRACTOR),
  MaintenanceController.rejectJob,
);

// 8. Contractor: Start Job (On-Site Execution)
router.patch(
  "/:id/start-job",
  auth(USER_ROLES.CONTRACTOR),
  MaintenanceController.startJob,
);

// 9. Contractor: Finish & Submit Invoice
router.patch(
  "/:id/submit-invoice",
  auth(USER_ROLES.CONTRACTOR),
  fileUploadHandler(),
  parseFileData(
    { fieldName: "certificates", mode: "multiple" },
    { fieldName: "inspectionPhotos", mode: "multiple" },
  ),
  validateRequest(MaintenanceValidation.submitInvoiceZodSchema),
  MaintenanceController.submitInvoice,
);

// 10. Cancel Maintenance Issue (Landlord / Tenant)
router.post(
  "/:id/cancel",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  validateRequest(MaintenanceValidation.cancelMaintenanceZodSchema),
  MaintenanceController.cancelMaintenance,
);

// 11. Pay Maintenance Issue - Stripe Checkout (Landlord / Tenant)
router.post(
  "/:id/pay",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  validateRequest(MaintenanceValidation.payMaintenanceZodSchema),
  MaintenanceController.createPaymentSession,
);

// 12. Reject Contractor Invoice (Landlord / Tenant)
router.patch(
  "/:id/reject-invoice",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  validateRequest(MaintenanceValidation.rejectInvoiceZodSchema),
  MaintenanceController.rejectInvoice,
);

// 13. Single Maintenance Details (GET, PATCH, DELETE)
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
    MaintenanceController.getSingleMaintenance,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData({ fieldName: "attachments", mode: "multiple" }),
    validateRequest(MaintenanceValidation.updateMaintenanceZodSchema),
    MaintenanceController.updateMaintenance,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    MaintenanceController.deleteMaintenance,
  );

export const MaintenanceRoutes = router;
