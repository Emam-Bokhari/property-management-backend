import { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { FinanceBill } from "./finance.model";
import {
  BILL_CATEGORY,
  BILL_STATUS,
  CHARGE_TYPE,
  PAYMENT_METHOD,
  WHO_IS_BILLED,
  financeSearchableFields,
} from "./finance.constant";
import {
  ICreateChargePayload,
  ICreateStripeCheckoutPayload,
  IRecordPaymentPayload,
  IRecordRentReceivedPayload,
  ISendReminderPayload,
} from "./finance.interface";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { Tenancy } from "../tenant/tenant.model";
import { notificationHelper } from "../../builder/pushNotification";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import { USER_ROLES } from "../../../enums/user";
import {
  getCurrencyCode,
  getCurrencySymbol,
} from "../../../helpers/currencyHelper";
import { Maintenance } from "../maintenance/maintenance.model";

// Common populate options
const billPopulateOptions = [
  {
    path: "tenant",
    select: "firstName lastName email phone role profileImage",
  },
  {
    path: "landlord",
    select: "firstName lastName email phone role profileImage companyName",
  },
  {
    path: "property",
    select: "propertyName streetAddress postCode propertyPhotos",
  },
  {
    path: "flat",
    select: "unitName floor rentPerMonth",
  },
];

// Helper: Generate sequential invoice number like INV-2026-1045
const generateInvoiceNumber = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const count = await FinanceBill.countDocuments({
    invoiceNumber: new RegExp(`^INV-${year}-`),
  });
  const sequence = (1000 + count + 1).toString();
  return `INV-${year}-${sequence}`;
};

// Helper: Format month period (e.g., "Jul 2026")
const formatMonthPeriod = (date: Date): string => {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

// Helper: Synchronize overdue status for pending bills
const syncBillStatus = (bill: any): string => {
  if (
    bill.status === BILL_STATUS.PAID ||
    bill.status === BILL_STATUS.CANCELLED
  ) {
    return bill.status;
  }
  const now = new Date();
  const dueDate = new Date(bill.dueDate);
  if (dueDate < now) {
    return BILL_STATUS.OVERDUE;
  }
  return BILL_STATUS.PENDING;
};

// Helper: Auto-sync / generate monthly rent bills for landlord's active tenancies
const syncMonthlyRentBillsForLandlord = async (landlordId: string) => {
  const activeTenancies = await Tenancy.find({
    landlord: new Types.ObjectId(landlordId),
    status: "active",
  }).lean();

  if (!activeTenancies.length) return;

  const now = new Date();
  const currentPeriod = formatMonthPeriod(now);
  const currentDueDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of month

  for (const tenancy of activeTenancies) {
    // Check if rent bill already exists for this tenant, flat, and period
    const existing = await FinanceBill.findOne({
      tenant: tenancy.tenant,
      flat: tenancy.flat,
      periodMonth: currentPeriod,
      billType: CHARGE_TYPE.RENT,
    });

    if (!existing) {
      const invoiceNumber = await generateInvoiceNumber();
      await FinanceBill.create({
        landlord: tenancy.landlord,
        property: tenancy.property,
        flat: tenancy.flat,
        tenant: tenancy.tenant,
        billType: CHARGE_TYPE.RENT,
        billCategory: BILL_CATEGORY.RENT,
        whoIsBilled: WHO_IS_BILLED.LEAD_TENANT,
        amount: tenancy.rentAmount || 0,
        dueDate: currentDueDate,
        periodMonth: currentPeriod,
        invoiceNumber,
        description: `${currentPeriod} rent`,
        status:
          currentDueDate < now ? BILL_STATUS.OVERDUE : BILL_STATUS.PENDING,
      });
    }
  }
};

// -------------------------------------------------------------
// 1. LANDLORD FINANCE OVERVIEW (Screenshot 1)
// -------------------------------------------------------------
const getLandlordOverviewFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const landlordId = authUser.userId || authUser.id;
  await syncMonthlyRentBillsForLandlord(landlordId);

  const now = new Date();
  const selectedPeriod = (query.period as string) || formatMonthPeriod(now);

  // Retrieve all bills for landlord for the current period and overall
  const bills = await FinanceBill.find({
    landlord: new Types.ObjectId(landlordId),
    status: { $ne: BILL_STATUS.CANCELLED },
  }).lean();

  // Helper calculation for a list of bills
  const calculateMetrics = (billList: any[], periodFilter?: string) => {
    let collected = 0;
    let expected = 0;
    let dueSoon = 0;
    let overdue = 0;
    let overdueCount = 0;
    let paidCount = 0;
    let outstandingCount = 0;

    billList.forEach((bill) => {
      const isPeriodMatch = !periodFilter || bill.periodMonth === periodFilter;
      const isPaid = bill.status === BILL_STATUS.PAID;
      const dueDate = new Date(bill.dueDate);
      const isOverdue = !isPaid && dueDate < now;
      const isDueSoon = !isPaid && dueDate >= now;

      if (isPeriodMatch) {
        if (isPaid) {
          collected += bill.paidAmount || bill.amount;
        }
        expected += bill.amount;
      }

      if (isPaid) {
        paidCount++;
      } else {
        outstandingCount++;
        if (isOverdue) {
          overdue += bill.amount;
          overdueCount++;
        } else if (isDueSoon) {
          dueSoon += bill.amount;
        }
      }
    });

    const outstanding = dueSoon + overdue;
    const collectedPercentage =
      expected > 0 ? Math.round((collected / expected) * 100) : 0;

    return {
      thisMonth: {
        collected,
        expected,
        percentage: collectedPercentage,
      },
      dueSoon,
      overdue,
      overdueCount,
      outstanding,
      paidCount,
      outstandingCount,
    };
  };

  const allMetrics = calculateMetrics(bills, selectedPeriod);
  const rentBills = bills.filter((b) => b.billCategory === BILL_CATEGORY.RENT);
  const rentMetrics = calculateMetrics(rentBills, selectedPeriod);
  const chargesBills = bills.filter(
    (b) => b.billCategory === BILL_CATEGORY.CHARGES,
  );
  const chargesMetrics = calculateMetrics(chargesBills, selectedPeriod);

  return {
    period: selectedPeriod,
    all: allMetrics,
    rent: rentMetrics,
    charges: chargesMetrics,
  };
};

