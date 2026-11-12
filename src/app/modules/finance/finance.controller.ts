import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { FinanceService } from "./finance.service";

// 1. Get Landlord Finance Overview
const getLandlordOverview = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FinanceService.getLandlordOverviewFromDB(
    req.user,
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Landlord finance overview retrieved successfully",
    data: result,
  });
});

// 2. Get Bills / Transaction History (Scoped by Landlord or Tenant)
const getBills = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FinanceService.getBillsFromDB(req.user, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Bills retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// 2.1 Landlord Transaction History (Outstanding | Paid tabs)
const getLandlordTransactions = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await FinanceService.getLandlordTransactionsFromDB(
      req.user,
      req.query,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Transaction history retrieved successfully",
      meta: result.meta,
      data: result.data,
    });
  },
);

// 2.2 Get Record Payment Screen Data (Unpaid bills grouped by property)
const getRecordPaymentData = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await FinanceService.getRecordPaymentDataFromDB(
      req.user,
      req.query,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Record payment data retrieved successfully",
      data: result,
    });
  },
);

// 3. Get Single Bill Detail
const getSingleBill = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FinanceService.getSingleBillFromDB(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Bill details retrieved successfully",
    data: result,
  });
});

// 4. Create New Charge (Landlord)
const createCharge = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FinanceService.createChargeIntoDB(req.user, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Charge created successfully",
    data: result,
  });
});

// 5. Record Manual Payment (Unified - Landlord / Admin)
const recordPayment = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FinanceService.recordPaymentIntoDB(req.user, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Payment recorded successfully",
    data: result,
  });
});

// 7. Undo Recorded Payment (Landlord)
const undoPayment = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FinanceService.undoPaymentIntoDB(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Payment undone successfully",
    data: result,
  });
});

// 8. Cancel Unpaid Bill (Landlord)
const cancelBill = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FinanceService.cancelBillIntoDB(req.user, req.params.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Bill cancelled successfully",
    data: result,
  });
});

// 9. Get Reminder Candidates (Landlord)
const getReminderCandidates = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await FinanceService.getReminderCandidatesFromDB(req.user);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Reminder candidates retrieved successfully",
      data: result,
    });
  },
);

// 10. Send Payment Reminder (Landlord)
const sendPaymentReminder = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FinanceService.sendPaymentReminderIntoDB(
    req.user,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Payment reminders sent successfully",
    data: result,
  });
});

// 11. Tenant Overview (Tenant)
const getTenantOverview = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FinanceService.getTenantOverviewFromDB(req.user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Tenant finance overview retrieved successfully",
    data: result,
  });
});

// 12. Tenant Transactions (Tenant)
const getTenantTransactions = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await FinanceService.getTenantTransactionsFromDB(
      req.user,
      req.query,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Tenant transactions retrieved successfully",
      meta: result.meta,
      data: result.data,
    });
  },
);

// 13. Create Stripe Checkout Session (Tenant / Landlord)
const createStripeCheckoutSession = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await FinanceService.createStripeCheckoutSessionIntoDB(
      req.user,
      req.params.id,
      req.body,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Stripe checkout session created successfully",
      data: result,
    });
  },
);

// 14. Get Form Cascaded Options (Landlord)
const getLandlordFormOptions = catchAsync(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await FinanceService.getLandlordFormOptionsFromDB(req.user);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Landlord form options retrieved successfully",
      data: result,
    });
  },
);

// 15. Get Single Tenant Payments & History (Landlord CTA)
const getTenantPayments = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FinanceService.getLandlordTenantPaymentsFromDB(
    req.user,
    req.params.tenantId,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Tenant payment history retrieved successfully",
    data: result,
  });
});

export const FinanceController = {
  getLandlordOverview,
  getBills,
  getLandlordTransactions,
  getRecordPaymentData,
  getSingleBill,
  createCharge,
  recordPayment,
  undoPayment,
  cancelBill,
  getReminderCandidates,
  sendPaymentReminder,
  getTenantOverview,
  getTenantTransactions,
  createStripeCheckoutSession,
  getLandlordFormOptions,
  getTenantPayments,
};
