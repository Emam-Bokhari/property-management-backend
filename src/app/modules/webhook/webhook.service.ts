import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { MaintenanceService } from "../maintenance/maintenance.service";
import { FinanceService } from "../finance/finance.service";
import { SubscriptionService } from "../subscription/subscription.service";

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
      } else if (
        paymentType === "finance" ||
        paymentType === "rent" ||
        session.metadata?.billId
      ) {
        await FinanceService.handleStripePaymentSuccess(session);
      } else if (
        paymentType === "subscription" ||
        session.mode === "subscription"
      ) {
        await SubscriptionService.handleSubscriptionCheckoutCompleted(session);
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      await SubscriptionService.handleInvoicePaymentSucceeded(invoice);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await SubscriptionService.handleInvoicePaymentFailed(invoice);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await SubscriptionService.handleSubscriptionUpdated(subscription);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await SubscriptionService.handleSubscriptionDeleted(subscription);
      break;
    }

    case "customer.subscription.trial_will_end": {
      const subscription = event.data.object as Stripe.Subscription;
      await SubscriptionService.handleTrialWillEnd(subscription);
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