// -------------------------------------------------------------
// 2. GET BILLS / TRANSACTION HISTORY (Landlord & Tenant) (Screenshots 1, 2, 4)
// -------------------------------------------------------------
const getBillsFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const filter: Record<string, any> = {};
  const currentUserId = authUser.userId || authUser.id;

  if (authUser.role === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(currentUserId);
  } else if (authUser.role === USER_ROLES.TENANT) {
    filter.tenant = new Types.ObjectId(currentUserId);
  }

  // Filter by outstanding vs paid tab
  if (query.filter_type === "outstanding") {
    filter.status = {
      $in: [BILL_STATUS.PENDING, BILL_STATUS.DUE, BILL_STATUS.OVERDUE],
    };
    delete query.filter_type;
  } else if (query.filter_type === "paid") {
    filter.status = BILL_STATUS.PAID;
    delete query.filter_type;
  } else if (query.status) {
    filter.status = query.status;
    delete query.status;
  }

  // Filter by category: all | rent | charges
  if (query.category === "rent") {
    filter.billCategory = BILL_CATEGORY.RENT;
    delete query.category;
  } else if (query.category === "charges") {
    filter.billCategory = BILL_CATEGORY.CHARGES;
    delete query.category;
  } else if (query.category === "all") {
    delete query.category;
  }

  // Filter by property
  if (query.property && Types.ObjectId.isValid(query.property as string)) {
    filter.property = new Types.ObjectId(query.property as string);
    delete query.property;
  }

  // Filter by flat
  if (query.flat && Types.ObjectId.isValid(query.flat as string)) {
    filter.flat = new Types.ObjectId(query.flat as string);
    delete query.flat;
  }

  // Filter by tenant
  if (query.tenant && Types.ObjectId.isValid(query.tenant as string)) {
    filter.tenant = new Types.ObjectId(query.tenant as string);
    delete query.tenant;
  }

  // Filter by periodMonth
  if (query.periodMonth) {
    filter.periodMonth = query.periodMonth;
    delete query.periodMonth;
  }

  const baseQuery = FinanceBill.find(filter).populate(billPopulateOptions);

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(financeSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [bills, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  // Synchronize dynamic status for response
  const enhancedBills = bills.map((bill: any) => {
    const computedStatus = syncBillStatus(bill);
    return {
      ...bill,
      status: computedStatus,
      statusLabel:
        computedStatus === BILL_STATUS.PAID
          ? "Paid"
          : computedStatus === BILL_STATUS.OVERDUE
            ? "Overdue"
            : "Due",
      displayType:
        bill.billType === CHARGE_TYPE.RENT
          ? "Rent"
          : bill.billType
              .split("_")
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
    };
  });

  return {
    meta,
    data: enhancedBills,
  };
};

// -------------------------------------------------------------
// 3. GET SINGLE BILL DETAIL (Screenshot 2)
// -------------------------------------------------------------
const getSingleBillFromDB = async (authUser: JwtPayload, id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid bill ID");
  }

  const bill = await FinanceBill.findById(id).populate(billPopulateOptions);
  if (!bill || bill.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Bill record not found");
  }

  const currentUserId = authUser.userId || authUser.id;
  const isLandlord = bill.landlord._id.toString() === currentUserId;
  const isTenant = bill.tenant._id.toString() === currentUserId;
  const isAdmin =
    authUser.role === USER_ROLES.ADMIN ||
    authUser.role === USER_ROLES.SUPER_ADMIN;

  if (!isLandlord && !isTenant && !isAdmin) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to view this bill",
    );
  }

  const computedStatus = syncBillStatus(bill);
  const billObj = bill.toObject();
  billObj.status = computedStatus as any;

  return {
    ...billObj,
    statusLabel:
      computedStatus === BILL_STATUS.PAID
        ? "Paid"
        : computedStatus === BILL_STATUS.OVERDUE
          ? "Overdue"
          : "Pending",
  };
};

