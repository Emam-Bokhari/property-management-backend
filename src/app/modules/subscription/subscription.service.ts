import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { getStripe } from "../../../helpers/stripeHelper";
import { Package } from "../package/package.model";
import { User } from "../user/user.model";
import { ISubscription } from "./subscription.interface";
import { Subscription } from "./subscription.model";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import { getCurrencyCode } from "../../../helpers/currencyHelper";

// 1. Create Stripe Checkout Session
const createCheckoutSession = async (
  userId: string,
  packageId: string,
  planType: "monthly" | "yearly",
) => {
  const stripe = getStripe();

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User not found");
  }

  const selectedPackage = await Package.findById(packageId);
  if (!selectedPackage || !selectedPackage.isActive) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Selected package not found or inactive",
    );
  }

  // Pick price ID based on billing interval
  let priceId =
    planType === "yearly"
      ? selectedPackage.stripeYearlyPriceId
      : selectedPackage.stripeMonthlyPriceId;

  // Auto-heal / generate real Stripe price if missing or not a live Stripe ID
  if (!priceId || !priceId.startsWith("price_")) {
    const currency = getCurrencyCode();

    // Ensure Stripe product exists
    let productId = selectedPackage.stripeProductId;
    if (!productId || !productId.startsWith("prod_")) {
      const prod = await stripe.products.create({
        name: selectedPackage.name,
        description: selectedPackage.description || undefined,
      });
      productId = prod.id;
      selectedPackage.stripeProductId = prod.id;
    }

    const priceAmount =
      planType === "yearly"
        ? selectedPackage.yearlyPrice
        : selectedPackage.monthlyPrice;

    const newPrice = await stripe.prices.create({
      product: productId,
      unit_amount: Math.round(priceAmount * 100),
      currency,
      recurring: {
        interval: planType === "yearly" ? "year" : "month",
      },
      metadata: {
        planType,
        packageName: selectedPackage.name,
      },
    });

    if (planType === "yearly") {
      selectedPackage.stripeYearlyPriceId = newPrice.id;
    } else {
      selectedPackage.stripeMonthlyPriceId = newPrice.id;
    }

    await selectedPackage.save();
    priceId = newPrice.id;
  }

  // Check if user already has an active or trialing subscription
  const existingActiveSubscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "trialing"] },
  });

  if (existingActiveSubscription) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "You already have an active subscription. Use Customer Portal to change your plan.",
    );
  }

  // Find or Create Stripe Customer
  let stripeCustomerId: string | undefined;
  const previousSub = await Subscription.findOne({ userId }).sort({
    createdAt: -1,
  });

  if (previousSub?.stripeCustomerId) {
    stripeCustomerId = previousSub.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: {
        userId: user._id.toString(),
      },
    });
    stripeCustomerId = customer.id;
  }

  // Check if user has previously used a trial (prevent trial abuse)
  const hadPreviousTrial = await Subscription.findOne({
    userId,
    isTrial: true,
  });

  const shouldApplyTrial =
    selectedPackage.hasTrial &&
    selectedPackage.trialDays > 0 &&
    !hadPreviousTrial;

  const clientUrl = config.client_url || "http://localhost:3000";

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${clientUrl}/dashboard?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl}/pricing?subscription=canceled`,
    metadata: {
      paymentType: "subscription",
      userId: user._id.toString(),
      packageId: selectedPackage._id.toString(),
      planType,
    },
    subscription_data: {
      metadata: {
        paymentType: "subscription",
        userId: user._id.toString(),
        packageId: selectedPackage._id.toString(),
        planType,
      },
      ...(shouldApplyTrial
        ? { trial_period_days: selectedPackage.trialDays }
        : {}),
    },
  };

  const session = await stripe.checkout.sessions.create(sessionParams);

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
  };
};

// 2. Create Stripe Customer Portal Session (Self-service billing)
const createCustomerPortalSession = async (userId: string) => {
  const stripe = getStripe();

  const subscription = await Subscription.findOne({ userId }).sort({
    createdAt: -1,
  });
  if (!subscription || !subscription.stripeCustomerId) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No active Stripe customer found for this account",
    );
  }

  const clientUrl = config.client_url || "http://localhost:3000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${clientUrl}/dashboard`,
  });

  return {
    url: portalSession.url,
  };
};

