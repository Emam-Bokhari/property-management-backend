import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { getStripe } from "../../../helpers/stripeHelper";
import { Package } from "../package/package.model";
import { User } from "../user/user.model";
import { Subscription } from "./subscription.model";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import { getCurrencyCode } from "../../../helpers/currencyHelper";

type PlanType = "monthly" | "yearly";

type PlanChangeStrategy =
  | "trial_switch"
  | "immediate_prorated_upgrade"
  | "schedule_at_period_end"
  | "cancel_scheduled_change";

const addBillingInterval = (baseDate: Date, planType: PlanType): Date => {
  const result = new Date(baseDate.getTime());
  if (planType === "yearly") {
    const targetYear = result.getUTCFullYear() + 1;
    const month = result.getUTCMonth();
    const day = result.getUTCDate();
    result.setUTCFullYear(targetYear, month, 1);
    const daysInTargetMonth = new Date(
      Date.UTC(targetYear, month + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, daysInTargetMonth));
  } else {
    const targetMonthIndex = result.getUTCMonth() + 1;
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(targetMonthIndex);
    const daysInTargetMonth = new Date(
      Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, daysInTargetMonth));
  }
  return result;
};

// Shared helper: ensure a Package has a valid Stripe Product and recurring Price for the requested interval
const ensurePackageStripePrice = async (
  stripe: Stripe,
  selectedPackage: any,
  planType: PlanType,
): Promise<string> => {
  let priceId =
    planType === "yearly"
      ? selectedPackage.stripeYearlyPriceId
      : selectedPackage.stripeMonthlyPriceId;

  if (priceId && priceId.startsWith("price_")) {
    return priceId;
  }

  const currency = getCurrencyCode();

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
  return newPrice.id;
};

const extractPeriodDates = (subObj: any) => {
  const startSec =
    subObj.current_period_start ??
    subObj.items?.data?.[0]?.current_period_start;
  const endSec =
    subObj.current_period_end ?? subObj.items?.data?.[0]?.current_period_end;

  return {
    currentPeriodStart: startSec ? new Date(startSec * 1000) : undefined,
    currentPeriodEnd: endSec ? new Date(endSec * 1000) : undefined,
  };
};

// Shared helper: sync local Subscription document from a live Stripe Subscription object
const syncSubscriptionFromStripe = async (
  subscription: any,
  stripeSubscription: Stripe.Subscription,
  overrides?: { packageId?: any; planType?: PlanType },
) => {
  const subObj = stripeSubscription as any;
  const previousPackageId = subscription.packageId?.toString();
  const previousPlanType = subscription.planType;

  subscription.status = subObj.status as any;
  subscription.cancelAtPeriodEnd = Boolean(subObj.cancel_at_period_end);

  const { currentPeriodStart, currentPeriodEnd } = extractPeriodDates(subObj);
  if (currentPeriodStart) {
    subscription.currentPeriodStart = currentPeriodStart;
  }
  if (currentPeriodEnd) {
    subscription.currentPeriodEnd = currentPeriodEnd;
  }

  subscription.isTrial = subObj.status === "trialing";
  if (subObj.trial_start) {
    subscription.trialStartsAt = new Date(subObj.trial_start * 1000);
  }
  if (subObj.trial_end) {
    subscription.trialEndsAt = new Date(subObj.trial_end * 1000);
  }

  if (subObj.status === "canceled") {
    subscription.canceledAt = subscription.canceledAt || new Date();
  }

  // Resolve packageId & planType from overrides or live Stripe subscription item price
  if (overrides?.packageId) {
    subscription.packageId = overrides.packageId;
  }
  if (overrides?.planType) {
    subscription.planType = overrides.planType;
  } else {
    const firstItem = subObj.items?.data?.[0];
    const priceObj = firstItem?.price;
    const priceId =
      typeof priceObj === "string" ? priceObj : priceObj?.id || undefined;

    if (priceId) {
      const matchedPackage = await Package.findOne({
        $or: [
          { stripeMonthlyPriceId: priceId },
          { stripeYearlyPriceId: priceId },
        ],
      });

      if (matchedPackage) {
        subscription.packageId = matchedPackage._id;
        subscription.planType =
          matchedPackage.stripeYearlyPriceId === priceId ? "yearly" : "monthly";
      } else if (priceObj?.recurring?.interval) {
        subscription.planType =
          priceObj.recurring.interval === "year" ? "yearly" : "monthly";
      }
    } else if (subObj.metadata?.planType) {
      subscription.planType = subObj.metadata.planType as PlanType;
    }
  }

  // Clear scheduled change fields once applied or if Stripe schedule is no longer attached
  const scheduleId =
    typeof subObj.schedule === "string"
      ? subObj.schedule
      : subObj.schedule?.id;
  const scheduledTransitionApplied =
    Boolean(subscription.scheduledPlanType) &&
    subscription.planType === subscription.scheduledPlanType &&
    (!subscription.scheduledPackageId ||
      subscription.packageId?.toString() ===
        subscription.scheduledPackageId.toString());

  if (!scheduleId || scheduledTransitionApplied) {
    subscription.stripeScheduleId = undefined;
    subscription.scheduledPackageId = undefined;
    subscription.scheduledPlanType = undefined;
    subscription.scheduledChangeAt = undefined;
  }

  await subscription.save();

  const planChanged =
    previousPackageId !== subscription.packageId?.toString() ||
    previousPlanType !== subscription.planType;

  return { subscription, planChanged };
};