// -------------------------------------------------------------
// 4. ADD CHARGE (Landlord) (Screenshot 2)
// -------------------------------------------------------------
const createChargeIntoDB = async (
  authUser: JwtPayload,
  payload: ICreateChargePayload,
) => {
  const landlordId = authUser.userId || authUser.id;

  if (!Types.ObjectId.isValid(payload.property)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }
  if (!Types.ObjectId.isValid(payload.flat)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat/unit ID");
  }

  // Verify property ownership
  const property = await Property.findById(payload.property);
  if (!property || property.landlord?.toString() !== landlordId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Property not found or does not belong to you",
    );
  }

  // Verify flat belongs to this property and landlord
  const flat = await Flat.findById(payload.flat);
  if (
    !flat ||
    flat.property.toString() !== payload.property ||
    flat.landlord?.toString() !== landlordId
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Flat does not belong to the selected property",
    );
  }

  // Determine target tenant(s)
  let targetTenantIds: string[] = [];

  if (payload.whoIsBilled === WHO_IS_BILLED.ALL_TENANTS_ON_UNIT) {
    // Collect all tenants currently associated with this flat
    const activeTenancies = await Tenancy.find({
      flat: new Types.ObjectId(payload.flat),
      status: "active",
    }).lean();

    if (activeTenancies.length > 0) {
      targetTenantIds = activeTenancies.map((t) => t.tenant.toString());
    } else if (flat.tenants && flat.tenants.length > 0) {
      targetTenantIds = flat.tenants.map((t) => t.toString());
    } else if (flat.tenant) {
      targetTenantIds = [flat.tenant.toString()];
    }
  } else if (payload.whoIsBilled === WHO_IS_BILLED.LEAD_TENANT) {
    if (flat.tenant) {
      targetTenantIds = [flat.tenant.toString()];
    } else {
      const tenancy = await Tenancy.findOne({
        flat: new Types.ObjectId(payload.flat),
        status: "active",
      }).lean();
      if (tenancy) {
        targetTenantIds = [tenancy.tenant.toString()];
      }
    }
  } else {
    // SPECIFIC_TENANT
    if (!payload.tenant || !Types.ObjectId.isValid(payload.tenant)) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Tenant ID is required for specific tenant billing",
      );
    }
    targetTenantIds = [payload.tenant];
  }

  if (targetTenantIds.length === 0) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "No active tenant found on this flat to bill",
    );
  }

  const dueDate = new Date(payload.dueDate);
  const periodMonth = formatMonthPeriod(dueDate);
  const createdBills = [];

  for (const tenantId of targetTenantIds) {
    const invoiceNumber = await generateInvoiceNumber();
    const newBill = await FinanceBill.create({
      landlord: new Types.ObjectId(landlordId),
      property: new Types.ObjectId(payload.property),
      flat: new Types.ObjectId(payload.flat),
      tenant: new Types.ObjectId(tenantId),
      billType: payload.chargeType,
      billCategory: BILL_CATEGORY.CHARGES,
      whoIsBilled: payload.whoIsBilled,
      amount: payload.amount,
      dueDate,
      periodMonth,
      invoiceNumber,
      description: payload.description || "",
      status: dueDate < new Date() ? BILL_STATUS.OVERDUE : BILL_STATUS.PENDING,
      recordedBy: new Types.ObjectId(landlordId),
    });

    createdBills.push(newBill);

    // Notify Tenant
    notificationHelper.sendToUser(tenantId, {
      title: "New Charge Added",
      body: `A new charge of ${getCurrencySymbol()}${payload.amount} has been issued for ${property.propertyName} (${flat.unitName}). Due date: ${dueDate.toLocaleDateString()}.`,
      type: NOTIFICATION_TYPE.RENT_REMINDER,
      data: {
        preferenceCategory: "rentReminders",
        referenceId: newBill._id.toString(),
        referenceModel: "Bill",
        billId: newBill._id.toString(),
        invoiceNumber,
        amount: payload.amount.toString(),
      },
    });
  }

  return createdBills;
};

