import { Model, Types } from "mongoose";
import { IPackage } from "../package/package.interface";

export type SUBSCRIPTION_STATUS =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

export type ISubscription = {
  userId: Types.ObjectId;
  packageId: Types.ObjectId | IPackage;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planType: "monthly" | "yearly";
  status: SUBSCRIPTION_STATUS;
  isTrial: boolean;
  trialStartsAt?: Date;
  trialEndsAt?: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  latestInvoiceId?: string;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export type SubscriptionModel = Model<ISubscription>;