// 1. Create Stripe Checkout Session
const createCheckoutSession = async (
  userId: string,
  packageId: string,
  planType: PlanType,
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

  const priceId = await ensurePackageStripePrice(
    stripe,
    selectedPackage,
    planType,
  );

  // Check if user already has an active or trialing subscription
  const existingActiveSubscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "trialing"] },
  });

  if (existingActiveSubscription) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "You already have an active subscription. Use the change-plan endpoint or Customer Portal to update your plan.",
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
    .populate("scheduledPackageId")
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

// Helper: Release an active Stripe Subscription Schedule if attached
const releaseActiveScheduleIfExists = async (
  stripe: Stripe,
  stripeSubscription: Stripe.Subscription,
  subscription: any,
) => {
  const scheduleRef = (stripeSubscription as any).schedule;
  const scheduleId =
    typeof scheduleRef === "string"
      ? scheduleRef
      : scheduleRef?.id || subscription.stripeScheduleId;

  if (scheduleId) {
    try {
      await stripe.subscriptionSchedules.release(scheduleId);
    } catch (err: any) {
      if (err?.code !== "resource_missing") {
        throw err;
      }
    }
  }

  subscription.stripeScheduleId = undefined;
  subscription.scheduledPackageId = undefined;
  subscription.scheduledPlanType = undefined;
  subscription.scheduledChangeAt = undefined;
};