// -------------------------------------------------------------
// 5. RECORD MANUAL PAYMENT (Landlord) (Screenshot 3)
// -------------------------------------------------------------
const recordPaymentIntoDB = async (
  authUser: JwtPayload,
  payload: IRecordPaymentPayload,
) => {
  const landlordId = authUser.userId || authUser.id;

  const bills = await FinanceBill.find({
    _id: { $in: payload.billIds.map((id) => new Types.ObjectId(id)) },
    landlord: new Types.ObjectId(landlordId),
    status: { $ne: BILL_STATUS.CANCELLED },
  });

  if (!bills.length) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No valid unpaid bills found for the provided IDs",
    );
  }

  const paymentDate = new Date(payload.paymentDate);
  const updatedBills = [];

  for (const bill of bills) {
    bill.status = BILL_STATUS.PAID;
    bill.paidAmount = bill.amount;
    bill.paidAt = paymentDate;
    bill.paymentMethod = payload.paymentMethod;
    bill.referenceNumber = payload.referenceNumber || null;
    bill.paymentNotes = payload.notes || null;
    bill.receiptSent = !!payload.receiptSentToTenant;
    bill.recordedBy = new Types.ObjectId(landlordId);

    await bill.save();
    updatedBills.push(bill);

    // Send receipt notification if requested
    if (payload.receiptSentToTenant) {
      notificationHelper.sendToUser(bill.tenant, {
        title: "Rent / Charge Payment Recorded",
        body: `Payment of ${getCurrencySymbol()}${bill.amount} for invoice ${bill.invoiceNumber} (${bill.periodMonth}) has been recorded by your landlord.`,
        type: NOTIFICATION_TYPE.RENT_REMINDER,
        data: {
          preferenceCategory: "rentReminders",
          referenceId: bill._id.toString(),
          referenceModel: "Bill",
          billId: bill._id.toString(),
          invoiceNumber: bill.invoiceNumber,
          paidAmount: bill.amount.toString(),
        },
      });
    }
  }

  return {
    recordedCount: updatedBills.length,
    bills: updatedBills,
  };
};

// -------------------------------------------------------------
// 6. RECORD RENT RECEIVED DIRECTLY (Landlord CTA Button)
// -------------------------------------------------------------
const recordRentReceivedIntoDB = async (
  authUser: JwtPayload,
  payload: IRecordRentReceivedPayload,
) => {
  const landlordId = authUser.userId || authUser.id;
  const paymentDate = new Date(payload.paymentDate);
  const periodMonth = payload.periodMonth || formatMonthPeriod(paymentDate);

  // Check if an existing unpaid rent bill exists for this tenant & flat & period
  let bill = await FinanceBill.findOne({
    landlord: new Types.ObjectId(landlordId),
    property: new Types.ObjectId(payload.property),
    flat: new Types.ObjectId(payload.flat),
    tenant: new Types.ObjectId(payload.tenant),
    periodMonth,
    billType: CHARGE_TYPE.RENT,
    status: { $ne: BILL_STATUS.CANCELLED },
  });

  if (bill) {
    bill.status = BILL_STATUS.PAID;
    bill.paidAmount = payload.amount;
    bill.paidAt = paymentDate;
    bill.paymentMethod = payload.paymentMethod;
    bill.referenceNumber = payload.referenceNumber || null;
    bill.paymentNotes = payload.notes || null;
    bill.receiptSent = !!payload.receiptSentToTenant;
    bill.recordedBy = new Types.ObjectId(landlordId);
    await bill.save();
  } else {
    const invoiceNumber = await generateInvoiceNumber();
    bill = await FinanceBill.create({
      landlord: new Types.ObjectId(landlordId),
      property: new Types.ObjectId(payload.property),
      flat: new Types.ObjectId(payload.flat),
      tenant: new Types.ObjectId(payload.tenant),
      billType: CHARGE_TYPE.RENT,
      billCategory: BILL_CATEGORY.RENT,
      whoIsBilled: WHO_IS_BILLED.LEAD_TENANT,
      amount: payload.amount,
      dueDate: paymentDate,
      periodMonth,
      invoiceNumber,
      description: `${periodMonth} rent`,
      status: BILL_STATUS.PAID,
      paidAmount: payload.amount,
      paidAt: paymentDate,
      paymentMethod: payload.paymentMethod,
      referenceNumber: payload.referenceNumber || null,
      paymentNotes: payload.notes || null,
      receiptSent: !!payload.receiptSentToTenant,
      recordedBy: new Types.ObjectId(landlordId),
    });
  }

  if (payload.receiptSentToTenant) {
    notificationHelper.sendToUser(payload.tenant, {
      title: "Rent Receipt Received",
      body: `Your rent payment of ${getCurrencySymbol()}${payload.amount} for ${periodMonth} has been confirmed. Invoice #${bill.invoiceNumber}.`,
      type: NOTIFICATION_TYPE.TENANT,
      data: {
        billId: bill._id.toString(),
        invoiceNumber: bill.invoiceNumber,
        amount: payload.amount.toString(),
      },
    });
  }

  const populated = await FinanceBill.findById(bill._id).populate(
    billPopulateOptions,
  );
  return populated;
};

