import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { isAdmin } from "../../../helpers/authHelper";
import { AppOptionValidation } from "./appOption.validation";
import { AppOptionController } from "./appOption.controller";

const router = express.Router();

router
  .route("/")
  .post(
    isAdmin,
    validateRequest(AppOptionValidation.createAppOptionZodSchema),
    AppOptionController.createAppOption,
  )
  .get(AppOptionController.getAllAppOptions);

router
  .route("/:id")
  .get(AppOptionController.getSingleAppOption)
  .patch(
    isAdmin,
    validateRequest(AppOptionValidation.updateAppOptionZodSchema),
    AppOptionController.updateAppOption,
  )
  .delete(isAdmin, AppOptionController.deleteAppOption);

export const AppOptionRoutes = router;
