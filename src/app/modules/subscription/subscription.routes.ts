import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { SubscriptionController } from "./subscription.controller";
import { SubscriptionValidation } from "./subscription.validation";

const router = express.Router();

router.post(
  "/checkout-session",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(SubscriptionValidation.createCheckoutSessionZodSchema),
  SubscriptionController.createCheckoutSession,
);

router.post(
  "/customer-portal",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  SubscriptionController.createCustomerPortalSession,
);

router.get(
  "/my-subscription",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  SubscriptionController.getMySubscription,
);

router.post(
  "/cancel",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(SubscriptionValidation.cancelSubscriptionZodSchema),
  SubscriptionController.cancelSubscription,
);

export const SubscriptionRoutes = router;