// -------------------------------------------------------------
// 7. UNDO PAYMENT (Landlord) (Screenshot 2)
// -------------------------------------------------------------
const undoPaymentIntoDB = async (authUser: JwtPayload, id: string) => {
  const landlordId = authUser.userId || authUser.id;

  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid bill ID");
  }

  const bill = await FinanceBill.findOne({
    _id: new Types.ObjectId(id),
    landlord: new Types.ObjectId(landlordId),
  });

  if (!bill) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Bill not found");
  }

  if (bill.status !== BILL_STATUS.PAID) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Only paid bills can have payment undone",
    );
  }

  const now = new Date();
  bill.status = bill.dueDate < now ? BILL_STATUS.OVERDUE : BILL_STATUS.PENDING;
  bill.paidAmount = 0;
  bill.paidAt = null;
  bill.paymentMethod = null;
  bill.referenceNumber = null;
  bill.paymentNotes = null;
  bill.receiptSent = false;
  bill.stripePaymentIntentId = null;

  await bill.save();

  return await FinanceBill.findById(bill._id).populate(billPopulateOptions);
};

// -------------------------------------------------------------
// 8. CANCEL BILL (Landlord) (Screenshot 2)
// -------------------------------------------------------------
const cancelBillIntoDB = async (authUser: JwtPayload, id: string) => {
  const landlordId = authUser.userId || authUser.id;

  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid bill ID");
  }

  const bill = await FinanceBill.findOne({
    _id: new Types.ObjectId(id),
    landlord: new Types.ObjectId(landlordId),
  });

  if (!bill) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Bill not found");
  }

  if (bill.status === BILL_STATUS.PAID) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Paid bills cannot be cancelled. Undo payment first.",
    );
  }

  bill.status = BILL_STATUS.CANCELLED;
  bill.cancelledAt = new Date();
  await bill.save();

  return await FinanceBill.findById(bill._id).populate(billPopulateOptions);
};

// -------------------------------------------------------------
// 9. PAYMENT REMINDER CANDIDATES & SEND (Landlord) (Screenshot 3)
// -------------------------------------------------------------
const getReminderCandidatesFromDB = async (authUser: JwtPayload) => {
  const landlordId = authUser.userId || authUser.id;
  const now = new Date();

  const unpaidBills = await FinanceBill.find({
    landlord: new Types.ObjectId(landlordId),
    status: {
      $in: [BILL_STATUS.PENDING, BILL_STATUS.DUE, BILL_STATUS.OVERDUE],
    },
  })
    .populate(billPopulateOptions)
    .lean();

  let totalOutstanding = 0;
  const candidateMap = new Map<string, any>();

  unpaidBills.forEach((bill: any) => {
    totalOutstanding += bill.amount;
    const tenantId = bill.tenant?._id?.toString() || bill.tenant?.toString();
    const dueDate = new Date(bill.dueDate);
    const diffTime = now.getTime() - dueDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const isOverdue = dueDate < now;

    if (!candidateMap.has(tenantId)) {
      candidateMap.set(tenantId, {
        tenant: bill.tenant,
        property: bill.property,
        flat: bill.flat,
        bills: [],
        totalAmountDue: 0,
        isOverdue: false,
        statusText: isOverdue ? `${diffDays} days overdue` : "Due soon",
      });
    }

    const candidate = candidateMap.get(tenantId);
    candidate.bills.push(bill);
    candidate.totalAmountDue += bill.amount;
    if (isOverdue) {
      candidate.isOverdue = true;
      candidate.statusText = `${diffDays} days overdue`;
    }
  });

  return {
    totalOutstanding,
    tenantCount: candidateMap.size,
    candidates: Array.from(candidateMap.values()),
  };
};

const sendPaymentReminderIntoDB = async (
  authUser: JwtPayload,
  payload: ISendReminderPayload,
) => {
  const landlordId = authUser.userId || authUser.id;
  const targetTenantIds = new Set<string>();

  if (payload.tenantIds && payload.tenantIds.length > 0) {
    payload.tenantIds.forEach((id) => targetTenantIds.add(id));
  }

  if (payload.billIds && payload.billIds.length > 0) {
    const bills = await FinanceBill.find({
      _id: { $in: payload.billIds.map((id) => new Types.ObjectId(id)) },
      landlord: new Types.ObjectId(landlordId),
    }).select("tenant");

    bills.forEach((b) => targetTenantIds.add(b.tenant.toString()));
  }

  if (targetTenantIds.size === 0) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "No valid tenants or bills selected for reminder",
    );
  }

  const tenantIdArray = Array.from(targetTenantIds);
  const defaultMessage =
    payload.customMessage ||
    "Dear tenant, this is a reminder regarding your upcoming or overdue rent/charge payment. Please settle your balance at your earliest convenience.";

  notificationHelper.sendToBatch(tenantIdArray, {
    title: "Payment Reminder",
    body: defaultMessage,
    type: NOTIFICATION_TYPE.RENT_REMINDER,
    data: {
      preferenceCategory: "rentReminders",
    },
  });

  return {
    sentCount: tenantIdArray.length,
    message: "Payment reminders sent successfully",
  };
};

