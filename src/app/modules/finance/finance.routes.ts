import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { FinanceValidation } from "./finance.validation";
import { FinanceController } from "./finance.controller";

const router = express.Router();

// -----------------------------------------------------------------
// LANDLORD FINANCE ROUTES (Screenshots 1, 2, 3)
// -----------------------------------------------------------------

// 1. Landlord Dashboard Finance Overview (This month collected/expected, due soon, overdue, outstanding)
router.get(
  "/overview",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  FinanceController.getLandlordOverview,
);

// 2. Cascaded Form Options for Add Charge & Record Payment (Properties -> Flats -> Tenants)
router.get(
  "/form-options",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  FinanceController.getLandlordFormOptions,
);

// 3. Add Charge to Unit / Tenant(s)
router.post(
  "/charges",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(FinanceValidation.createChargeZodSchema),
  FinanceController.createCharge,
);

// 4. Record Payment for one or more unpaid bills (Manual)
router.post(
  "/record-payment",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(FinanceValidation.recordPaymentZodSchema),
  FinanceController.recordPayment,
);

// 5. Direct Record Rent Received (Landlord CTA)
router.post(
  "/record-rent-received",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(FinanceValidation.recordRentReceivedZodSchema),
  FinanceController.recordRentReceived,
);

// 6. Payment Reminder Candidates (Overdue & Due soon list with checkboxes)
router.get(
  "/reminders/candidates",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  FinanceController.getReminderCandidates,
);

// 7. Send Payment Reminder (Push & Email)
router.post(
  "/reminders/send",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(FinanceValidation.sendReminderZodSchema),
  FinanceController.sendPaymentReminder,
);

// -----------------------------------------------------------------
// TENANT FINANCE ROUTES (Screenshot 4)
// -----------------------------------------------------------------

// 8. Tenant Home Finance Overview (Active tenancy, next rent due, last paid, pending charges)
router.get(
  "/tenant/overview",
  auth(USER_ROLES.TENANT),
  FinanceController.getTenantOverview,
);

// 9. Tenant Transaction History (Rent, Extra charges, Maintenance tabs)
router.get(
  "/tenant/transactions",
  auth(USER_ROLES.TENANT),
  FinanceController.getTenantTransactions,
);

// -----------------------------------------------------------------
// BILL DETAIL, STRIPE PAYMENT, AND ACTIONS
// -----------------------------------------------------------------

// 10. Create Stripe Checkout Session (Online payment for Tenant or Landlord)
router.post(
  "/bills/:id/pay-stripe",
  auth(
    USER_ROLES.TENANT,
    USER_ROLES.LANDLORD,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  validateRequest(FinanceValidation.stripeCheckoutZodSchema),
  FinanceController.createStripeCheckoutSession,
);

// 11. Undo Recorded Payment (Landlord)
router.post(
  "/bills/:id/undo-payment",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  FinanceController.undoPayment,
);

// 12. Cancel Unpaid Bill (Landlord)
router.post(
  "/bills/:id/cancel",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  FinanceController.cancelBill,
);

// 13. Get All Bills / Transaction History (Scoped by Role)
router.get(
  "/bills",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  FinanceController.getBills,
);

// 14. Get Single Bill Detail
router.get(
  "/bills/:id",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  FinanceController.getSingleBill,
);

export const FinanceRoutes = router;
