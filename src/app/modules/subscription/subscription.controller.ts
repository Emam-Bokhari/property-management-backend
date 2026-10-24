import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { SubscriptionService } from "./subscription.service";

const createCheckoutSession = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;
    const { packageId, planType } = req.body;

    const result = await SubscriptionService.createCheckoutSession(
      userId,
      packageId,
      planType,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Subscription checkout session created successfully",
      data: result,
    });
  },
);

const createCustomerPortalSession = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;
    const result =
      await SubscriptionService.createCustomerPortalSession(userId);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Customer portal session created successfully",
      data: result,
    });
  },
);

const getMySubscription = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await SubscriptionService.getMySubscriptionFromDB(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Subscription details fetched successfully",
    data: result,
  });
});

const cancelSubscription = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { cancelImmediately } = req.body;

  const result = await SubscriptionService.cancelSubscription(
    userId,
    cancelImmediately,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result.subscription,
  });
});

export const SubscriptionController = {
  createCheckoutSession,
  createCustomerPortalSession,
  getMySubscription,
  cancelSubscription,
};