// -------------------------------------------------------------
// 10. TENANT OVERVIEW (Screenshot 4)
// -------------------------------------------------------------
const getTenantOverviewFromDB = async (authUser: JwtPayload) => {
  const tenantId = authUser.userId || authUser.id;
  const now = new Date();

  // Active Tenancy details
  const tenancy = await Tenancy.findOne({
    tenant: new Types.ObjectId(tenantId),
    status: "active",
  })
    .populate([
      {
        path: "property",
        select: "propertyName streetAddress postCode propertyPhotos",
      },
      { path: "flat", select: "unitName floor rentPerMonth" },
      { path: "landlord", select: "firstName lastName email phone" },
    ])
    .lean();

  // Next Rent Due
  const nextRentDue = await FinanceBill.findOne({
    tenant: new Types.ObjectId(tenantId),
    billType: CHARGE_TYPE.RENT,
    status: {
      $in: [BILL_STATUS.PENDING, BILL_STATUS.DUE, BILL_STATUS.OVERDUE],
    },
  })
    .sort({ dueDate: 1 })
    .lean();

  // Last Paid Rent
  const lastPaidRent = await FinanceBill.findOne({
    tenant: new Types.ObjectId(tenantId),
    billType: CHARGE_TYPE.RENT,
    status: BILL_STATUS.PAID,
  })
    .sort({ paidAt: -1 })
    .lean();

  // Pending Charges (extra charges like repair, utility, etc.)
  const pendingCharges = await FinanceBill.find({
    tenant: new Types.ObjectId(tenantId),
    billCategory: BILL_CATEGORY.CHARGES,
    status: {
      $in: [BILL_STATUS.PENDING, BILL_STATUS.DUE, BILL_STATUS.OVERDUE],
    },
  })
    .sort({ dueDate: 1 })
    .lean();

  return {
    activeTenancy: tenancy
      ? {
          tenancyId: tenancy._id,
          unitName: (tenancy.flat as any)?.unitName || "N/A",
          propertyAddress:
            `${(tenancy.property as any)?.streetAddress || ""} ${(tenancy.property as any)?.postCode || ""}`.trim(),
          propertyName: (tenancy.property as any)?.propertyName || "",
          rentAmount: tenancy.rentAmount,
          leaseStartDate: tenancy.leaseStartDate,
          leaseEndDate: tenancy.leaseEndDate,
        }
      : null,
    nextRentDue: nextRentDue
      ? {
          billId: nextRentDue._id,
          amount: nextRentDue.amount,
          dueDate: nextRentDue.dueDate,
          periodMonth: nextRentDue.periodMonth,
          status:
            new Date(nextRentDue.dueDate) < now ? "Overdue" : "Payment due",
          invoiceNumber: nextRentDue.invoiceNumber,
        }
      : null,
    lastPaid: lastPaidRent
      ? {
          amount: lastPaidRent.paidAmount || lastPaidRent.amount,
          paidAt: lastPaidRent.paidAt,
          periodMonth: lastPaidRent.periodMonth,
        }
      : null,
    pendingCharges: pendingCharges.map((c) => ({
      billId: c._id,
      title: c.description || c.billType.replace("_", " "),
      chargeType: c.billType,
      amount: c.amount,
      dueDate: c.dueDate,
      periodMonth: c.periodMonth,
      invoiceNumber: c.invoiceNumber,
    })),
  };
};

