import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { MaintenanceService } from "../maintenance/maintenance.service";

const handleStripeWebhookIntoDB = async (
  rawBody: Buffer | string,
  signature?: string,
) => {
  const secretKey = config.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
  const webhookSecret =
    config.stripe?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "Stripe secret key missing on server",
    );
  }

  const stripe = new Stripe(secretKey);
  let event: Stripe.Event;

  if (webhookSecret && signature) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Webhook signature verification failed: ${err.message}`,
      );
    }
  } else {
    try {
      event =
        typeof rawBody === "string"
          ? JSON.parse(rawBody)
          : JSON.parse(rawBody.toString("utf-8"));
    } catch (err: any) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid webhook payload");
    }
  }

  // Handle Event Types
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentType = session.metadata?.paymentType;

      if (paymentType === "maintenance" || session.metadata?.maintenanceId) {
        await MaintenanceService.handleMaintenancePaymentSuccess(session);
      }
      // Scalable: future payment types can be added here
      // else if (paymentType === "rent") { ... }
      // else if (paymentType === "subscription") { ... }
      break;
    }

    case "payment_intent.succeeded": {
      break;
    }

    default:
      break;
  }

  return { received: true };
};

export const WebhookService = {
  handleStripeWebhookIntoDB,
};