// 3. Get Current User's Subscription & Usage vs Limits
const getMySubscriptionFromDB = async (userId: string) => {
  const subscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "trialing", "past_due"] },
  })
    .populate("packageId")
    .sort({ createdAt: -1 });

  const currentPropertiesCount = await Property.countDocuments({
    landlord: userId,
    isDeleted: { $ne: true },
  });

  const currentFlatsCount = await Flat.countDocuments({
    landlord: userId,
    isDeleted: { $ne: true },
  });

  if (!subscription) {
    return {
      hasActiveSubscription: false,
      subscription: null,
      usage: {
        propertiesCount: currentPropertiesCount,
        flatsCount: currentFlatsCount,
      },
    };
  }

  const pkg: any = subscription.packageId;

  return {
    hasActiveSubscription: true,
    subscription,
    limits: {
      maxProperties: pkg?.maxProperties ?? 0,
      maxFlats: pkg?.maxFlats ?? 0,
    },
    usage: {
      propertiesCount: currentPropertiesCount,
      flatsCount: currentFlatsCount,
      propertiesRemaining:
        pkg?.maxProperties === -1
          ? "unlimited"
          : Math.max(0, (pkg?.maxProperties || 0) - currentPropertiesCount),
      flatsRemaining:
        pkg?.maxFlats === -1
          ? "unlimited"
          : Math.max(0, (pkg?.maxFlats || 0) - currentFlatsCount),
    },
  };
};

// 4. Cancel Subscription
const cancelSubscription = async (
  userId: string,
  cancelImmediately = false,
) => {
  const stripe = getStripe();

  const subscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "trialing"] },
  });

  if (!subscription) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No active subscription found to cancel",
    );
  }

  if (cancelImmediately) {
    const canceled = await stripe.subscriptions.cancel(
      subscription.stripeSubscriptionId,
    );
    subscription.status = "canceled";
    subscription.canceledAt = new Date();
    subscription.cancelAtPeriodEnd = false;
    await subscription.save();
    return { message: "Subscription canceled immediately", subscription };
  } else {
    const updated = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      },
    );
    subscription.cancelAtPeriodEnd = true;
    await subscription.save();
    return {
      message:
        "Subscription will cancel at the end of the current billing period",
      subscription,
    };
  }
};

// ==========================================
// 🛡️ WEBHOOK EVENT HANDLERS (100% Secure)
// ==========================================

// A. Handle checkout.session.completed for subscription
const handleSubscriptionCheckoutCompleted = async (
  session: Stripe.Checkout.Session,
) => {
  if (session.mode !== "subscription" || !session.subscription) {
    return;
  }

  const stripe = getStripe();
  const stripeSubscription = await stripe.subscriptions.retrieve(
    session.subscription as string,
  );

  const userId =
    session.metadata?.userId || stripeSubscription.metadata?.userId;
  const packageId =
    session.metadata?.packageId || stripeSubscription.metadata?.packageId;
  const planType = (session.metadata?.planType ||
    stripeSubscription.metadata?.planType ||
    "monthly") as "monthly" | "yearly";

  if (!userId || !packageId) {
    return;
  }

  const subObj = stripeSubscription as any;
  const isTrial = subObj.status === "trialing";
  const trialStartsAt = subObj.trial_start
    ? new Date(subObj.trial_start * 1000)
    : undefined;
  const trialEndsAt = subObj.trial_end
    ? new Date(subObj.trial_end * 1000)
    : undefined;

  const currentPeriodStart = subObj.current_period_start
    ? new Date(subObj.current_period_start * 1000)
    : new Date();
  const currentPeriodEnd = subObj.current_period_end
    ? new Date(subObj.current_period_end * 1000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subObj.id },
    {
      userId,
      packageId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subObj.id,
      planType,
      status: subObj.status,
      isTrial,
      trialStartsAt,
      trialEndsAt,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subObj.cancel_at_period_end || false,
    },
    { upsert: true, new: true },
  );

  // Send in-app notification to landlord
  await sendNotifications({
    receiver: userId as any,
    title: isTrial ? "🎉 Free Trial Activated!" : "🎉 Subscription Activated!",
    text: isTrial
      ? `Your free trial is now active until ${trialEndsAt?.toLocaleDateString()}. Enjoy full access!`
      : "Your subscription payment was successful. Welcome aboard!",
    type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
  });
};

