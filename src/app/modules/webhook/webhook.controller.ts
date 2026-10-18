import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import { WebhookService } from "./webhook.service";

const handleStripeWebhook = catchAsync(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string | undefined;
  const rawBody = (req as any).rawBody ?? req.body;

  const result = await WebhookService.handleStripeWebhookIntoDB(
    rawBody,
    signature,
  );

  res.status(StatusCodes.OK).json(result);
});

export const WebhookController = {
  handleStripeWebhook,
};
