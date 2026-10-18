import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { BroadcastValidation } from "./broadcast.validation";
import { BroadcastController } from "./broadcast.controller";

const router = express.Router();

// Specific routes first to avoid conflict with /:id

// 1. Get landlords list for audience selector dropdown
router.get(
  "/landlords",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  BroadcastController.getLandlordsList,
);

// 2. Broadcast collection routes (Send broadcast & Get broadcast history)
router
  .route("/")
  .post(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(BroadcastValidation.sendBroadcastZodSchema),
    BroadcastController.sendBroadcast,
  )
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    BroadcastController.getBroadcasts,
  );

// 3. Single broadcast routes (Get & Delete)
router
  .route("/:id")
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    BroadcastController.getSingleBroadcast,
  )
  .delete(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    BroadcastController.deleteBroadcast,
  );

export const BroadcastRoutes = router;
