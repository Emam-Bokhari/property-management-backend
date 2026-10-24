import { Schema, model } from "mongoose";
import { ISubscription, SubscriptionModel } from "./subscription.interface";

const subscriptionSchema = new Schema<ISubscription, SubscriptionModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    packageId: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    stripeCustomerId: {
      type: String,
      required: true,
      trim: true,
    },
    stripeSubscriptionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    planType: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
      ],
      default: "active",
      required: true,
      index: true,
    },
    isTrial: {
      type: Boolean,
      default: false,
    },
    trialStartsAt: {
      type: Date,
    },
    trialEndsAt: {
      type: Date,
    },
    currentPeriodStart: {
      type: Date,
      required: true,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    canceledAt: {
      type: Date,
    },
    latestInvoiceId: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export const Subscription = model<ISubscription, SubscriptionModel>(
  "Subscription",
  subscriptionSchema,
);