// B. Handle invoice.payment_succeeded (recurring renewal or trial conversion to paid)
const handleInvoicePaymentSucceeded = async (invoice: Stripe.Invoice) => {
  const inv = invoice as any;
  const subscriptionId =
    inv.subscription ||
    inv.parent?.subscription_details?.subscription ||
    inv.lines?.data?.[0]?.subscription;

  if (!subscriptionId) return;

  const stripe = getStripe();
  const stripeSubscription = await stripe.subscriptions.retrieve(
    subscriptionId as string,
  );
  const subObj = stripeSubscription as any;

  const subscription = await Subscription.findOne({
    stripeSubscriptionId: subObj.id,
  });

  if (subscription) {
    subscription.status = subObj.status as any;
    if (subObj.current_period_start) {
      subscription.currentPeriodStart = new Date(
        subObj.current_period_start * 1000,
      );
    }
    if (subObj.current_period_end) {
      subscription.currentPeriodEnd = new Date(
        subObj.current_period_end * 1000,
      );
    }
    subscription.latestInvoiceId = inv.id;
    subscription.cancelAtPeriodEnd = subObj.cancel_at_period_end || false;

    // Check if it was trial
    const wasTrial = subscription.isTrial;
    if (subscription.isTrial && subObj.status === "active") {
      subscription.isTrial = false;
    }

    await subscription.save();

    // Do NOT send renewed notification on initial checkout (Stripe fires both checkout.session.completed and invoice.payment_succeeded)
    if (inv.billing_reason === "subscription_create") {
      return;
    }

    // If trial transitioned to active paid
    if (wasTrial && subObj.status === "active") {
      await sendNotifications({
        receiver: subscription.userId as any,
        title: "🎉 Trial Converted to Active Subscription",
        text: `Your free trial has ended and your subscription is now active. Next billing date: ${subscription.currentPeriodEnd.toLocaleDateString()}`,
        type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
      });
      return;
    }

    // Send notification for successful recurring renewal (e.g., subscription_cycle)
    await sendNotifications({
      receiver: subscription.userId as any,
      title: "✅ Subscription Renewed",
      text: `Your subscription has been renewed successfully. Next billing date: ${subscription.currentPeriodEnd.toLocaleDateString()}`,
      type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
    });
  }
};

// C. Handle invoice.payment_failed
const handleInvoicePaymentFailed = async (invoice: Stripe.Invoice) => {
  const inv = invoice as any;
  const subscriptionId =
    inv.subscription ||
    inv.parent?.subscription_details?.subscription ||
    inv.lines?.data?.[0]?.subscription;

  if (!subscriptionId) return;

  const subscription = await Subscription.findOne({
    stripeSubscriptionId: subscriptionId as string,
  });

  if (subscription) {
    subscription.status = "past_due";
    await subscription.save();

    await sendNotifications({
      receiver: subscription.userId as any,
      title: "⚠️ Subscription Payment Failed",
      text: "Payment for your subscription renewal could not be processed. Please update your billing method.",
      type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
    });
  }
};

// D. Handle customer.subscription.updated (Plan changes, cancellations at period end)
const handleSubscriptionUpdated = async (
  stripeSubscription: Stripe.Subscription,
) => {
  const subObj = stripeSubscription as any;
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: subObj.id,
  });

  if (subscription) {
    subscription.status = subObj.status as any;
    subscription.cancelAtPeriodEnd = subObj.cancel_at_period_end || false;
    if (subObj.current_period_start) {
      subscription.currentPeriodStart = new Date(
        subObj.current_period_start * 1000,
      );
    }
    if (subObj.current_period_end) {
      subscription.currentPeriodEnd = new Date(
        subObj.current_period_end * 1000,
      );
    }

    if (subObj.status === "canceled") {
      subscription.canceledAt = new Date();
    }

    await subscription.save();
  }
};

// E. Handle customer.subscription.deleted (Plan terminated)
const handleSubscriptionDeleted = async (
  stripeSubscription: Stripe.Subscription,
) => {
  const subObj = stripeSubscription as any;
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: subObj.id,
  });

  if (subscription) {
    subscription.status = "canceled";
    subscription.canceledAt = new Date();
    await subscription.save();

    await sendNotifications({
      receiver: subscription.userId as any,
      title: "Subscription Canceled",
      text: "Your subscription has ended. Upgrade anytime to continue creating properties and units.",
      type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
    });
  }
};

// F. Handle customer.subscription.trial_will_end (3 days before trial ends)
const handleTrialWillEnd = async (stripeSubscription: Stripe.Subscription) => {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: stripeSubscription.id,
  });

  if (subscription && subscription.userId) {
    const trialEnd = stripeSubscription.trial_end
      ? new Date(stripeSubscription.trial_end * 1000)
      : subscription.trialEndsAt;

    await sendNotifications({
      receiver: subscription.userId as any,
      title: "⏳ Your Free Trial Ends in 3 Days",
      text: `Your free trial will end on ${trialEnd?.toLocaleDateString()}. Your card will be billed automatically unless canceled.`,
      type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
    });
  }
};

export const SubscriptionService = {
  createCheckoutSession,
  createCustomerPortalSession,
  getMySubscriptionFromDB,
  cancelSubscription,
  // Webhook handlers
  handleSubscriptionCheckoutCompleted,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleTrialWillEnd,
};
