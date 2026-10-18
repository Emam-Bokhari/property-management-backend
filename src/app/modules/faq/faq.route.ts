import express from "express";
import { FaqController } from "./faq.controller";
import { isAdmin } from "../../../helpers/authHelper";
import validateRequest from "../../middlewares/validateRequest";
import { FaqValidation } from "./faq.validation";

const router = express.Router();

router
  .route("/")
  .post(
    isAdmin,
    validateRequest(FaqValidation.createFaqZodSchema),
    FaqController.createFaq,
  )
  .get(FaqController.getFaqs);

router
  .route("/:id")
  .get(FaqController.getFaqById)
  .patch(
    isAdmin,
    validateRequest(FaqValidation.updateFaqZodSchema),
    FaqController.updateFaq,
  )
  .delete(isAdmin, FaqController.deleteFaq);

export const FaqRoutes = router;
