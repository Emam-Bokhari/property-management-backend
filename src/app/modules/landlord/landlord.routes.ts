import express from "express";
import auth from "../../middlewares/auth";
import { USER_ROLES } from "../../../enums/user";
import { LandlordController } from "./landlord.controller";

const router = express.Router();

// Landlord Home Dashboard
router.get(
  "/dashboard",
  auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  LandlordController.getLandlordHomeDashboard,
);

export const LandlordRoutes = router;
