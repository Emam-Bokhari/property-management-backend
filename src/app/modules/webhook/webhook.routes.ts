import express from "express";
import { WebhookController } from "./webhook.controller";

const router = express.Router();

// Root Stripe Webhook Endpoint (No Auth - Protected via Stripe signature)
router.post("/", WebhookController.handleStripeWebhook);

export const WebhookRoutes = router;
