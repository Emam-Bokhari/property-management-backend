import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import { TenantValidation } from "./tenant.validation";
import { TenantController } from "./tenant.controller";

const router = express.Router();

// 1. Invite Tenant (Landlord / Admin)
router.post(
  "/invite",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  fileUploadHandler(),
  parseFileData(
    { fieldName: "document", mode: "multiple" },
    { fieldName: "documents", mode: "multiple" },
  ),
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

// 4. Tenant's Own Documents Operations (Tenant only)
router
  .route("/my-documents")
  .get(
    auth(USER_ROLES.TENANT),
    TenantController.getTenantDocuments,
  )
  .post(
    auth(USER_ROLES.TENANT),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "document", mode: "multiple" },
      { fieldName: "documents", mode: "multiple" },
    ),
    validateRequest(TenantValidation.addTenantDocumentZodSchema),
    TenantController.addTenantDocument,
  )
  .patch(
    auth(USER_ROLES.TENANT),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "document", mode: "multiple" },
      { fieldName: "documents", mode: "multiple" },
    ),
    validateRequest(TenantValidation.updateTenantDocumentZodSchema),
    TenantController.updateTenantDocument,
  )
  .delete(
    auth(USER_ROLES.TENANT),
    validateRequest(TenantValidation.deleteTenantDocumentZodSchema),
    TenantController.deleteTenantDocument,
  );

// 5. Get All Tenancies (Landlord / Tenant / Contractor / Admin - SaaS isolated)
router.get(
  "/",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.CONTRACTOR,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  TenantController.getAllTenants,
);

// 6. Single Tenancy Operations (GET, PATCH, DELETE)
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
    TenantController.getSingleTenant,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "document", mode: "multiple" },
      { fieldName: "documents", mode: "multiple" },
    ),
    validateRequest(TenantValidation.updateTenancyZodSchema),
    TenantController.updateTenancy,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    TenantController.removeTenant,
  );

// 7. Resend Invitation Email (Landlord / Admin)
router.post(
  "/:id/resend-invite",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(TenantValidation.resendInviteZodSchema),
  TenantController.resendInvitation,
);

// 8. Tenant Dedicated Document Operations (Tenancy ID: Landlord / Tenant / Admin)
router
  .route("/:id/documents")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    TenantController.getTenantDocuments,
  )
  .post(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "document", mode: "multiple" },
      { fieldName: "documents", mode: "multiple" },
    ),
    validateRequest(TenantValidation.addTenantDocumentZodSchema),
    TenantController.addTenantDocument,
  )
  .patch(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "document", mode: "multiple" },
      { fieldName: "documents", mode: "multiple" },
    ),
    validateRequest(TenantValidation.updateTenantDocumentZodSchema),
    TenantController.updateTenantDocument,
  )
  .delete(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    validateRequest(TenantValidation.deleteTenantDocumentZodSchema),
    TenantController.deleteTenantDocument,
  );

// Alias: /:id/document
router
  .route("/:id/document")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    TenantController.getTenantDocuments,
  )
  .post(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "document", mode: "multiple" },
      { fieldName: "documents", mode: "multiple" },
    ),
    validateRequest(TenantValidation.addTenantDocumentZodSchema),
    TenantController.addTenantDocument,
  )
  .patch(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "document", mode: "multiple" },
      { fieldName: "documents", mode: "multiple" },
    ),
    validateRequest(TenantValidation.updateTenantDocumentZodSchema),
    TenantController.updateTenantDocument,
  )
  .delete(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    validateRequest(TenantValidation.deleteTenantDocumentZodSchema),
    TenantController.deleteTenantDocument,
  );

// 9. Tenant Notes Operations
router
  .route("/:id/notes")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(TenantValidation.addTenantNoteZodSchema),
    TenantController.addNoteToTenant,
  )
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.TENANT,
    ),
    TenantController.getNotesByTenantId,
  );

router
  .route("/:id/notes/:noteId")
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(TenantValidation.updateTenantNoteZodSchema),
    TenantController.updateNoteInTenant,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    TenantController.deleteNoteFromTenant,
  );

export const TenantRoutes = router;