// -------------------------------------------------------------
// 11. TENANT TRANSACTION HISTORY (Screenshot 4)
// -------------------------------------------------------------
const getTenantTransactionsFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const tenantId = authUser.userId || authUser.id;
  const tab = (query.tab as string) || "rent"; // rent | extra_charges | maintenance

  // Outstanding Rent balance
  const unpaidRentBills = await FinanceBill.find({
    tenant: new Types.ObjectId(tenantId),
    billCategory: BILL_CATEGORY.RENT,
    status: {
      $in: [BILL_STATUS.PENDING, BILL_STATUS.DUE, BILL_STATUS.OVERDUE],
    },
  }).lean();

  const rentBalance = unpaidRentBills.reduce(
    (acc, curr) => acc + curr.amount,
    0,
  );
  const outstandingRentCount = unpaidRentBills.length;

  if (tab === "maintenance") {
    // Cross-query Maintenance module for maintenance payment transactions
    const maintenanceFilter: Record<string, any> = {
      tenant: new Types.ObjectId(tenantId),
    };
    const maintenanceQuery = Maintenance.find(maintenanceFilter)
      .populate([
        { path: "property", select: "propertyName streetAddress postCode" },
        { path: "flat", select: "unitName" },
      ])
      .sort({ createdAt: -1 });

    const maintenanceBuilder = new QueryBuilder(maintenanceQuery, query)
      .paginate()
      .fields();

    const [issues, meta] = await Promise.all([
      maintenanceBuilder.modelQuery.lean(),
      maintenanceBuilder.countTotal(),
    ]);

    return {
      rentBalance,
      outstandingRentCount,
      tab,
      meta,
      data: issues.map((iss: any) => ({
        id: iss._id,
        title: iss.issueTitle,
        category: "maintenance",
        amount: iss.invoiceAmount || 0,
        status: iss.paymentStatus || "unpaid",
        date: iss.paidAt || iss.createdAt,
        jobId: iss.jobId,
        invoiceStatus: iss.invoiceStatus,
      })),
    };
  }

  // Rent or Extra charges tab
  const filter: Record<string, any> = {
    tenant: new Types.ObjectId(tenantId),
    status: { $ne: BILL_STATUS.CANCELLED },
  };

  if (tab === "extra_charges") {
    filter.billCategory = BILL_CATEGORY.CHARGES;
  } else {
    // default rent
    filter.billCategory = BILL_CATEGORY.RENT;
  }

  const baseQuery = FinanceBill.find(filter)
    .populate(billPopulateOptions)
    .sort({ dueDate: -1 });

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(financeSearchableFields)
    .paginate()
    .fields();

  const [bills, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  const enhanced = bills.map((b: any) => {
    const computed = syncBillStatus(b);
    return {
      ...b,
      status: computed,
      statusLabel:
        computed === BILL_STATUS.PAID
          ? "Paid"
          : computed === BILL_STATUS.OVERDUE
            ? "Overdue"
            : "Due",
    };
  });

  return {
    rentBalance,
    outstandingRentCount,
    tab,
    meta,
    data: enhanced,
  };
};

// -------------------------------------------------------------
// 12. CREATE STRIPE CHECKOUT SESSION (Tenant Online Payment)
// -------------------------------------------------------------
const createStripeCheckoutSessionIntoDB = async (
  authUser: JwtPayload,
  billId: string,
  payload: ICreateStripeCheckoutPayload,
) => {
  const currentUserId = authUser.userId || authUser.id;

  if (!Types.ObjectId.isValid(billId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid bill ID");
  }

  const bill = await FinanceBill.findById(billId).populate(billPopulateOptions);
  if (!bill || bill.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Bill record not found");
  }

  if (bill.status === BILL_STATUS.PAID) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "This bill is already marked as paid",
    );
  }

  // Tenant or Landlord permission check
  const isTenant = bill.tenant._id.toString() === currentUserId;
  const isLandlord = bill.landlord._id.toString() === currentUserId;
  const isAdmin =
    authUser.role === USER_ROLES.ADMIN ||
    authUser.role === USER_ROLES.SUPER_ADMIN;

  if (!isTenant && !isLandlord && !isAdmin) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to pay this bill",
    );
  }

  const secretKey = config.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "Stripe secret key is not configured on the server",
    );
  }

  const stripe = new Stripe(secretKey);
  const clientBaseUrl = config.client_url || "http://localhost:3000";
  const successUrl =
    payload.successUrl ||
    `${clientBaseUrl}/finance/payment-success?session_id={CHECKOUT_SESSION_ID}&bill_id=${bill._id}`;
  const cancelUrl =
    payload.cancelUrl ||
    `${clientBaseUrl}/finance/payment-cancel?bill_id=${bill._id}`;

  const currency = getCurrencyCode();
  const billTitle =
    bill.billType === CHARGE_TYPE.RENT
      ? `${bill.periodMonth} Rent`
      : `${bill.billType.replace("_", " ")} - ${bill.description || bill.periodMonth}`;

  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: billTitle,
            description: `Invoice: ${bill.invoiceNumber} | Flat: ${(bill.flat as any)?.unitName || "N/A"}`,
          },
          unit_amount: Math.round(bill.amount * 100),
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: bill._id.toString(),
    metadata: {
      paymentType: "finance",
      billId: bill._id.toString(),
      payerId: currentUserId,
      payerRole: authUser.role,
      invoiceNumber: bill.invoiceNumber,
      amount: bill.amount.toString(),
    },
  });

  bill.stripeSessionId = session.id;
  await bill.save();

  return {
    paymentUrl: session.url,
    sessionId: session.id,
    amount: bill.amount,
    currency,
    invoiceNumber: bill.invoiceNumber,
  };
};

