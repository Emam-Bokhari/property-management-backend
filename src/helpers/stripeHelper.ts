import Stripe from "stripe";
import config from "../config";
import ApiError from "../errors/ApiErrors";
import { StatusCodes } from "http-status-codes";

let stripeInstance: Stripe | null = null;

export const getStripe = (): Stripe => {
  const secretKey = config.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "Stripe secret key missing on server",
    );
  }
  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey);
  }
  return stripeInstance;
};