// Helper: Validate and resolve strategy for switching/upgrading subscription plan or interval
const resolvePlanChangeContext = async (
  userId: string,
  targetPackageId: string | undefined,
  targetPlanType: PlanType,
) => {
  const stripe = getStripe();

  const subscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "trialing"] },
  }).sort({ createdAt: -1 });

  if (!subscription) {
    const overdueSubscription = await Subscription.findOne({
      userId,
      status: { $in: ["past_due", "unpaid"] },
    }).sort({ createdAt: -1 });

    if (overdueSubscription) {
      throw new ApiError(
        StatusCodes.PAYMENT_REQUIRED,
        "Your subscription has an overdue payment. Please settle the outstanding payment in the billing portal before changing plans.",
      );
    }

    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No active or trialing subscription found to update",
    );
  }

  const resolvedPackageId =
    targetPackageId || subscription.packageId.toString();

  const [currentPackage, targetPackage] = await Promise.all([
    Package.findById(subscription.packageId),
    Package.findById(resolvedPackageId),
  ]);

  if (!targetPackage || !targetPackage.isActive) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Target package not found or inactive",
    );
  }

  const isSamePlanAndInterval =
    resolvedPackageId === subscription.packageId.toString() &&
    targetPlanType === subscription.planType;

  if (isSamePlanAndInterval && !subscription.stripeScheduleId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `You are already subscribed to the ${targetPackage.name} (${targetPlanType}) plan`,
    );
  }

  // Prevent downgrading below current active usage limits
  if (resolvedPackageId !== subscription.packageId.toString()) {
    const [currentPropertiesCount, currentFlatsCount] = await Promise.all([
      Property.countDocuments({ landlord: userId, isDeleted: { $ne: true } }),
      Flat.countDocuments({ landlord: userId, isDeleted: { $ne: true } }),
    ]);

    if (
      targetPackage.maxProperties !== -1 &&
      currentPropertiesCount > targetPackage.maxProperties
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Cannot switch to ${targetPackage.name}: you currently have ${currentPropertiesCount} properties, but this plan allows a maximum of ${targetPackage.maxProperties}.`,
      );
    }

    if (
      targetPackage.maxFlats !== -1 &&
      currentFlatsCount > targetPackage.maxFlats
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Cannot switch to ${targetPackage.name}: you currently have ${currentFlatsCount} units/flats, but this plan allows a maximum of ${targetPackage.maxFlats}.`,
      );
    }
  }

  const targetPriceId = await ensurePackageStripePrice(
    stripe,
    targetPackage,
    targetPlanType,
  );

  const stripeSubscription = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
    { expand: ["items.data.price"] },
  );

  if (
    stripeSubscription.status !== "active" &&
    stripeSubscription.status !== "trialing"
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Subscription cannot be updated while status is '${stripeSubscription.status}'`,
    );
  }

  const currentItem = stripeSubscription.items.data[0];
  if (!currentItem) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "Stripe subscription has no active items",
    );
  }

  const currentPrice = currentItem.price;
  const currentInterval: PlanType =
    currentPrice?.recurring?.interval === "year" ? "yearly" : "monthly";
  const currentUnitAmount = (currentPrice?.unit_amount ?? 0) / 100;
  const targetUnitAmount =
    targetPlanType === "yearly"
      ? targetPackage.yearlyPrice
      : targetPackage.monthlyPrice;

  const isTrialing = stripeSubscription.status === "trialing";
  const isIntervalChange = currentInterval !== targetPlanType;

  let strategy: PlanChangeStrategy;
  if (isSamePlanAndInterval && subscription.stripeScheduleId) {
    strategy = "cancel_scheduled_change";
  } else if (isTrialing) {
    strategy = "trial_switch";
  } else if (isIntervalChange || targetUnitAmount <= currentUnitAmount) {
    // Interval transitions (Monthly <-> Yearly) and downgrades take effect cleanly at currentPeriodEnd:
    // new plan runs 1 year (yearly) or 1 month (monthly) starting from the current plan's end date.
    strategy = "schedule_at_period_end";
  } else {
    // Same-interval package upgrade (e.g. Starter Monthly -> Pro Monthly) applies immediately
    strategy = "immediate_prorated_upgrade";
  }

  return {
    stripe,
    subscription,
    stripeSubscription,
    currentItem,
    currentPackage,
    targetPackage,
    currentInterval,
    currentUnitAmount,
    targetPlanType,
    targetUnitAmount,
    targetPriceId,
    strategy,
  };
};

// 3A. Preview Subscription Plan / Interval Change
const previewPlanChange = async (
  userId: string,
  payload: { packageId?: string; planType: PlanType },
) => {
  const ctx = await resolvePlanChangeContext(
    userId,
    payload.packageId,
    payload.planType,
  );
  const {
    stripe,
    subscription,
    stripeSubscription,
    currentItem,
    currentPackage,
    targetPackage,
    currentInterval,
    currentUnitAmount,
    targetPlanType,
    targetUnitAmount,
    targetPriceId,
    strategy,
  } = ctx;

  const subObj = stripeSubscription as any;
  const { currentPeriodStart, currentPeriodEnd } = extractPeriodDates(subObj);
  const currency =
    currentItem.price?.currency || getCurrencyCode() || "usd";

  const currentPlanSummary = {
    packageId: subscription.packageId,
    packageName: currentPackage?.name || "Current Plan",
    planType: currentInterval,
    price: currentUnitAmount,
    currentPeriodStart:
      currentPeriodStart || subscription.currentPeriodStart,
    currentPeriodEnd: currentPeriodEnd || subscription.currentPeriodEnd,
  };

  const targetPlanSummary = {
    packageId: targetPackage._id,
    packageName: targetPackage.name,
    planType: targetPlanType,
    price: targetUnitAmount,
  };

  if (strategy === "trial_switch") {
    const nextBillingDate =
      subscription.trialEndsAt ||
      (subObj.trial_end ? new Date(subObj.trial_end * 1000) : undefined) ||
      currentPeriodEnd ||
      subscription.currentPeriodEnd;
    const nextPeriodEndDate = addBillingInterval(
      nextBillingDate,
      targetPlanType,
    );

    return {
      strategy,
      effectiveImmediately: true,
      effectiveDate: new Date(),
      currency,
      currentPlan: currentPlanSummary,
      targetPlan: targetPlanSummary,
      breakdown: {
        newPlanPrice: targetUnitAmount,
        prorationCredit: 0,
        subtotal: 0,
        total: 0,
        amountDueNow: 0,
        nextBillingDate,
        nextPeriodEndDate,
        nextBillingAmount: targetUnitAmount,
      },
    };
  }

  if (
    strategy === "schedule_at_period_end" ||
    strategy === "cancel_scheduled_change"
  ) {
    const effectiveDate = currentPeriodEnd || subscription.currentPeriodEnd;
    const nextPeriodEndDate = addBillingInterval(effectiveDate, targetPlanType);
    return {
      strategy,
      effectiveImmediately: false,
      effectiveDate,
      currency,
      currentPlan: currentPlanSummary,
      targetPlan: targetPlanSummary,
      breakdown: {
        newPlanPrice: targetUnitAmount,
        prorationCredit: 0,
        subtotal: 0,
        total: 0,
        amountDueNow: 0,
        nextBillingDate: effectiveDate,
        nextPeriodEndDate,
        nextBillingAmount: targetUnitAmount,
      },
    };
  }

  // Immediate same-interval package upgrade
  const previewInvoice = await stripe.invoices.createPreview({
    customer: subscription.stripeCustomerId,
    subscription: subscription.stripeSubscriptionId,
    subscription_details: {
      items: [{ id: currentItem.id, price: targetPriceId }],
      billing_cycle_anchor: "unchanged" as any,
      proration_behavior: "create_prorations",
      ...(stripeSubscription.cancel_at_period_end
        ? { cancel_at_period_end: false }
        : {}),
    },
  });

  let prorationCredit = 0;
  const nextBillingDate: Date =
    currentPeriodEnd || subscription.currentPeriodEnd;

  for (const line of previewInvoice.lines?.data || []) {
    const lineObj = line as any;
    const amount = (lineObj.amount || 0) / 100;
    if (amount < 0) {
      prorationCredit += Math.abs(amount);
    }
  }

  prorationCredit = Math.round(prorationCredit * 100) / 100;
  const subtotal = Math.round((previewInvoice.subtotal || 0)) / 100;
  const total = Math.round((previewInvoice.total || 0)) / 100;
  const amountDueNow = Math.max(
    0,
    Math.round((previewInvoice.amount_due || 0)) / 100,
  );
  const nextPeriodEndDate = addBillingInterval(nextBillingDate, targetPlanType);

  return {
    strategy,
    effectiveImmediately: true,
    effectiveDate: new Date(),
    currency: previewInvoice.currency || currency,
    currentPlan: currentPlanSummary,
    targetPlan: targetPlanSummary,
    breakdown: {
      newPlanPrice: targetUnitAmount,
      prorationCredit,
      subtotal,
      total,
      amountDueNow,
      nextBillingDate,
      nextPeriodEndDate,
      nextBillingAmount: targetUnitAmount,
    },
  };
};

// 3B. Change / Upgrade Subscription Plan or Billing Interval
const changeSubscriptionPlan = async (
  userId: string,
  payload: {
    packageId?: string;
    planType: PlanType;
  },
) => {
  const ctx = await resolvePlanChangeContext(
    userId,
    payload.packageId,
    payload.planType,
  );
  const {
    stripe,
    subscription,
    stripeSubscription,
    currentItem,
    targetPackage,
    targetPlanType,
    targetPriceId,
    strategy,
  } = ctx;

  const subObj = stripeSubscription as any;

  // Cancel any pending scheduled change if returning to current plan
  if (strategy === "cancel_scheduled_change") {
    await releaseActiveScheduleIfExists(stripe, stripeSubscription, subscription);
    await subscription.save();
    await subscription.populate(["packageId", "scheduledPackageId"]);

    return {
      message: "Scheduled plan change canceled; keeping your current plan",
      strategy,
      effectiveImmediately: true,
      subscription,
      invoice: null,
    };
  }

  // Schedule transition at currentPeriodEnd (Monthly -> Yearly = 1 year from end date; Yearly -> Monthly = 1 month from end date)
  if (strategy === "schedule_at_period_end") {
    await releaseActiveScheduleIfExists(stripe, stripeSubscription, subscription);

    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: stripeSubscription.id,
    });

    const currentPhase = schedule.phases[0];
    const phaseEndDate =
      currentPhase?.end_date ??
      subObj.current_period_end ??
      subObj.items?.data?.[0]?.current_period_end;

    const updatedSchedule = await stripe.subscriptionSchedules.update(
      schedule.id,
      {
        end_behavior: "release",
        phases: [
          {
            items: [
              {
                price: currentItem.price.id,
                quantity: currentItem.quantity ?? 1,
              },
            ],
            start_date: currentPhase.start_date,
            end_date: phaseEndDate,
          },
          {
            items: [
              {
                price: targetPriceId,
                quantity: 1,
              },
            ],
            iterations: 1,
            metadata: {
              paymentType: "subscription",
              userId,
              packageId: targetPackage._id.toString(),
              planType: targetPlanType,
            },
          } as any,
        ],
      },
    );

    if (stripeSubscription.cancel_at_period_end) {
      await stripe.subscriptions.update(stripeSubscription.id, {
        cancel_at_period_end: false,
      });
      subscription.cancelAtPeriodEnd = false;
    }

    const effectiveDate = phaseEndDate
      ? new Date(phaseEndDate * 1000)
      : subscription.currentPeriodEnd;
    const nextPeriodEndDate = addBillingInterval(effectiveDate, targetPlanType);

    subscription.stripeScheduleId = updatedSchedule.id;
    subscription.scheduledPackageId = targetPackage._id;
    subscription.scheduledPlanType = targetPlanType;
    subscription.scheduledChangeAt = effectiveDate;
    await subscription.save();
    await subscription.populate(["packageId", "scheduledPackageId"]);

    await sendNotifications({
      receiver: userId as any,
      title: "📅 Plan Change Scheduled",
      text: `Your subscription will switch to ${targetPackage.name} (${targetPlanType}) on ${effectiveDate.toLocaleDateString()} and run until ${nextPeriodEndDate.toLocaleDateString()}.`,
      type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
    });

    return {
      message: `Your subscription will switch to ${targetPackage.name} (${targetPlanType}) on ${effectiveDate.toLocaleDateString()} and remain active until ${nextPeriodEndDate.toLocaleDateString()}`,
      strategy,
      effectiveImmediately: false,
      effectiveDate,
      nextPeriodEndDate,
      subscription,
      invoice: null,
    };
  }

  // For immediate switches, release any existing schedule first
  await releaseActiveScheduleIfExists(stripe, stripeSubscription, subscription);

  const updateParams: Stripe.SubscriptionUpdateParams = {
    items: [{ id: currentItem.id, price: targetPriceId }],
    cancel_at_period_end: false,
    billing_cycle_anchor: "unchanged" as any,
    metadata: {
      ...(stripeSubscription.metadata || {}),
      paymentType: "subscription",
      userId,
      packageId: targetPackage._id.toString(),
      planType: targetPlanType,
    },
    expand: ["latest_invoice", "items.data.price"],
  };

  if (strategy === "trial_switch") {
    updateParams.proration_behavior = "none";
  } else {
    updateParams.proration_behavior = "always_invoice";
    updateParams.payment_behavior = "error_if_incomplete";
  }

  let updatedStripeSub: Stripe.Subscription;
  try {
    updatedStripeSub = await stripe.subscriptions.update(
      stripeSubscription.id,
      updateParams,
    );
  } catch (err: any) {
    const isPaymentFailure =
      err?.type === "StripeCardError" ||
      err?.statusCode === 402 ||
      err?.code === "invoice_payment_intent_requires_action" ||
      err?.code === "card_declined";

    if (isPaymentFailure) {
      throw new ApiError(
        StatusCodes.PAYMENT_REQUIRED,
        err?.message ||
          "Payment could not be completed automatically. Please update or verify your payment method in the billing portal and try again.",
        "PAYMENT_ACTION_REQUIRED",
      );
    }
    throw err;
  }

  const latestInvoice = (updatedStripeSub as any).latest_invoice as
    | Stripe.Invoice
    | string
    | null;
  const invoiceObj =
    latestInvoice && typeof latestInvoice === "object" ? latestInvoice : null;

  if (invoiceObj?.id) {
    subscription.latestInvoiceId = invoiceObj.id;
  }

  await syncSubscriptionFromStripe(subscription, updatedStripeSub, {
    packageId: targetPackage._id,
    planType: targetPlanType,
  });
  await subscription.populate(["packageId", "scheduledPackageId"]);

  const nextBillingDate =
    strategy === "trial_switch"
      ? subscription.trialEndsAt || subscription.currentPeriodEnd
      : subscription.currentPeriodEnd;

  const notificationText =
    strategy === "trial_switch"
      ? `Your plan has been switched to ${targetPackage.name} (${targetPlanType}). Your free trial remains active until ${nextBillingDate?.toLocaleDateString()}.`
      : `Your subscription is now ${targetPackage.name} (${targetPlanType}). Next billing date: ${nextBillingDate?.toLocaleDateString()}.`;

  await sendNotifications({
    receiver: userId as any,
    title: "🎉 Subscription Plan Updated!",
    text: notificationText,
    type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
  });

  return {
    message: `Subscription updated to ${targetPackage.name} (${targetPlanType}) successfully`,
    strategy,
    effectiveImmediately: true,
    subscription,
    invoice: invoiceObj
      ? {
          id: invoiceObj.id,
          amountPaid: Math.round((invoiceObj.amount_paid || 0)) / 100,
          currency: invoiceObj.currency,
          status: invoiceObj.status,
          hostedInvoiceUrl: invoiceObj.hosted_invoice_url,
          invoicePdf: invoiceObj.invoice_pdf,
        }
      : null,
  };
};

// 3C. Cancel a Scheduled Plan Change (e.g. scheduled Yearly -> Monthly downgrade)
const cancelScheduledPlanChange = async (userId: string) => {
  const stripe = getStripe();

  const subscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "trialing"] },
  }).sort({ createdAt: -1 });

  if (!subscription) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No active subscription found",
    );
  }

  if (!subscription.stripeScheduleId && !subscription.scheduledPlanType) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "There is no scheduled plan change on this subscription",
    );
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
  );

  await releaseActiveScheduleIfExists(stripe, stripeSubscription, subscription);
  await subscription.save();
  await subscription.populate(["packageId", "scheduledPackageId"]);

  return {
    message: "Scheduled plan change has been canceled",
    subscription,
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
    await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    subscription.status = "canceled";
    subscription.canceledAt = new Date();
    subscription.cancelAtPeriodEnd = false;
    subscription.stripeScheduleId = undefined;
    subscription.scheduledPackageId = undefined;
    subscription.scheduledPlanType = undefined;
    subscription.scheduledChangeAt = undefined;
    await subscription.save();
    return { message: "Subscription canceled immediately", subscription };
  } else {
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
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

// B. Handle invoice.payment_succeeded (recurring renewal, plan upgrade, or trial conversion to paid)
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
    { expand: ["items.data.price"] },
  );
  const subObj = stripeSubscription as any;

  const subscription = await Subscription.findOne({
    stripeSubscriptionId: subObj.id,
  });

  if (subscription) {
    const wasTrial = subscription.isTrial;
    subscription.latestInvoiceId = inv.id;

    const { planChanged } = await syncSubscriptionFromStripe(
      subscription,
      stripeSubscription,
    );

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

    // Plan update invoice (e.g. Monthly -> Yearly via Customer Portal or direct API)
    if (inv.billing_reason === "subscription_update") {
      if (planChanged) {
        await sendNotifications({
          receiver: subscription.userId as any,
          title: "✅ Subscription Plan Updated",
          text: `Your subscription has been updated to ${subscription.planType}. Next billing date: ${subscription.currentPeriodEnd.toLocaleDateString()}`,
          type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
        });
      }
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

// D. Handle customer.subscription.updated (Plan changes, interval switches, cancellations at period end)
const handleSubscriptionUpdated = async (
  stripeSubscription: Stripe.Subscription,
) => {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: stripeSubscription.id,
  });

  if (subscription) {
    await syncSubscriptionFromStripe(subscription, stripeSubscription);
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
    subscription.stripeScheduleId = undefined;
    subscription.scheduledPackageId = undefined;
    subscription.scheduledPlanType = undefined;
    subscription.scheduledChangeAt = undefined;
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
  previewPlanChange,
  changeSubscriptionPlan,
  cancelScheduledPlanChange,
  cancelSubscription,
  // Webhook handlers
  handleSubscriptionCheckoutCompleted,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleTrialWillEnd,
};
