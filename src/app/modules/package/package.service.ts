import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { getStripe } from "../../../helpers/stripeHelper";
import { getCurrencyCode } from "../../../helpers/currencyHelper";
import { IPackage } from "./package.interface";
import { Package } from "./package.model";

const createPackageIntoDB = async (payload: IPackage): Promise<IPackage> => {
  const isExist = await Package.findOne({ name: payload.name });
  if (isExist) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "A package with this name already exists",
    );
  }

  // Auto-generate Stripe Product and Recurring Prices if not provided
  if (!payload.stripeMonthlyPriceId || !payload.stripeYearlyPriceId) {
    const stripe = getStripe();
    const currency = getCurrencyCode();

    // 1. Create Product in Stripe
    const product = await stripe.products.create({
      name: payload.name,
      description: payload.description || undefined,
      metadata: {
        maxProperties: String(payload.maxProperties),
        maxFlats: String(payload.maxFlats),
        hasTrial: String(payload.hasTrial),
        trialDays: String(payload.trialDays),
      },
    });

    // 2. Create Monthly Recurring Price
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(payload.monthlyPrice * 100), // convert to cents
      currency,
      recurring: {
        interval: "month",
      },
      metadata: {
        planType: "monthly",
        packageName: payload.name,
      },
    });

    // 3. Create Yearly Recurring Price
    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(payload.yearlyPrice * 100), // convert to cents
      currency,
      recurring: {
        interval: "year",
      },
      metadata: {
        planType: "yearly",
        packageName: payload.name,
      },
    });

    payload.stripeProductId = product.id;
    payload.stripeMonthlyPriceId = monthlyPrice.id;
    payload.stripeYearlyPriceId = yearlyPrice.id;
  }

  const result = await Package.create(payload);
  return result;
};

const getAllPackagesFromDB = async (query: Record<string, unknown> = {}) => {
  const filter: Record<string, unknown> = {};

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true" || query.isActive === true;
  }

  const result = await Package.find(filter).sort({ monthlyPrice: 1 });
  return result;
};

const getPackageByIdFromDB = async (id: string): Promise<IPackage | null> => {
  const result = await Package.findById(id);
  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Package not found");
  }
  return result;
};

const updatePackageIntoDB = async (
  id: string,
  payload: Partial<IPackage>,
): Promise<IPackage | null> => {
  const isExist = await Package.findById(id);
  if (!isExist) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Package not found");
  }

  const stripe = getStripe();
  const currency = getCurrencyCode();

  // If Stripe product exists, keep it updated
  if (isExist.stripeProductId) {
    try {
      if (payload.name || payload.description !== undefined) {
        await stripe.products.update(isExist.stripeProductId, {
          name: payload.name || isExist.name,
          description: payload.description || undefined,
        });
      }

      // If monthly price changed, create a new price in Stripe
      if (
        payload.monthlyPrice !== undefined &&
        payload.monthlyPrice !== isExist.monthlyPrice
      ) {
        const newMonthlyPrice = await stripe.prices.create({
          product: isExist.stripeProductId,
          unit_amount: Math.round(payload.monthlyPrice * 100),
          currency,
          recurring: { interval: "month" },
          metadata: { planType: "monthly", packageName: isExist.name },
        });
        payload.stripeMonthlyPriceId = newMonthlyPrice.id;
      }

      // If yearly price changed, create a new price in Stripe
      if (
        payload.yearlyPrice !== undefined &&
        payload.yearlyPrice !== isExist.yearlyPrice
      ) {
        const newYearlyPrice = await stripe.prices.create({
          product: isExist.stripeProductId,
          unit_amount: Math.round(payload.yearlyPrice * 100),
          currency,
          recurring: { interval: "year" },
          metadata: { planType: "yearly", packageName: isExist.name },
        });
        payload.stripeYearlyPriceId = newYearlyPrice.id;
      }
    } catch (err: any) {
      // Log stripe sync error but don't crash
      console.error("Stripe sync error during package update:", err.message);
    }
  }

  const result = await Package.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
  return result;
};

const deletePackageFromDB = async (id: string): Promise<IPackage | null> => {
  const isExist = await Package.findById(id);
  if (!isExist) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Package not found");
  }

  // Deactivate in Stripe if product exists
  if (isExist.stripeProductId) {
    try {
      const stripe = getStripe();
      await stripe.products.update(isExist.stripeProductId, { active: false });
    } catch (err: any) {
      console.error("Stripe deactivate error:", err.message);
    }
  }

  const result = await Package.findByIdAndUpdate(
    id,
    { isDeleted: true, isActive: false },
    { new: true },
  );
  return result;
};

export const PackageService = {
  createPackageIntoDB,
  getAllPackagesFromDB,
  getPackageByIdFromDB,
  updatePackageIntoDB,
  deletePackageFromDB,
};