// -------------------------------------------------------------
// 13. HANDLE ROOT STRIPE WEBHOOK (Called by WebhookService)
// -------------------------------------------------------------
const handleStripePaymentSuccess = async (session: Stripe.Checkout.Session) => {
  const billId = session.metadata?.billId || session.client_reference_id;
  if (!billId || !Types.ObjectId.isValid(billId)) {
    return false;
  }

  const bill = await FinanceBill.findById(billId);
  if (!bill || bill.isDeleted) {
    return false;
  }

  if (bill.status === BILL_STATUS.PAID) {
    return true;
  }

  bill.status = BILL_STATUS.PAID;
  bill.paidAmount = bill.amount;
  bill.paidAt = new Date();
  bill.paymentMethod = PAYMENT_METHOD.STRIPE;
  bill.referenceNumber =
    (typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.id) || session.id;
  bill.stripePaymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;
  bill.receiptSent = true;

  if (
    session.metadata?.payerId &&
    Types.ObjectId.isValid(session.metadata.payerId)
  ) {
    bill.recordedBy = new Types.ObjectId(session.metadata.payerId);
  }

  await bill.save();

  // Notify Landlord & Tenant
  notificationHelper.sendToUser(bill.landlord, {
    title: "Rent / Charge Paid via Stripe",
    body: `Payment of ${getCurrencySymbol()}${bill.amount} for invoice ${bill.invoiceNumber} has been received.`,
    type: NOTIFICATION_TYPE.RENT_REMINDER,
    data: {
      preferenceCategory: "rentReminders",
      referenceId: bill._id.toString(),
      referenceModel: "Bill",
      billId: bill._id.toString(),
      invoiceNumber: bill.invoiceNumber,
    },
  });

  notificationHelper.sendToUser(bill.tenant, {
    title: "Payment Confirmation",
    body: `Your payment of ${getCurrencySymbol()}${bill.amount} for invoice ${bill.invoiceNumber} has been confirmed. Thank you!`,
    type: NOTIFICATION_TYPE.RENT_REMINDER,
    data: {
      preferenceCategory: "rentReminders",
      referenceId: bill._id.toString(),
      referenceModel: "Bill",
      billId: bill._id.toString(),
      invoiceNumber: bill.invoiceNumber,
    },
  });

  return true;
};

// -------------------------------------------------------------
// 15. GET FORM DROPDOWN OPTIONS (Landlord) (Screenshot 2 Cascaded Form)
// -------------------------------------------------------------
const getLandlordFormOptionsFromDB = async (authUser: JwtPayload) => {
  const landlordId = authUser.userId || authUser.id;

  // 1. Landlord's Properties
  const properties = await Property.find({
    landlord: new Types.ObjectId(landlordId),
  })
    .select("propertyName streetAddress postCode")
    .lean();

  const propertyIds = properties.map((p) => p._id);

  // 2. Flats belonging to these properties
  const flats = await Flat.find({
    property: { $in: propertyIds },
    landlord: new Types.ObjectId(landlordId),
  })
    .select("unitName floor floorNote property rentPerMonth tenant tenants")
    .populate([
      { path: "tenant", select: "firstName lastName email phone" },
      { path: "tenants", select: "firstName lastName email phone" },
    ])
    .lean();

  // 3. Active Tenancies for accurate tenant mappings
  const activeTenancies = await Tenancy.find({
    landlord: new Types.ObjectId(landlordId),
    status: "active",
  })
    .populate([
      { path: "tenant", select: "firstName lastName email phone" },
      { path: "flat", select: "unitName" },
      { path: "property", select: "propertyName" },
    ])
    .lean();

  return {
    properties,
    flats,
    tenancies: activeTenancies,
    enums: {
      chargeTypes: [
        CHARGE_TYPE.UTILITY_CHARGE,
        CHARGE_TYPE.REPAIR_CHARGE,
        CHARGE_TYPE.PENALTY,
        CHARGE_TYPE.SERVICE_CHARGE,
        CHARGE_TYPE.CUSTOM_CHARGE,
      ],
      whoIsBilledOptions: [
        WHO_IS_BILLED.LEAD_TENANT,
        WHO_IS_BILLED.SPECIFIC_TENANT,
        WHO_IS_BILLED.ALL_TENANTS_ON_UNIT,
      ],
      paymentMethods: [
        PAYMENT_METHOD.BANK_TRANSFER,
        PAYMENT_METHOD.CASH,
        PAYMENT_METHOD.CHEQUE,
        PAYMENT_METHOD.DIRECT_DEBIT,
        PAYMENT_METHOD.OTHER,
      ],
    },
  };
};

export const FinanceService = {
  getLandlordOverviewFromDB,
  getBillsFromDB,
  getSingleBillFromDB,
  createChargeIntoDB,
  recordPaymentIntoDB,
  recordRentReceivedIntoDB,
  undoPaymentIntoDB,
  cancelBillIntoDB,
  getReminderCandidatesFromDB,
  sendPaymentReminderIntoDB,
  getTenantOverviewFromDB,
  getTenantTransactionsFromDB,
  createStripeCheckoutSessionIntoDB,
  handleStripePaymentSuccess,
  getLandlordFormOptionsFromDB,
};
