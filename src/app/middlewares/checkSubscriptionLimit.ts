import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../errors/ApiErrors";
import { USER_ROLES } from "../../enums/user";
import { Subscription } from "../modules/subscription/subscription.model";
import { Property } from "../modules/property/property.model";
import { Flat } from "../modules/flat/flat.model";

// 1. Guard for Property Creation Limit
export const checkPropertyLimit = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    // Admin & Super Admin bypass limit checks
    if (
      user.role === USER_ROLES.ADMIN ||
      user.role === USER_ROLES.SUPER_ADMIN
    ) {
      return next();
    }

    const landlordId = user.id;

    // Find active or trialing subscription
    const subscription = await Subscription.findOne({
      userId: landlordId,
      status: { $in: ["active", "trialing"] },
    }).populate("packageId");

    if (!subscription) {
      throw new ApiError(
        StatusCodes.PAYMENT_REQUIRED,
        "You do not have an active subscription or free trial. Please subscribe to a plan to create properties.",
      );
    }

    // Check if trial has expired
    if (
      subscription.status === "trialing" &&
      subscription.trialEndsAt &&
      new Date() > new Date(subscription.trialEndsAt)
    ) {
      throw new ApiError(
        StatusCodes.PAYMENT_REQUIRED,
        "Your free trial period has ended. Please upgrade your subscription to continue creating properties.",
      );
    }

    const pkg: any = subscription.packageId;
    if (!pkg) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Associated subscription package could not be found",
      );
    }

    // -1 represents Unlimited properties
    if (pkg.maxProperties !== -1) {
      const existingPropertiesCount = await Property.countDocuments({
        landlord: landlordId,
        isDeleted: { $ne: true },
      });

      if (existingPropertiesCount >= pkg.maxProperties) {
        throw new ApiError(
          StatusCodes.FORBIDDEN,
          `You have reached the limit of ${pkg.maxProperties} properties for your current plan (${pkg.name}). Please upgrade your plan to add more properties.`,
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// 2. Guard for Flat / Unit Creation Limit
export const checkFlatLimit = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    // Admin & Super Admin bypass limit checks
    if (
      user.role === USER_ROLES.ADMIN ||
      user.role === USER_ROLES.SUPER_ADMIN
    ) {
      return next();
    }

    const landlordId = user.id;

    // Find active or trialing subscription
    const subscription = await Subscription.findOne({
      userId: landlordId,
      status: { $in: ["active", "trialing"] },
    }).populate("packageId");

    if (!subscription) {
      throw new ApiError(
        StatusCodes.PAYMENT_REQUIRED,
        "You do not have an active subscription or free trial. Please subscribe to a plan to create units/flats.",
      );
    }

    // Check if trial has expired
    if (
      subscription.status === "trialing" &&
      subscription.trialEndsAt &&
      new Date() > new Date(subscription.trialEndsAt)
    ) {
      throw new ApiError(
        StatusCodes.PAYMENT_REQUIRED,
        "Your free trial period has ended. Please upgrade your subscription to continue creating units/flats.",
      );
    }

    const pkg: any = subscription.packageId;
    if (!pkg) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Associated subscription package could not be found",
      );
    }

    // -1 represents Unlimited flats
    if (pkg.maxFlats !== -1) {
      const existingFlatsCount = await Flat.countDocuments({
        landlord: landlordId,
        isDeleted: { $ne: true },
      });

      if (existingFlatsCount >= pkg.maxFlats) {
        throw new ApiError(
          StatusCodes.FORBIDDEN,
          `You have reached the limit of ${pkg.maxFlats} flats for your current plan (${pkg.name}). Please upgrade your plan to add more flats.`,
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};
