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
import { TENANCY_STATUS } from "../tenant/tenant.constant";
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
  const d = new Date(date);
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

// Helper: Normalize periodMonth to 1st of month in UTC
const parsePeriodMonthToDate = (
  val: string | Date | undefined | null,
): Date => {
  if (!val) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  if (val instanceof Date) {
    return new Date(Date.UTC(val.getUTCFullYear(), val.getUTCMonth(), 1));
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    const match = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (match) {
      const monthNames = [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ];
      const monthPrefix = match[1].toLowerCase().slice(0, 3);
      const mIdx = monthNames.indexOf(monthPrefix);
      if (mIdx !== -1) {
        return new Date(Date.UTC(parseInt(match[2], 10), mIdx, 1));
      }
    }
  }
  const date = new Date(val);
  if (isNaN(date.getTime())) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

// Helper: Synchronize overdue status for pending bills
const syncBillStatus = (bill: any): string => {
  if (bill.status === BILL_STATUS.CANCELLED) {
    return bill.status;
  }
  const paidAmount = Number(bill.paidAmount) || 0;
  const totalAmount = Number(bill.amount) || 0;

  if (paidAmount >= totalAmount && totalAmount > 0) {
    return BILL_STATUS.PAID;
  }

  if (paidAmount > 0 && paidAmount < totalAmount) {
    return BILL_STATUS.PARTIAL;
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
  const currentPeriodDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextPeriodDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const currentPeriodString = formatMonthPeriod(currentPeriodDate);
  const currentDueDate = currentPeriodDate; // 1st of month

  for (const tenancy of activeTenancies) {
    // Check if rent bill already exists for this tenant, flat, and period
    const existing = await FinanceBill.findOne({
      tenant: tenancy.tenant,
      flat: tenancy.flat,
      billType: CHARGE_TYPE.RENT,
      $or: [
        { periodMonth: currentPeriodDate },
        {
          periodMonth: {
            $gte: currentPeriodDate,
            $lt: nextPeriodDate,
          },
        },
      ],
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
        periodMonth: currentPeriodDate,
        invoiceNumber,
        description: `${currentPeriodString} rent`,
        status:
          currentDueDate < now ? BILL_STATUS.OVERDUE : BILL_STATUS.PENDING,
      });
    }
  }
};

// Helper: Auto-sync / generate monthly rent bills for a tenant's active tenancies
const syncMonthlyRentBillsForTenant = async (tenantId: string) => {
  const activeTenancies = await Tenancy.find({
    tenant: new Types.ObjectId(tenantId),
    status: "active",
  }).lean();

  if (!activeTenancies.length) return;

  const now = new Date();
  const currentPeriodDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextPeriodDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const currentPeriodString = formatMonthPeriod(currentPeriodDate);
  const currentDueDate = currentPeriodDate; // 1st of month

  for (const tenancy of activeTenancies) {
    const existing = await FinanceBill.findOne({
      tenant: tenancy.tenant,
      flat: tenancy.flat,
      billType: CHARGE_TYPE.RENT,
      $or: [
        { periodMonth: currentPeriodDate },
        {
          periodMonth: {
            $gte: currentPeriodDate,
            $lt: nextPeriodDate,
          },
        },
      ],
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
        periodMonth: currentPeriodDate,
        invoiceNumber,
        description: `${currentPeriodString} rent`,
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
  const selectedPeriod = query.period
    ? formatMonthPeriod(parsePeriodMonthToDate(query.period as string))
    : formatMonthPeriod(now);

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
      const billPeriodStr =
        bill.periodMonth instanceof Date
          ? formatMonthPeriod(bill.periodMonth)
          : String(bill.periodMonth || "");
      const isPeriodMatch = !periodFilter || billPeriodStr === periodFilter;
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
    const pDate = parsePeriodMonthToDate(query.periodMonth as string);
    const nextPDate = new Date(
      Date.UTC(pDate.getUTCFullYear(), pDate.getUTCMonth() + 1, 1),
    );
    filter.$or = [
      { periodMonth: pDate },
      { periodMonth: { $gte: pDate, $lt: nextPDate } },
      { periodMonth: formatMonthPeriod(pDate) },
    ];
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
  const currentUserId = authUser.userId || authUser.id;
  const isLandlord = authUser.role === USER_ROLES.LANDLORD;

  if (!Types.ObjectId.isValid(payload.property)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }
  if (!Types.ObjectId.isValid(payload.flat)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat/unit ID");
  }

  // Verify property
  const property = await Property.findById(payload.property);
  if (!property) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }
  if (isLandlord && property.landlord?.toString() !== currentUserId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Property does not belong to you",
    );
  }

  // Verify flat belongs to this property
  const flat = await Flat.findById(payload.flat);
  if (
    !flat ||
    flat.property.toString() !== payload.property ||
    (isLandlord && flat.landlord?.toString() !== currentUserId)
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Flat does not belong to the selected property",
    );
  }

  const landlordId = property.landlord?.toString() || currentUserId;

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
  const periodDate = parsePeriodMonthToDate(dueDate);
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
      periodMonth: periodDate,
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
// 5. RECORD MANUAL PAYMENT (Landlord / Admin) (Screenshot 3)
// -------------------------------------------------------------
const recordPaymentIntoDB = async (
  authUser: JwtPayload,
  payload: IRecordPaymentPayload,
) => {
  const currentUserId = authUser.userId || authUser.id;
  const isLandlord = authUser.role === USER_ROLES.LANDLORD;

  const filter: Record<string, any> = {
    _id: { $in: payload.billIds.map((id) => new Types.ObjectId(id)) },
    status: { $ne: BILL_STATUS.CANCELLED },
  };

  if (isLandlord) {
    filter.landlord = new Types.ObjectId(currentUserId);
  }

  const bills = await FinanceBill.find(filter);

  if (!bills.length) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No valid unpaid bills found for the provided IDs",
    );
  }

  const paymentDate = new Date(payload.paymentDate);
  const updatedBills = [];
  let remainingPayment =
    payload.amountReceived !== undefined ? payload.amountReceived : Infinity;

  for (const bill of bills) {
    const currentPaid = bill.paidAmount || 0;
    const needed = Math.max(0, bill.amount - currentPaid);
    let paymentAllocated = needed;

    if (remainingPayment !== Infinity) {
      paymentAllocated = Math.min(needed, remainingPayment);
      remainingPayment -= paymentAllocated;
    }

    const newPaidAmount = currentPaid + paymentAllocated;
    bill.paidAmount = newPaidAmount;
    bill.paidAt = paymentDate;
    bill.paymentMethod = payload.paymentMethod;
    bill.referenceNumber = payload.referenceNumber || null;
    bill.paymentNotes = payload.notes || null;
    bill.receiptSent = !!payload.receiptSentToTenant;
    bill.recordedBy = new Types.ObjectId(currentUserId);
    bill.status =
      newPaidAmount >= bill.amount ? BILL_STATUS.PAID : BILL_STATUS.PARTIAL;

    await bill.save();
    updatedBills.push(bill);

    // Send receipt notification if requested
    if (payload.receiptSentToTenant && paymentAllocated > 0) {
      notificationHelper.sendToUser(bill.tenant, {
        title: "Rent / Charge Payment Recorded",
        body: `Payment of ${getCurrencySymbol()}${paymentAllocated} for invoice ${bill.invoiceNumber} (${bill.periodMonth}) has been recorded by your landlord.`,
        type: NOTIFICATION_TYPE.RENT_REMINDER,
        data: {
          preferenceCategory: "rentReminders",
          referenceId: bill._id.toString(),
          referenceModel: "Bill",
          billId: bill._id.toString(),
          invoiceNumber: bill.invoiceNumber,
          paidAmount: paymentAllocated.toString(),
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
  const currentUserId = authUser.userId || authUser.id;
  const isLandlord = authUser.role === USER_ROLES.LANDLORD;
  const paymentDate = new Date(payload.paymentDate);

  // Normalize periodMonth to 1st of month Date in UTC
  const periodDate = parsePeriodMonthToDate(payload.periodMonth || paymentDate);
  const nextPeriodDate = new Date(
    Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth() + 1, 1),
  );
  const periodMonthString = formatMonthPeriod(periodDate);

  // Fetch tenancy to know the actual agreed monthly rent
  const tenancyFilter: Record<string, any> = {
    property: new Types.ObjectId(payload.property),
    flat: new Types.ObjectId(payload.flat),
    tenant: new Types.ObjectId(payload.tenant),
    status: { $ne: "terminated" },
  };
  if (isLandlord) {
    tenancyFilter.landlord = new Types.ObjectId(currentUserId);
  }

  const tenancy = await Tenancy.findOne(tenancyFilter).lean();
  const landlordId = tenancy?.landlord?.toString() || currentUserId;
  const fullRentAmount = tenancy?.rentAmount || payload.amount;

  // Check if an existing rent bill exists for this tenant & flat & period
  let bill = await FinanceBill.findOne({
    property: new Types.ObjectId(payload.property),
    flat: new Types.ObjectId(payload.flat),
    tenant: new Types.ObjectId(payload.tenant),
    billType: CHARGE_TYPE.RENT,
    status: { $ne: BILL_STATUS.CANCELLED },
    $or: [
      { periodMonth: periodDate },
      {
        periodMonth: {
          $gte: periodDate,
          $lt: nextPeriodDate,
        },
      },
      { periodMonth: periodMonthString as any },
    ],
  });

  if (bill) {
    if (bill.amount < fullRentAmount) {
      bill.amount = fullRentAmount;
    }
    let newPaidAmount = payload.amount;
    if (bill.paidAmount && bill.paidAmount > 0 && payload.amount < bill.amount) {
      newPaidAmount = Math.min(bill.amount, bill.paidAmount + payload.amount);
    }
    bill.paidAmount = newPaidAmount;
    bill.paidAt = paymentDate;
    bill.paymentMethod = payload.paymentMethod;
    bill.referenceNumber = payload.referenceNumber || null;
    bill.paymentNotes = payload.notes || null;
    bill.receiptSent = !!payload.receiptSentToTenant;
    bill.recordedBy = new Types.ObjectId(currentUserId);
    bill.periodMonth = periodDate;
    bill.status =
      newPaidAmount >= bill.amount ? BILL_STATUS.PAID : BILL_STATUS.PARTIAL;
    await bill.save();
  } else {
    const invoiceNumber = await generateInvoiceNumber();
    const isFullPayment = payload.amount >= fullRentAmount;

    bill = await FinanceBill.create({
      landlord: new Types.ObjectId(landlordId),
      property: new Types.ObjectId(payload.property),
      flat: new Types.ObjectId(payload.flat),
      tenant: new Types.ObjectId(payload.tenant),
      billType: CHARGE_TYPE.RENT,
      billCategory: BILL_CATEGORY.RENT,
      whoIsBilled: WHO_IS_BILLED.LEAD_TENANT,
      amount: fullRentAmount,
      dueDate: paymentDate,
      periodMonth: periodDate,
      invoiceNumber,
      description: `${periodMonthString} rent`,
      status: isFullPayment ? BILL_STATUS.PAID : BILL_STATUS.PARTIAL,
      paidAmount: payload.amount,
      paidAt: paymentDate,
      paymentMethod: payload.paymentMethod,
      referenceNumber: payload.referenceNumber || null,
      paymentNotes: payload.notes || null,
      receiptSent: !!payload.receiptSentToTenant,
      recordedBy: new Types.ObjectId(currentUserId),
    });
  }

  if (payload.receiptSentToTenant) {
    notificationHelper.sendToUser(payload.tenant, {
      title: "Rent Receipt Received",
      body: `Your rent payment of ${getCurrencySymbol()}${payload.amount} for ${periodMonthString} has been confirmed. Invoice #${bill.invoiceNumber}.`,
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
// 7. UNDO PAYMENT (Landlord / Admin) (Screenshot 2)
// -------------------------------------------------------------
const undoPaymentIntoDB = async (authUser: JwtPayload, id: string) => {
  const currentUserId = authUser.userId || authUser.id;

  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid bill ID");
  }

  const filter: Record<string, any> = {
    _id: new Types.ObjectId(id),
  };
  if (authUser.role === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(currentUserId);
  }

  const bill = await FinanceBill.findOne(filter);

  if (!bill) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Bill not found");
  }

  if (bill.status !== BILL_STATUS.PAID && bill.status !== BILL_STATUS.PARTIAL) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Only paid or partially paid bills can have payment undone",
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
// 8. CANCEL BILL (Landlord / Admin) (Screenshot 2)
// -------------------------------------------------------------
const cancelBillIntoDB = async (authUser: JwtPayload, id: string) => {
  const currentUserId = authUser.userId || authUser.id;

  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid bill ID");
  }

  const filter: Record<string, any> = {
    _id: new Types.ObjectId(id),
  };
  if (authUser.role === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(currentUserId);
  }

  const bill = await FinanceBill.findOne(filter);

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
  const currentUserId = authUser.userId || authUser.id;
  const now = new Date();

  const filter: Record<string, any> = {
    status: {
      $in: [
        BILL_STATUS.PENDING,
        BILL_STATUS.DUE,
        BILL_STATUS.OVERDUE,
        BILL_STATUS.PARTIAL,
      ],
    },
  };
  if (authUser.role === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(currentUserId);
  }

  const unpaidBills = await FinanceBill.find(filter)
    .populate(billPopulateOptions)
    .lean();

  let totalOutstanding = 0;
  const candidateMap = new Map<string, any>();

  unpaidBills.forEach((bill: any) => {
    const remainingDue = Math.max(0, bill.amount - (bill.paidAmount || 0));
    if (remainingDue <= 0) return;

    totalOutstanding += remainingDue;
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
    candidate.bills.push({
      ...bill,
      dueAmount: remainingDue,
    });
    candidate.totalAmountDue += remainingDue;
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
  await syncMonthlyRentBillsForTenant(tenantId);
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

  // Next Rent Due: Earliest unpaid or partially paid rent bill
  const pendingRentBills = await FinanceBill.find({
    tenant: new Types.ObjectId(tenantId),
    billType: CHARGE_TYPE.RENT,
    status: {
      $in: [
        BILL_STATUS.PENDING,
        BILL_STATUS.DUE,
        BILL_STATUS.OVERDUE,
        BILL_STATUS.PARTIAL,
      ],
    },
  })
    .sort({ dueDate: 1 })
    .lean();

  const nextRentDue = pendingRentBills.find(
    (b) => b.amount - (b.paidAmount || 0) > 0,
  );

  // Last Paid Rent: Most recent payment towards rent
  const lastPaidRent = await FinanceBill.findOne({
    tenant: new Types.ObjectId(tenantId),
    billType: CHARGE_TYPE.RENT,
    paidAt: { $ne: null },
    paidAmount: { $gt: 0 },
  })
    .sort({ paidAt: -1 })
    .lean();

  // Pending Charges (extra charges like repair, utility, etc.)
  const pendingCharges = await FinanceBill.find({
    tenant: new Types.ObjectId(tenantId),
    billCategory: BILL_CATEGORY.CHARGES,
    status: {
      $in: [
        BILL_STATUS.PENDING,
        BILL_STATUS.DUE,
        BILL_STATUS.OVERDUE,
        BILL_STATUS.PARTIAL,
      ],
    },
  })
    .sort({ dueDate: 1 })
    .lean();

  // Calculate balances
  const rentBalance = pendingRentBills.reduce(
    (acc, curr) => acc + Math.max(0, curr.amount - (curr.paidAmount || 0)),
    0,
  );
  const outstandingRentCount = pendingRentBills.filter(
    (b) => b.amount - (b.paidAmount || 0) > 0,
  ).length;

  const chargesBalance = pendingCharges.reduce(
    (acc, curr) => acc + Math.max(0, curr.amount - (curr.paidAmount || 0)),
    0,
  );
  const outstandingChargesCount = pendingCharges.filter(
    (b) => b.amount - (b.paidAmount || 0) > 0,
  ).length;

  return {
    summary: {
      rentBalance,
      chargesBalance,
      totalDue: rentBalance + chargesBalance,
      outstandingRentCount,
      outstandingChargesCount,
      currency: getCurrencyCode(),
      currencySymbol: getCurrencySymbol(),
    },
    rentBalance,
    chargesBalance,
    totalOutstandingBalance: rentBalance + chargesBalance,
    outstandingRentCount,
    outstandingChargesCount,
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
          amount: Math.max(
            0,
            nextRentDue.amount - (nextRentDue.paidAmount || 0),
          ),
          totalAmount: nextRentDue.amount,
          paidAmount: nextRentDue.paidAmount || 0,
          dueAmount: Math.max(
            0,
            nextRentDue.amount - (nextRentDue.paidAmount || 0),
          ),
          dueDate: nextRentDue.dueDate,
          periodMonth: nextRentDue.periodMonth,
          formattedPeriodMonth:
            nextRentDue.periodMonth instanceof Date
              ? formatMonthPeriod(nextRentDue.periodMonth)
              : nextRentDue.periodMonth,
          status:
            new Date(nextRentDue.dueDate) < now
              ? (nextRentDue.paidAmount || 0) > 0
                ? "Partially paid (Overdue)"
                : "Overdue"
              : (nextRentDue.paidAmount || 0) > 0
                ? "Partially paid"
                : "Payment due",
          rawStatus: syncBillStatus(nextRentDue),
          invoiceNumber: nextRentDue.invoiceNumber,
        }
      : null,
    lastPaid: lastPaidRent
      ? {
          billId: lastPaidRent._id,
          amount: lastPaidRent.paidAmount || lastPaidRent.amount,
          totalBillAmount: lastPaidRent.amount,
          paidAt: lastPaidRent.paidAt,
          periodMonth: lastPaidRent.periodMonth,
          formattedPeriodMonth:
            lastPaidRent.periodMonth instanceof Date
              ? formatMonthPeriod(lastPaidRent.periodMonth)
              : lastPaidRent.periodMonth,
          invoiceNumber: lastPaidRent.invoiceNumber,
        }
      : null,
    pendingCharges: pendingCharges
      .filter((c) => c.amount - (c.paidAmount || 0) > 0)
      .map((c) => {
        const remaining = Math.max(0, c.amount - (c.paidAmount || 0));
        return {
          billId: c._id,
          title: c.description || c.billType.replace("_", " "),
          chargeType: c.billType,
          amount: remaining,
          totalAmount: c.amount,
          paidAmount: c.paidAmount || 0,
          dueAmount: remaining,
          dueDate: c.dueDate,
          periodMonth: c.periodMonth,
          formattedPeriodMonth:
            c.periodMonth instanceof Date
              ? formatMonthPeriod(c.periodMonth)
              : c.periodMonth,
          invoiceNumber: c.invoiceNumber,
          status:
            new Date(c.dueDate) < now
              ? (c.paidAmount || 0) > 0
                ? "Partially paid (Overdue)"
                : "Overdue"
              : (c.paidAmount || 0) > 0
                ? "Partially paid"
                : "Payment due",
          rawStatus: syncBillStatus(c),
        };
      }),
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
  await syncMonthlyRentBillsForTenant(tenantId);
  const tab = (query.tab as string) || "rent"; // rent | extra_charges | maintenance
  const now = new Date();

  // Outstanding Rent balance
  const unpaidRentBills = await FinanceBill.find({
    tenant: new Types.ObjectId(tenantId),
    billCategory: BILL_CATEGORY.RENT,
    status: {
      $in: [
        BILL_STATUS.PENDING,
        BILL_STATUS.DUE,
        BILL_STATUS.OVERDUE,
        BILL_STATUS.PARTIAL,
      ],
    },
  }).lean();

  const rentBalance = unpaidRentBills.reduce(
    (acc, curr) => acc + Math.max(0, curr.amount - (curr.paidAmount || 0)),
    0,
  );
  const outstandingRentCount = unpaidRentBills.filter(
    (b) => b.amount - (b.paidAmount || 0) > 0,
  ).length;

  // Outstanding Extra Charges balance
  const unpaidChargeBills = await FinanceBill.find({
    tenant: new Types.ObjectId(tenantId),
    billCategory: BILL_CATEGORY.CHARGES,
    status: {
      $in: [
        BILL_STATUS.PENDING,
        BILL_STATUS.DUE,
        BILL_STATUS.OVERDUE,
        BILL_STATUS.PARTIAL,
      ],
    },
  }).lean();

  const chargesBalance = unpaidChargeBills.reduce(
    (acc, curr) => acc + Math.max(0, curr.amount - (curr.paidAmount || 0)),
    0,
  );
  const outstandingChargesCount = unpaidChargeBills.filter(
    (b) => b.amount - (b.paidAmount || 0) > 0,
  ).length;

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
      chargesBalance,
      totalOutstandingBalance: rentBalance + chargesBalance,
      outstandingRentCount,
      outstandingChargesCount,
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
    const isOverdue =
      new Date(b.dueDate) < now && computed !== BILL_STATUS.PAID;
    const dueAmount = Math.max(0, (b.amount || 0) - (b.paidAmount || 0));
    const formattedPeriodMonth =
      b.periodMonth instanceof Date
        ? formatMonthPeriod(b.periodMonth)
        : b.periodMonth;

    return {
      ...b,
      dueAmount,
      formattedPeriodMonth,
      status: computed,
      statusLabel:
        computed === BILL_STATUS.PAID
          ? "Paid"
          : computed === BILL_STATUS.PARTIAL
            ? isOverdue
              ? "Partially paid (Overdue)"
              : "Partially paid"
            : computed === BILL_STATUS.OVERDUE
              ? "Overdue"
              : "Due",
    };
  });

  return {
    rentBalance,
    chargesBalance,
    totalOutstandingBalance: rentBalance + chargesBalance,
    outstandingRentCount,
    outstandingChargesCount,
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

// -------------------------------------------------------------
// 15. GET TENANT PAYMENTS & HISTORY (Landlord CTA)
// -------------------------------------------------------------
const getLandlordTenantPaymentsFromDB = async (
  authUser: JwtPayload,
  tenantId: string,
) => {
  const landlordId = authUser.userId || authUser.id;

  if (!Types.ObjectId.isValid(tenantId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid tenant ID");
  }

  // 1. Strict tenancy verification:
  // Must verify that this tenant belongs to the logged-in landlord (unless admin/super_admin)
  const tenancyFilter: Record<string, any> = {
    tenant: new Types.ObjectId(tenantId),
  };

  if (
    authUser.role !== USER_ROLES.ADMIN &&
    authUser.role !== USER_ROLES.SUPER_ADMIN
  ) {
    tenancyFilter.landlord = new Types.ObjectId(landlordId);
  }

  // Prefer active tenancy, fallback to latest tenancy
  let tenancy = await Tenancy.findOne({
    ...tenancyFilter,
    status: TENANCY_STATUS.ACTIVE,
  })
    .populate([
      {
        path: "property",
        select: "propertyName streetAddress postCode propertyPhotos",
      },
      { path: "flat", select: "unitName floor rentPerMonth flatNumber" },
      {
        path: "tenant",
        select: "name firstName lastName email phone profileImage",
      },
      { path: "landlord", select: "name firstName lastName email phone" },
    ])
    .lean();

  if (!tenancy) {
    tenancy = await Tenancy.findOne(tenancyFilter)
      .populate([
        {
          path: "property",
          select: "propertyName streetAddress postCode propertyPhotos",
        },
        { path: "flat", select: "unitName floor rentPerMonth flatNumber" },
        {
          path: "tenant",
          select: "name firstName lastName email phone profileImage",
        },
        { path: "landlord", select: "name firstName lastName email phone" },
      ])
      .sort({ createdAt: -1 })
      .lean();
  }

  if (!tenancy) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No tenancy record found for this tenant under your management",
    );
  }

  const effectiveLandlordId =
    (tenancy.landlord as any)?._id || tenancy.landlord;

  // Auto-sync monthly rent bills for this landlord if not generated yet
  await syncMonthlyRentBillsForLandlord(effectiveLandlordId.toString());

  // 2. Fetch all bills for this tenant under this landlord
  const bills = await FinanceBill.find({
    tenant: new Types.ObjectId(tenantId),
    landlord: new Types.ObjectId(effectiveLandlordId),
    status: { $ne: BILL_STATUS.CANCELLED },
  })
    .sort({ dueDate: -1, createdAt: -1 })
    .lean();

  // Helper date formatter: "Sep 2, 2026"
  const formatDateDisplay = (d?: Date | string | null): string => {
    if (!d) return "";
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "";
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
    return `${months[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;
  };

  const enhancedBills = bills.map((bill: any) => {
    let totalAmount = Number(bill.amount) || 0;
    if (
      bill.billType === CHARGE_TYPE.RENT &&
      tenancy.rentAmount &&
      totalAmount < tenancy.rentAmount
    ) {
      totalAmount = tenancy.rentAmount;
    }

    const paidAmount = Number(bill.paidAmount) || 0;
    const dueAmount = Math.max(0, totalAmount - paidAmount);
    const computedStatus = syncBillStatus({
      ...bill,
      amount: totalAmount,
      paidAmount,
    });
    const isPaid = computedStatus === BILL_STATUS.PAID;
    const isPartiallyPaid = computedStatus === BILL_STATUS.PARTIAL;
    const isOverdue =
      computedStatus === BILL_STATUS.OVERDUE ||
      (isPartiallyPaid && new Date(bill.dueDate) < new Date());

    const displayType =
      bill.billType === CHARGE_TYPE.RENT
        ? "Rent"
        : bill.billType
            .split("_")
            .map(
              (w: string) =>
                w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
            )
            .join(" ");

    const formattedDate = isPaid
      ? `${formatDateDisplay(bill.paidAt || bill.updatedAt)} · ${displayType}`
      : isPartiallyPaid
        ? `${formatDateDisplay(bill.paidAt || bill.dueDate)} · ${displayType} (Partial: Paid ${getCurrencySymbol()}${paidAmount}, Due ${getCurrencySymbol()}${dueAmount})`
        : `Due ${formatDateDisplay(bill.dueDate)} · ${displayType}`;

    const statusLabel = isPaid
      ? "Paid"
      : isPartiallyPaid
        ? "Partially Paid"
        : isOverdue
          ? "Overdue"
          : "Due";

    return {
      _id: bill._id,
      invoiceNumber: bill.invoiceNumber,
      periodMonth: bill.periodMonth,
      formattedPeriodMonth:
        bill.periodMonth instanceof Date
          ? formatMonthPeriod(bill.periodMonth)
          : bill.periodMonth,
      description:
        bill.description ||
        `${bill.periodMonth instanceof Date ? formatMonthPeriod(bill.periodMonth) : bill.periodMonth} ${displayType}`,
      billType: bill.billType,
      billCategory: bill.billCategory,
      displayType,
      amount: totalAmount,
      paidAmount,
      dueAmount,
      dueDate: bill.dueDate,
      paidAt: bill.paidAt,
      formattedDate,
      status: computedStatus,
      statusLabel,
      isPaid,
      isPartiallyPaid,
      canDownloadReceipt: paidAmount > 0,
      paymentMethod: bill.paymentMethod || null,
      referenceNumber: bill.referenceNumber || null,
      paymentNotes: bill.paymentNotes || null,
      receiptSent: bill.receiptSent || false,
    };
  });

  // 3. Compute Top 4 Summary Cards
  // (a) Last payment: Most recent bill with paidAmount > 0
  const paidBills = enhancedBills
    .filter((b) => b.paidAmount > 0 && b.paidAt)
    .sort(
      (a, b) =>
        new Date(b.paidAt!).getTime() - new Date(a.paidAt!).getTime(),
    );

  const lastPaymentBill = paidBills[0] || null;
  const lastPayment = lastPaymentBill
    ? {
        amount: lastPaymentBill.paidAmount,
        date: formatDateDisplay(lastPaymentBill.paidAt),
        rawDate: lastPaymentBill.paidAt,
        invoiceNumber: lastPaymentBill.invoiceNumber,
      }
    : {
        amount: 0,
        date: null,
        rawDate: null,
        invoiceNumber: null,
      };

  // (b) Next due: Earliest bill with dueAmount > 0
  const pendingDueBills = enhancedBills
    .filter((b) => b.dueAmount > 0)
    .sort(
      (a, b) =>
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );

  const nextDueBill = pendingDueBills[0] || null;
  const nextDue = nextDueBill
    ? {
        amount: nextDueBill.dueAmount,
        totalBillAmount: nextDueBill.amount,
        paidAmount: nextDueBill.paidAmount,
        date: formatDateDisplay(nextDueBill.dueDate),
        rawDate: nextDueBill.dueDate,
        billId: nextDueBill._id,
        invoiceNumber: nextDueBill.invoiceNumber,
        periodMonth: nextDueBill.periodMonth,
      }
    : {
        amount: 0,
        totalBillAmount: 0,
        paidAmount: 0,
        date: null,
        rawDate: null,
        billId: null,
        invoiceNumber: null,
        periodMonth: null,
      };

  // (c) Deposit held
  const depositHeld = tenancy.securityDeposit || 0;

  // (d) Advance paid
  const advancePaid = tenancy.advanceRent || 0;

  // 4. Compute STILL DUE (All pending due amounts)
  const unpaidRentBills = pendingDueBills.filter(
    (b) => b.billCategory === BILL_CATEGORY.RENT,
  );
  const unpaidExtraChargeBills = pendingDueBills.filter(
    (b) => b.billCategory === BILL_CATEGORY.CHARGES,
  );

  const stillDueRent = unpaidRentBills.reduce((acc, b) => acc + b.dueAmount, 0);
  const stillDueExtraCharges = unpaidExtraChargeBills.reduce(
    (acc, b) => acc + b.dueAmount,
    0,
  );
  const totalStillDue = stillDueRent + stillDueExtraCharges;

  const stillDueBreakdown = pendingDueBills.map((b) => {
    const bPeriodStr =
      b.periodMonth instanceof Date
        ? formatMonthPeriod(b.periodMonth)
        : b.periodMonth;

    return {
      billId: b._id,
      title: b.isPartiallyPaid
        ? `${bPeriodStr} rent (Remaining)`
        : b.description || bPeriodStr,
    category: b.billCategory === BILL_CATEGORY.RENT ? "Rent" : "Extra charges",
    billType: b.billType,
    displayType: b.displayType,
    totalAmount: b.amount,
    paidAmount: b.paidAmount,
    amount: b.dueAmount,
    dueDate: b.dueDate,
    formattedDueDate: formatDateDisplay(b.dueDate),
    status: b.status,
    isPartiallyPaid: b.isPartiallyPaid,
    };
  });

  // Flat & Tenant info
  const flatData = tenancy.flat as any;
  const unitName = flatData?.unitName || flatData?.flatNumber || "N/A";

  const tenantUser = tenancy.tenant as any;
  const tenantName =
    tenantUser?.name ||
    `${tenantUser?.firstName || ""} ${tenantUser?.lastName || ""}`.trim() ||
    "Tenant";

  return {
    summary: {
      lastPayment,
      nextDue,
      depositHeld,
      advancePaid,
      currency: getCurrencyCode(),
      currencySymbol: getCurrencySymbol(),
    },
    tenancyDetails: {
      tenancyId: tenancy._id,
      tenantId: tenantUser?._id || tenancy.tenant,
      tenantName,
      tenantEmail: tenantUser?.email || tenancy.email,
      tenantPhone: tenantUser?.phone || null,
      tenantAvatar: tenantUser?.profileImage || null,
      propertyId: (tenancy.property as any)?._id || tenancy.property,
      propertyName: (tenancy.property as any)?.propertyName || "",
      propertyAddress:
        `${(tenancy.property as any)?.streetAddress || ""} ${(tenancy.property as any)?.postCode || ""}`.trim(),
      flatId: flatData?._id || tenancy.flat,
      unitName,
      rentAmount: tenancy.rentAmount || 0,
      leaseStartDate: tenancy.leaseStartDate,
      leaseEndDate: tenancy.leaseEndDate,
      status: tenancy.status,
    },
    stillDue: {
      total: totalStillDue,
      rent: stillDueRent,
      extraCharges: stillDueExtraCharges,
      breakdown: stillDueBreakdown,
    },
    monthlyHistory: enhancedBills,
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
  getLandlordTenantPaymentsFromDB,
};
