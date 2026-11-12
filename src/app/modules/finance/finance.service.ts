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
  ISendReminderPayload,
} from "./finance.interface";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { Tenancy } from "../tenant/tenant.model";
import { User } from "../user/user.model";
import { TENANCY_STATUS } from "../tenant/tenant.constant";
import { notificationHelper } from "../../builder/pushNotification";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import { USER_ROLES } from "../../../enums/user";
import {
  formatCurrency,
  getCurrencyCode,
  getCurrencySymbol,
} from "../../../helpers/currencyHelper";
import { escapeRegex } from "../../../helpers/searchHelper";
import { Maintenance } from "../maintenance/maintenance.model";
import { MAINTENANCE_STATUS } from "../maintenance/maintenance.constant";

// Common populate options
const billPopulateOptions = [
  {
    path: "tenant",
    select: "name email phone role profileImage",
  },
  {
    path: "landlord",
    select: "name email phone role profileImage companyName",
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

// Helper: Format display date (e.g., "Jul 1, 2026")
const formatDateUTC = (d?: Date | string | null): string => {
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
  return `${months[dateObj.getUTCMonth()]} ${dateObj.getUTCDate()}, ${dateObj.getUTCFullYear()}`;
};

// Helper: Format charge/bill type label (e.g., "Rent", "Repair")
const formatDisplayBillType = (billType?: string): string => {
  switch (billType) {
    case CHARGE_TYPE.RENT:
      return "Rent";
    case CHARGE_TYPE.REPAIR_CHARGE:
      return "Repair";
    case CHARGE_TYPE.UTILITY_CHARGE:
      return "Utility";
    case CHARGE_TYPE.SERVICE_CHARGE:
      return "Service";
    case CHARGE_TYPE.PENALTY:
      return "Penalty";
    case CHARGE_TYPE.CUSTOM_CHARGE:
      return "Custom";
    default:
      return billType
        ? billType
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ")
        : "Charge";
  }
};

// Helper: Payment method display label
const getPaymentMethodLabel = (method?: string | null): string | null => {
  switch (method) {
    case PAYMENT_METHOD.BANK_TRANSFER:
      return "Bank transfer";
    case PAYMENT_METHOD.CASH:
      return "Cash";
    case PAYMENT_METHOD.CHEQUE:
      return "Cheque";
    case PAYMENT_METHOD.DIRECT_DEBIT:
      return "Direct debit";
    case PAYMENT_METHOD.STRIPE:
      return "Stripe";
    case PAYMENT_METHOD.OTHER:
      return "Other";
    default:
      return null;
  }
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

// Helper: Format bill document into rich UI-ready transaction/bill object
const formatBillItemForDisplay = (bill: any, now: Date = new Date()) => {
  const computedStatus = syncBillStatus(bill);
  const totalAmount = Number(bill.amount) || 0;
  const paidAmount = Number(bill.paidAmount) || 0;
  const dueAmount = Math.max(0, totalAmount - paidAmount);
  const isPaid = computedStatus === BILL_STATUS.PAID;
  const isPartiallyPaid = computedStatus === BILL_STATUS.PARTIAL;
  const isOverdue =
    computedStatus === BILL_STATUS.OVERDUE ||
    (!isPaid && new Date(bill.dueDate) < now);

  const displayType = formatDisplayBillType(bill.billType);
  const formattedPeriodMonth = bill.periodMonth
    ? formatMonthPeriod(parsePeriodMonthToDate(bill.periodMonth))
    : "";
  const formattedDueDate = formatDateUTC(bill.dueDate);
  const paidDateSource = bill.paidAt || (isPaid ? bill.updatedAt : null);
  const formattedPaidDate = paidDateSource ? formatDateUTC(paidDateSource) : null;

  const unitName = bill.flat?.unitName || "N/A";
  const propertyTitle =
    bill.property?.streetAddress || bill.property?.propertyName || "Property";
  const tenantName = bill.tenant?.name || "Tenant";

  const statusLabel = isPaid
    ? "Paid"
    : isPartiallyPaid
      ? isOverdue
        ? "Partially paid (Overdue)"
        : "Partially paid"
      : isOverdue
        ? "Overdue"
        : "Due";

  const displayAmount = isPaid ? paidAmount || totalAmount : dueAmount;
  const paymentSource =
    bill.paymentMethod === PAYMENT_METHOD.STRIPE
      ? "stripe"
      : bill.paymentMethod
        ? "manual"
        : null;

  return {
    ...bill,
    status: computedStatus,
    statusLabel,
    isPaid,
    isPartiallyPaid,
    isOverdue,
    displayType,
    amount: totalAmount,
    paidAmount,
    dueAmount,
    displayAmount,
    formattedAmount: formatCurrency(displayAmount),
    formattedTotalAmount: formatCurrency(totalAmount),
    formattedPaidAmount: formatCurrency(paidAmount),
    formattedDueAmount: formatCurrency(dueAmount),
    formattedPeriodMonth,
    formattedDueDate,
    formattedPaidDate,
    tenantName,
    unitName,
    propertyTitle,
    subtitle: `${unitName} · ${propertyTitle} · ${formattedPeriodMonth}`,
    dateLine: isPaid
      ? `${formattedPaidDate || formattedDueDate} · ${displayType}`
      : `Due ${formattedDueDate} · ${displayType}`,
    paymentSource,
    paymentMethodLabel: getPaymentMethodLabel(bill.paymentMethod),
  };
};

// Helper: Build search filter across FinanceBill + populated Tenant/Property/Flat
const buildFinanceSearchCondition = async (
  searchTerm: string,
): Promise<Record<string, any> | null> => {
  const trimmed = searchTerm.trim();
  if (!trimmed) return null;

  const regex = new RegExp(escapeRegex(trimmed), "i");
  const [matchingUsers, matchingProperties, matchingFlats] = await Promise.all([
    User.find({ $or: [{ name: regex }, { email: regex }] })
      .select("_id")
      .lean(),
    Property.find({
      $or: [{ propertyName: regex }, { streetAddress: regex }, { postCode: regex }],
    })
      .select("_id")
      .lean(),
    Flat.find({ unitName: regex }).select("_id").lean(),
  ]);

  const orConditions: Record<string, any>[] = financeSearchableFields
    .filter((f) => f !== "periodMonth")
    .map((field) => ({ [field]: regex }));

  if (matchingUsers.length > 0) {
    orConditions.push({ tenant: { $in: matchingUsers.map((u) => u._id) } });
  }
  if (matchingProperties.length > 0) {
    orConditions.push({
      property: { $in: matchingProperties.map((p) => p._id) },
    });
  }
  if (matchingFlats.length > 0) {
    orConditions.push({ flat: { $in: matchingFlats.map((f) => f._id) } });
  }
  if (Types.ObjectId.isValid(trimmed)) {
    orConditions.push({ _id: new Types.ObjectId(trimmed) });
  }

  return { $or: orConditions };
};

// -------------------------------------------------------------
// 2. GET BILLS / TRANSACTION HISTORY (Landlord & Tenant) (Screenshots 1, 2, 4)
// -------------------------------------------------------------
const getBillsFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const queryCopy = { ...query };
  const filter: Record<string, any> = {};
  const andConditions: Record<string, any>[] = [];
  const currentUserId = authUser.userId || authUser.id;

  if (authUser.role === USER_ROLES.LANDLORD) {
    await syncMonthlyRentBillsForLandlord(currentUserId);
    filter.landlord = new Types.ObjectId(currentUserId);
  } else if (authUser.role === USER_ROLES.TENANT) {
    await syncMonthlyRentBillsForTenant(currentUserId);
    filter.tenant = new Types.ObjectId(currentUserId);
  }

  // Filter by outstanding vs paid tab (supports both filter_type and tab)
  const tabFilter = String(
    queryCopy.filter_type || queryCopy.tab || "",
  )
    .trim()
    .toLowerCase();
  delete queryCopy.filter_type;
  delete queryCopy.tab;

  if (tabFilter === "outstanding") {
    filter.status = {
      $in: [
        BILL_STATUS.PENDING,
        BILL_STATUS.DUE,
        BILL_STATUS.OVERDUE,
        BILL_STATUS.PARTIAL,
      ],
    };
  } else if (tabFilter === "paid") {
    filter.status = BILL_STATUS.PAID;
  } else if (queryCopy.status) {
    filter.status = queryCopy.status;
    delete queryCopy.status;
  } else {
    filter.status = { $ne: BILL_STATUS.CANCELLED };
  }

  // Filter by category: all | rent | charges
  if (queryCopy.category === "rent") {
    filter.billCategory = BILL_CATEGORY.RENT;
    delete queryCopy.category;
  } else if (queryCopy.category === "charges") {
    filter.billCategory = BILL_CATEGORY.CHARGES;
    delete queryCopy.category;
  } else if (queryCopy.category === "all") {
    delete queryCopy.category;
  }

  // Filter by property
  if (
    queryCopy.property &&
    Types.ObjectId.isValid(queryCopy.property as string)
  ) {
    filter.property = new Types.ObjectId(queryCopy.property as string);
    delete queryCopy.property;
  }

  // Filter by flat
  if (queryCopy.flat && Types.ObjectId.isValid(queryCopy.flat as string)) {
    filter.flat = new Types.ObjectId(queryCopy.flat as string);
    delete queryCopy.flat;
  }

  // Filter by tenant
  if (queryCopy.tenant && Types.ObjectId.isValid(queryCopy.tenant as string)) {
    filter.tenant = new Types.ObjectId(queryCopy.tenant as string);
    delete queryCopy.tenant;
  }

  // Filter by periodMonth
  if (queryCopy.periodMonth) {
    const pDate = parsePeriodMonthToDate(queryCopy.periodMonth as string);
    const nextPDate = new Date(
      Date.UTC(pDate.getUTCFullYear(), pDate.getUTCMonth() + 1, 1),
    );
    andConditions.push({
      $or: [
        { periodMonth: pDate },
        { periodMonth: { $gte: pDate, $lt: nextPDate } },
        { periodMonth: formatMonthPeriod(pDate) },
      ],
    });
    delete queryCopy.periodMonth;
  }

  if (queryCopy.searchTerm) {
    const searchCond = await buildFinanceSearchCondition(
      String(queryCopy.searchTerm),
    );
    if (searchCond) {
      andConditions.push(searchCond);
    }
    delete queryCopy.searchTerm;
  }

  if (andConditions.length > 0) {
    filter.$and = andConditions;
  }

  const baseQuery = FinanceBill.find(filter).populate(billPopulateOptions);

  const queryBuilder = new QueryBuilder(baseQuery, queryCopy)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [bills, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  const now = new Date();
  const enhancedBills = bills.map((bill: any) =>
    formatBillItemForDisplay(bill, now),
  );

  return {
    meta,
    data: enhancedBills,
  };
};

// -------------------------------------------------------------
// 2.1 LANDLORD TRANSACTION HISTORY (Screenshot 2: Outstanding | Paid)
// -------------------------------------------------------------
const getLandlordTransactionsFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const currentUserId = authUser.userId || authUser.id;
  const isLandlord = authUser.role === USER_ROLES.LANDLORD;

  if (isLandlord) {
    await syncMonthlyRentBillsForLandlord(currentUserId);
  }

  const rawTab = String(query.tab || query.filter_type || "outstanding")
    .trim()
    .toLowerCase();
  const tab: "outstanding" | "paid" = rawTab === "paid" ? "paid" : "outstanding";

  const scopeFilter: Record<string, any> = {
    status: { $ne: BILL_STATUS.CANCELLED },
  };
  const andConditions: Record<string, any>[] = [];

  if (isLandlord) {
    scopeFilter.landlord = new Types.ObjectId(currentUserId);
  }

  if (query.category === "rent") {
    scopeFilter.billCategory = BILL_CATEGORY.RENT;
  } else if (query.category === "charges") {
    scopeFilter.billCategory = BILL_CATEGORY.CHARGES;
  }

  if (query.property && Types.ObjectId.isValid(query.property as string)) {
    scopeFilter.property = new Types.ObjectId(query.property as string);
  }

  if (query.flat && Types.ObjectId.isValid(query.flat as string)) {
    scopeFilter.flat = new Types.ObjectId(query.flat as string);
  }

  if (query.tenant && Types.ObjectId.isValid(query.tenant as string)) {
    scopeFilter.tenant = new Types.ObjectId(query.tenant as string);
  }

  if (query.paymentMethod) {
    scopeFilter.paymentMethod = String(query.paymentMethod).trim().toLowerCase();
  }

  if (query.paymentSource === "stripe") {
    scopeFilter.paymentMethod = PAYMENT_METHOD.STRIPE;
  } else if (query.paymentSource === "manual") {
    scopeFilter.paymentMethod = {
      $in: [
        PAYMENT_METHOD.BANK_TRANSFER,
        PAYMENT_METHOD.CASH,
        PAYMENT_METHOD.CHEQUE,
        PAYMENT_METHOD.DIRECT_DEBIT,
        PAYMENT_METHOD.OTHER,
      ],
    };
  }

  if (query.periodMonth) {
    const pDate = parsePeriodMonthToDate(query.periodMonth as string);
    const nextPDate = new Date(
      Date.UTC(pDate.getUTCFullYear(), pDate.getUTCMonth() + 1, 1),
    );
    andConditions.push({
      $or: [
        { periodMonth: pDate },
        { periodMonth: { $gte: pDate, $lt: nextPDate } },
        { periodMonth: formatMonthPeriod(pDate) },
      ],
    });
  }

  if (query.searchTerm) {
    const searchCond = await buildFinanceSearchCondition(
      String(query.searchTerm),
    );
    if (searchCond) {
      andConditions.push(searchCond);
    }
  }

  if (andConditions.length > 0) {
    scopeFilter.$and = andConditions;
  }

  const allScopedBills = await FinanceBill.find(scopeFilter)
    .populate(billPopulateOptions)
    .lean();

  const now = new Date();
  const formattedAll = allScopedBills.map((b: any) =>
    formatBillItemForDisplay(b, now),
  );

  const outstandingItems = formattedAll.filter(
    (b) => !b.isPaid && b.dueAmount > 0,
  );
  const paidItems = formattedAll.filter((b) => b.isPaid);

  const totalOutstanding = outstandingItems.reduce(
    (sum, b) => sum + b.dueAmount,
    0,
  );
  const totalPaid = paidItems.reduce(
    (sum, b) => sum + (b.paidAmount || b.amount),
    0,
  );
  const overdueCount = outstandingItems.filter((b) => b.isOverdue).length;

  const summary = {
    tab,
    outstandingCount: outstandingItems.length,
    paidCount: paidItems.length,
    overdueCount,
    totalOutstanding,
    formattedTotalOutstanding: formatCurrency(totalOutstanding),
    totalPaid,
    formattedTotalPaid: formatCurrency(totalPaid),
    currency: getCurrencyCode(),
    currencySymbol: getCurrencySymbol(),
  };

  let activeList = tab === "paid" ? paidItems : outstandingItems;

  if (tab === "paid") {
    activeList = [...activeList].sort((a, b) => {
      const aTime = new Date(a.paidAt || a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.paidAt || b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
  } else {
    activeList = [...activeList].sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) {
        return a.isOverdue ? -1 : 1;
      }
      return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
    });
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Number(query.limit) || 20);
  const total = activeList.length;
  const totalPage = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedTransactions = activeList.slice(startIndex, startIndex + limit);

  return {
    meta: {
      page,
      limit,
      total,
      totalPage,
    },
    data: {
      tab,
      summary,
      transactions: paginatedTransactions,
    },
  };
};

// -------------------------------------------------------------
// 2.2 GET RECORD PAYMENT SCREEN DATA (Screenshot 1)
// -------------------------------------------------------------
const getRecordPaymentDataFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const currentUserId = authUser.userId || authUser.id;
  const isLandlord = authUser.role === USER_ROLES.LANDLORD;

  if (isLandlord) {
    await syncMonthlyRentBillsForLandlord(currentUserId);
  }

  const baseFilter: Record<string, any> = {
    status: { $nin: [BILL_STATUS.PAID, BILL_STATUS.CANCELLED] },
  };
  if (isLandlord) {
    baseFilter.landlord = new Types.ObjectId(currentUserId);
  }

  const [allUnpaidRaw, landlordProperties, landlordFlats] = await Promise.all([
    FinanceBill.find(baseFilter)
      .populate(billPopulateOptions)
      .sort({ dueDate: 1, createdAt: 1 })
      .lean(),
    Property.find(
      isLandlord ? { landlord: new Types.ObjectId(currentUserId) } : {},
    )
      .select("propertyName streetAddress postCode")
      .lean(),
    Flat.find(
      isLandlord ? { landlord: new Types.ObjectId(currentUserId) } : {},
    )
      .select("unitName floor property rentPerMonth")
      .lean(),
  ]);

  const now = new Date();
  const allUnpaidFormatted = allUnpaidRaw
    .map((b: any) => formatBillItemForDisplay(b, now))
    .filter((b) => b.dueAmount > 0);

  const overallOutstanding = allUnpaidFormatted.reduce(
    (sum, b) => sum + b.dueAmount,
    0,
  );

  // Build per-property and per-flat counts for dropdowns
  const propStatsMap = new Map<
    string,
    { dueCount: number; outstandingAmount: number }
  >();
  const flatStatsMap = new Map<
    string,
    { dueCount: number; outstandingAmount: number }
  >();

  allUnpaidFormatted.forEach((b) => {
    const pId = b.property?._id?.toString();
    if (pId) {
      const prev = propStatsMap.get(pId) || { dueCount: 0, outstandingAmount: 0 };
      propStatsMap.set(pId, {
        dueCount: prev.dueCount + 1,
        outstandingAmount: prev.outstandingAmount + b.dueAmount,
      });
    }
    const fId = b.flat?._id?.toString();
    if (fId) {
      const prev = flatStatsMap.get(fId) || { dueCount: 0, outstandingAmount: 0 };
      flatStatsMap.set(fId, {
        dueCount: prev.dueCount + 1,
        outstandingAmount: prev.outstandingAmount + b.dueAmount,
      });
    }
  });

  // Apply optional filters for the displayed grouped list
  let filteredBills = allUnpaidFormatted;

  if (query.property && Types.ObjectId.isValid(query.property as string)) {
    const pId = String(query.property);
    filteredBills = filteredBills.filter(
      (b) => b.property?._id?.toString() === pId,
    );
  }

  if (query.flat && Types.ObjectId.isValid(query.flat as string)) {
    const fId = String(query.flat);
    filteredBills = filteredBills.filter(
      (b) => b.flat?._id?.toString() === fId,
    );
  }

  if (query.tenant && Types.ObjectId.isValid(query.tenant as string)) {
    const tId = String(query.tenant);
    filteredBills = filteredBills.filter(
      (b) => b.tenant?._id?.toString() === tId,
    );
  }

  if (query.category === "rent") {
    filteredBills = filteredBills.filter(
      (b) => b.billCategory === BILL_CATEGORY.RENT,
    );
  } else if (query.category === "charges") {
    filteredBills = filteredBills.filter(
      (b) => b.billCategory === BILL_CATEGORY.CHARGES,
    );
  }

  if (query.status === "overdue") {
    filteredBills = filteredBills.filter((b) => b.isOverdue);
  } else if (query.status === "due") {
    filteredBills = filteredBills.filter((b) => !b.isOverdue);
  }

  if (query.searchTerm) {
    const term = String(query.searchTerm).trim().toLowerCase();
    filteredBills = filteredBills.filter(
      (b) =>
        b.tenantName.toLowerCase().includes(term) ||
        b.propertyTitle.toLowerCase().includes(term) ||
        b.unitName.toLowerCase().includes(term) ||
        (b.invoiceNumber || "").toLowerCase().includes(term) ||
        (b.description || "").toLowerCase().includes(term),
    );
  }

  const totalOutstanding = filteredBills.reduce(
    (sum, b) => sum + b.dueAmount,
    0,
  );

  // Group bills by Property (Screenshot 1)
  const groupedMap = new Map<string, any>();
  filteredBills.forEach((b) => {
    const prop = b.property;
    const propId = prop?._id?.toString() || "unknown";
    if (!groupedMap.has(propId)) {
      groupedMap.set(propId, {
        propertyId: prop?._id || null,
        propertyName: prop?.propertyName || "",
        streetAddress: prop?.streetAddress || "",
        postCode: prop?.postCode || "",
        title: b.propertyTitle,
        dueCount: 0,
        dueLabel: "0 due",
        totalOutstanding: 0,
        formattedTotalOutstanding: formatCurrency(0),
        bills: [],
      });
    }

    const group = groupedMap.get(propId);
    const descPart =
      b.description && b.description.trim()
        ? b.description.trim()
        : `${b.formattedPeriodMonth} ${b.displayType.toLowerCase()}`.trim();

    group.bills.push({
      _id: b._id,
      billId: b._id,
      invoiceNumber: b.invoiceNumber,
      tenant: b.tenant,
      tenantName: b.tenantName,
      flat: b.flat,
      unitName: b.unitName,
      property: b.property,
      billType: b.billType,
      billCategory: b.billCategory,
      displayType: b.displayType,
      periodMonth: b.periodMonth,
      formattedPeriodMonth: b.formattedPeriodMonth,
      description: b.description,
      dueDate: b.dueDate,
      formattedDueDate: b.formattedDueDate,
      subtitle: `${b.unitName} · ${descPart} · Due ${b.formattedDueDate}`,
      amount: b.amount,
      paidAmount: b.paidAmount,
      dueAmount: b.dueAmount,
      formattedAmount: formatCurrency(b.dueAmount),
      status: b.status,
      statusLabel: b.statusLabel,
      isOverdue: b.isOverdue,
      isPartiallyPaid: b.isPartiallyPaid,
    });
    group.dueCount += 1;
    group.dueLabel = `${group.dueCount} due`;
    group.totalOutstanding += b.dueAmount;
    group.formattedTotalOutstanding = formatCurrency(group.totalOutstanding);
  });

  const selectedPropertyFilter =
    query.property && Types.ObjectId.isValid(query.property as string)
      ? String(query.property)
      : null;

  return {
    summary: {
      selectedAmount: 0,
      selectedCount: 0,
      totalOutstanding,
      formattedTotalOutstanding: formatCurrency(totalOutstanding),
      totalDueCount: filteredBills.length,
      overallOutstanding,
      formattedOverallOutstanding: formatCurrency(overallOutstanding),
      overallDueCount: allUnpaidFormatted.length,
      currency: getCurrencyCode(),
      currencySymbol: getCurrencySymbol(),
    },
    filterOptions: {
      properties: landlordProperties.map((p: any) => {
        const stats = propStatsMap.get(p._id.toString()) || {
          dueCount: 0,
          outstandingAmount: 0,
        };
        return {
          _id: p._id,
          propertyName: p.propertyName,
          streetAddress: p.streetAddress,
          postCode: p.postCode,
          title: p.streetAddress || p.propertyName,
          dueCount: stats.dueCount,
          outstandingAmount: stats.outstandingAmount,
        };
      }),
      flats: landlordFlats
        .filter(
          (f: any) =>
            !selectedPropertyFilter ||
            f.property?.toString() === selectedPropertyFilter,
        )
        .map((f: any) => {
          const stats = flatStatsMap.get(f._id.toString()) || {
            dueCount: 0,
            outstandingAmount: 0,
          };
          return {
            _id: f._id,
            unitName: f.unitName,
            floor: f.floor,
            property: f.property,
            dueCount: stats.dueCount,
            outstandingAmount: stats.outstandingAmount,
          };
        }),
      categories: [
        { label: "All", value: "all" },
        { label: "Rent", value: "rent" },
        { label: "Charges", value: "charges" },
      ],
      paymentMethods: [
        { label: "Bank transfer", value: PAYMENT_METHOD.BANK_TRANSFER },
        { label: "Cash", value: PAYMENT_METHOD.CASH },
        { label: "Cheque", value: PAYMENT_METHOD.CHEQUE },
        { label: "Direct debit", value: PAYMENT_METHOD.DIRECT_DEBIT },
        { label: "Other", value: PAYMENT_METHOD.OTHER },
      ],
    },
    groupedBills: Array.from(groupedMap.values()),
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
// 5. RECORD PAYMENT (Unified Manual Payment for Bills or Direct Rent) (Screenshot 1)
// -------------------------------------------------------------
const recordPaymentIntoDB = async (
  authUser: JwtPayload,
  payload: IRecordPaymentPayload,
) => {
  const currentUserId = authUser.userId || authUser.id;
  const isLandlord = authUser.role === USER_ROLES.LANDLORD;
  const paymentDate = new Date(payload.paymentDate);

  if (isNaN(paymentDate.getTime())) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid payment date");
  }

  // Mode 1: Bill IDs selected (Screenshot 1 primary flow)
  if (payload.billIds && payload.billIds.length > 0) {
    const invalidId = payload.billIds.find((id) => !Types.ObjectId.isValid(id));
    if (invalidId) {
      throw new ApiError(StatusCodes.BAD_REQUEST, `Invalid bill ID: ${invalidId}`);
    }

    const filter: Record<string, any> = {
      _id: { $in: payload.billIds.map((id) => new Types.ObjectId(id)) },
      status: { $ne: BILL_STATUS.CANCELLED },
    };

    if (isLandlord) {
      filter.landlord = new Types.ObjectId(currentUserId);
    }

    const bills = await FinanceBill.find(filter).sort({ dueDate: 1 });

    if (!bills.length) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "No valid unpaid bills found for the provided IDs",
      );
    }

    const unpaidBills = bills.filter(
      (b) => b.status !== BILL_STATUS.PAID && (b.paidAmount || 0) < b.amount,
    );

    if (!unpaidBills.length) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Selected bill(s) are already fully paid",
      );
    }

    const updatedBillIds: Types.ObjectId[] = [];
    let totalRecordedAmount = 0;
    let remainingPayment =
      payload.amountReceived !== undefined ? payload.amountReceived : Infinity;

    for (const bill of unpaidBills) {
      const currentPaid = bill.paidAmount || 0;
      const needed = Math.max(0, bill.amount - currentPaid);
      let paymentAllocated = needed;

      if (remainingPayment !== Infinity) {
        paymentAllocated = Math.min(needed, remainingPayment);
        remainingPayment -= paymentAllocated;
      }

      if (paymentAllocated <= 0) {
        continue;
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
      updatedBillIds.push(bill._id as Types.ObjectId);
      totalRecordedAmount += paymentAllocated;

      if (payload.receiptSentToTenant) {
        const periodLabel = bill.periodMonth
          ? formatMonthPeriod(parsePeriodMonthToDate(bill.periodMonth))
          : "";
        notificationHelper.sendToUser(bill.tenant, {
          title: "Rent / Charge Payment Recorded",
          body: `Payment of ${getCurrencySymbol()}${paymentAllocated} for invoice ${bill.invoiceNumber}${periodLabel ? ` (${periodLabel})` : ""} has been recorded by your landlord.`,
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

    const populatedBills = await FinanceBill.find({
      _id: { $in: updatedBillIds },
    })
      .populate(billPopulateOptions)
      .lean();

    const now = new Date();
    return {
      recordedCount: populatedBills.length,
      totalRecordedAmount,
      formattedTotalRecordedAmount: formatCurrency(totalRecordedAmount),
      bills: populatedBills.map((b: any) => formatBillItemForDisplay(b, now)),
    };
  }

  // Mode 2: Direct payment by property + flat + tenant + amount
  const paymentAmount = payload.amount ?? payload.amountReceived ?? 0;
  if (
    !payload.property ||
    !Types.ObjectId.isValid(payload.property) ||
    !payload.flat ||
    !Types.ObjectId.isValid(payload.flat) ||
    !payload.tenant ||
    !Types.ObjectId.isValid(payload.tenant) ||
    paymentAmount <= 0
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Valid billIds or property, flat, tenant, and positive amount are required",
    );
  }

  const property = await Property.findById(payload.property).lean();
  if (!property) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }
  if (isLandlord && property.landlord?.toString() !== currentUserId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Property does not belong to you",
    );
  }

  const flat = await Flat.findById(payload.flat).lean();
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

  const periodDate = parsePeriodMonthToDate(payload.periodMonth || paymentDate);
  const nextPeriodDate = new Date(
    Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth() + 1, 1),
  );
  const periodMonthString = formatMonthPeriod(periodDate);

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
  const landlordId =
    tenancy?.landlord?.toString() ||
    property.landlord?.toString() ||
    currentUserId;
  const fullRentAmount = tenancy?.rentAmount || paymentAmount;

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
    ],
  });

  if (bill) {
    if (bill.status === BILL_STATUS.PAID) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Rent bill for ${periodMonthString} is already fully paid`,
      );
    }
    if (bill.amount < fullRentAmount) {
      bill.amount = fullRentAmount;
    }
    let newPaidAmount = paymentAmount;
    if (bill.paidAmount && bill.paidAmount > 0 && paymentAmount < bill.amount) {
      newPaidAmount = Math.min(bill.amount, bill.paidAmount + paymentAmount);
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
    const isFullPayment = paymentAmount >= fullRentAmount;

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
      paidAmount: paymentAmount,
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
      body: `Your rent payment of ${getCurrencySymbol()}${paymentAmount} for ${periodMonthString} has been confirmed. Invoice #${bill.invoiceNumber}.`,
      type: NOTIFICATION_TYPE.TENANT,
      data: {
        billId: bill._id.toString(),
        invoiceNumber: bill.invoiceNumber,
        amount: paymentAmount.toString(),
      },
    });
  }

  const populated = await FinanceBill.findById(bill._id)
    .populate(billPopulateOptions)
    .lean();

  const formattedBill = populated
    ? formatBillItemForDisplay(populated, new Date())
    : populated;

  return {
    recordedCount: 1,
    totalRecordedAmount: paymentAmount,
    formattedTotalRecordedAmount: formatCurrency(paymentAmount),
    bills: formattedBill ? [formattedBill] : [],
  };
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
      { path: "landlord", select: "name firstName lastName email phone profileImage" },
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
const formatChargeTypeLabel = (type?: string) => {
  if (!type) return "Extra Charge";
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

// -------------------------------------------------------------
// 11. TENANT TRANSACTION HISTORY (Tab: rent | extra-charge | maintenance)
// -------------------------------------------------------------
const getTenantTransactionsFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const tenantId = authUser.userId || authUser.id;
  await syncMonthlyRentBillsForTenant(tenantId);

  const rawTab = ((query.tab as string) || "").trim().toLowerCase();
  let tab: "rent" | "extra-charge" | "maintenance" = "rent";

  if (
    rawTab === "extra-charge" ||
    rawTab === "extra_charge" ||
    rawTab === "extra-charges" ||
    rawTab === "extra_charges" ||
    rawTab === "charges"
  ) {
    tab = "extra-charge";
  } else if (rawTab === "maintenance") {
    tab = "maintenance";
  } else {
    tab = "rent";
  }

  const now = new Date();
  const queryCopy = { ...query };
  delete queryCopy.tab;

  // ===================== TAB: MAINTENANCE =====================
  if (tab === "maintenance") {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const maintenanceFilter: Record<string, any> = {
      $or: [
        { tenant: tenantObjectId },
        { requestedBy: tenantObjectId },
      ],
      isDeleted: { $ne: true },
    };

    // Calculate tab-specific summary statistics
    const allMaintenance = await Maintenance.find(maintenanceFilter).lean();

    const totalCost = allMaintenance.reduce(
      (acc: number, curr: any) =>
        acc + (curr.invoiceAmount || curr.invoiceAmounts || 0),
      0,
    );
    const totalPaid = allMaintenance.reduce((acc: number, curr: any) => {
      if (curr.paymentStatus === "paid") {
        return acc + (curr.invoiceAmount || curr.invoiceAmounts || 0);
      }
      return acc;
    }, 0);
    const totalDue = allMaintenance.reduce((acc: number, curr: any) => {
      if (curr.paymentStatus !== "paid") {
        return acc + (curr.invoiceAmount || curr.invoiceAmounts || 0);
      }
      return acc;
    }, 0);

    const pendingRequests = allMaintenance.filter(
      (m: any) =>
        m.status !== MAINTENANCE_STATUS.COMPLETED &&
        m.status !== MAINTENANCE_STATUS.CANCELLED,
    ).length;
    const completedRequests = allMaintenance.filter(
      (m: any) => m.status === MAINTENANCE_STATUS.COMPLETED,
    ).length;

    const summary = {
      totalRequests: allMaintenance.length,
      totalCost,
      totalPaid,
      totalDue,
      pendingRequests,
      completedRequests,
      currency: getCurrencyCode(),
      currencySymbol: getCurrencySymbol(),
    };

    const maintenanceQuery = Maintenance.find(maintenanceFilter)
      .populate([
        { path: "property", select: "propertyName streetAddress postCode" },
        { path: "flat", select: "unitName floor" },
        {
          path: "contractor",
          select:
            "name firstName lastName companyName phone email profileImage",
        },
        { path: "issueType", select: "label value name" },
      ])
      .sort({ createdAt: -1 });

    const maintenanceBuilder = new QueryBuilder(maintenanceQuery, queryCopy)
      .search(["issueTitle", "description", "jobId", "locationInProperty"])
      .paginate()
      .fields();

    const [issues, meta] = await Promise.all([
      maintenanceBuilder.modelQuery.lean(),
      maintenanceBuilder.countTotal(),
    ]);

    const history = issues.map((iss: any) => {
      const amount = iss.invoiceAmount || iss.invoiceAmounts || 0;
      const isPaid = iss.paymentStatus === "paid";
      const paidAmount = isPaid ? amount : 0;
      const dueAmount = isPaid ? 0 : amount;

      return {
        _id: iss._id,
        id: iss._id,
        jobId: iss.jobId,
        title: iss.issueTitle,
        description: iss.description,
        priority: iss.priority,
        status: iss.status,
        statusLabel: iss.status
          ? iss.status.charAt(0).toUpperCase() + iss.status.slice(1)
          : "",
        category: "maintenance",
        billType: "maintenance",
        amount,
        paidAmount,
        dueAmount,
        paymentStatus: iss.paymentStatus || "unpaid",
        invoiceStatus: iss.invoiceStatus || null,
        paidAt: iss.paidAt || null,
        date: iss.paidAt || iss.createdAt,
        reportedAt: iss.reportedAt || iss.createdAt,
        scheduledDate: iss.scheduledDate || null,
        completedAt: iss.completedAt || null,
        property: iss.property
          ? {
              _id: iss.property._id,
              propertyName: iss.property.propertyName,
              streetAddress: iss.property.streetAddress,
              postCode: iss.property.postCode,
            }
          : null,
        flat: iss.flat
          ? {
              _id: iss.flat._id,
              unitName: iss.flat.unitName,
              floor: iss.flat.floor,
            }
          : null,
        contractor: iss.contractor
          ? {
              _id: iss.contractor._id,
              name:
                iss.contractor.name ||
                `${iss.contractor.firstName || ""} ${iss.contractor.lastName || ""}`.trim() ||
                iss.contractor.companyName ||
                "",
              companyName: iss.contractor.companyName,
              phone: iss.contractor.phone,
            }
          : null,
        createdAt: iss.createdAt,
      };
    });

    return {
      meta,
      data: {
        tab,
        summary,
        history,
      },
    };
  }

  // ===================== TAB: RENT =====================
  if (tab === "rent") {
    const rentFilter: Record<string, any> = {
      tenant: new Types.ObjectId(tenantId),
      billCategory: BILL_CATEGORY.RENT,
      status: { $ne: BILL_STATUS.CANCELLED },
      isDeleted: { $ne: true },
    };

    // All rent bills for summary
    const allRentBills = await FinanceBill.find(rentFilter).lean();

    const unpaidRentBills = allRentBills.filter((b: any) => {
      const computed = syncBillStatus(b);
      return (
        computed !== BILL_STATUS.PAID &&
        b.amount - (b.paidAmount || 0) > 0
      );
    });

    const rentBalance = unpaidRentBills.reduce(
      (acc: number, curr: any) =>
        acc + Math.max(0, curr.amount - (curr.paidAmount || 0)),
      0,
    );
    const totalPaidRent = allRentBills.reduce(
      (acc: number, curr: any) => acc + (curr.paidAmount || 0),
      0,
    );
    const totalRentAmount = allRentBills.reduce(
      (acc: number, curr: any) => acc + (curr.amount || 0),
      0,
    );

    const nextRentDueBill = unpaidRentBills.sort(
      (a: any, b: any) =>
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    )[0];

    const summary = {
      totalDue: rentBalance,
      totalPaid: totalPaidRent,
      totalRent: totalRentAmount,
      outstandingCount: unpaidRentBills.length,
      paidCount: allRentBills.filter(
        (b: any) => syncBillStatus(b) === BILL_STATUS.PAID,
      ).length,
      totalBills: allRentBills.length,
      nextRentDue: nextRentDueBill
        ? {
            billId: nextRentDueBill._id,
            invoiceNumber: nextRentDueBill.invoiceNumber,
            amount: Math.max(
              0,
              nextRentDueBill.amount - (nextRentDueBill.paidAmount || 0),
            ),
            dueDate: nextRentDueBill.dueDate,
            periodMonth:
              nextRentDueBill.periodMonth instanceof Date
                ? formatMonthPeriod(nextRentDueBill.periodMonth)
                : nextRentDueBill.periodMonth || "",
          }
        : null,
      currency: getCurrencyCode(),
      currencySymbol: getCurrencySymbol(),
    };

    const baseQuery = FinanceBill.find(rentFilter)
      .populate(billPopulateOptions)
      .sort({ dueDate: -1, createdAt: -1 });

    const queryBuilder = new QueryBuilder(baseQuery, queryCopy)
      .search(financeSearchableFields)
      .paginate()
      .fields();

    const [bills, meta] = await Promise.all([
      queryBuilder.modelQuery.lean(),
      queryBuilder.countTotal(),
    ]);

    const history = bills.map((b: any) => {
      const computed = syncBillStatus(b);
      const isOverdue =
        new Date(b.dueDate) < now && computed !== BILL_STATUS.PAID;
      const dueAmount = Math.max(0, (b.amount || 0) - (b.paidAmount || 0));
      const formattedPeriodMonth =
        b.periodMonth instanceof Date
          ? formatMonthPeriod(b.periodMonth)
          : b.periodMonth || "";

      const statusLabel =
        computed === BILL_STATUS.PAID
          ? "Paid"
          : computed === BILL_STATUS.PARTIAL
            ? isOverdue
              ? "Partially paid (Overdue)"
              : "Partially paid"
            : computed === BILL_STATUS.OVERDUE
              ? "Overdue"
              : "Due";

      return {
        _id: b._id,
        id: b._id,
        invoiceNumber: b.invoiceNumber,
        billType: b.billType,
        billCategory: b.billCategory,
        title: b.description || `Rent for ${formattedPeriodMonth}`,
        description: b.description || "",
        periodMonth: b.periodMonth,
        formattedPeriodMonth,
        amount: b.amount || 0,
        paidAmount: b.paidAmount || 0,
        dueAmount,
        dueDate: b.dueDate,
        paidAt: b.paidAt || null,
        paymentMethod: b.paymentMethod || null,
        status: computed,
        statusLabel,
        canPayOnline: computed !== BILL_STATUS.PAID,
        property: b.property
          ? {
              _id: b.property._id,
              propertyName: b.property.propertyName,
              streetAddress: b.property.streetAddress,
              postCode: b.property.postCode,
            }
          : null,
        flat: b.flat
          ? {
              _id: b.flat._id,
              unitName: b.flat.unitName,
              rentPerMonth: b.flat.rentPerMonth,
            }
          : null,
        landlord: b.landlord
          ? {
              _id: b.landlord._id,
              name:
                b.landlord.name ||
                `${b.landlord.firstName || ""} ${b.landlord.lastName || ""}`.trim() ||
                b.landlord.companyName ||
                "Landlord",
              email: b.landlord.email,
              phone: b.landlord.phone,
              companyName: b.landlord.companyName,
            }
          : null,
        createdAt: b.createdAt,
      };
    });

    return {
      meta,
      data: {
        tab,
        summary,
        history,
      },
    };
  }

  // ===================== TAB: EXTRA CHARGES =====================
  // tab === "extra-charge"
  const chargeFilter: Record<string, any> = {
    tenant: new Types.ObjectId(tenantId),
    billCategory: BILL_CATEGORY.CHARGES,
    status: { $ne: BILL_STATUS.CANCELLED },
    isDeleted: { $ne: true },
  };

  const allChargeBills = await FinanceBill.find(chargeFilter).lean();

  const unpaidChargeBills = allChargeBills.filter((b: any) => {
    const computed = syncBillStatus(b);
    return (
      computed !== BILL_STATUS.PAID &&
      b.amount - (b.paidAmount || 0) > 0
    );
  });

  const chargesBalance = unpaidChargeBills.reduce(
    (acc: number, curr: any) =>
      acc + Math.max(0, curr.amount - (curr.paidAmount || 0)),
    0,
  );
  const totalPaidCharges = allChargeBills.reduce(
    (acc: number, curr: any) => acc + (curr.paidAmount || 0),
    0,
  );
  const totalChargesAmount = allChargeBills.reduce(
    (acc: number, curr: any) => acc + (curr.amount || 0),
    0,
  );

  const summary = {
    totalDue: chargesBalance,
    totalPaid: totalPaidCharges,
    totalCharges: totalChargesAmount,
    outstandingCount: unpaidChargeBills.length,
    paidCount: allChargeBills.filter(
      (b: any) => syncBillStatus(b) === BILL_STATUS.PAID,
    ).length,
    totalBills: allChargeBills.length,
    currency: getCurrencyCode(),
    currencySymbol: getCurrencySymbol(),
  };

  const baseQuery = FinanceBill.find(chargeFilter)
    .populate(billPopulateOptions)
    .sort({ dueDate: -1, createdAt: -1 });

  const queryBuilder = new QueryBuilder(baseQuery, queryCopy)
    .search(financeSearchableFields)
    .paginate()
    .fields();

  const [bills, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  const history = bills.map((b: any) => {
    const computed = syncBillStatus(b);
    const isOverdue =
      new Date(b.dueDate) < now && computed !== BILL_STATUS.PAID;
    const dueAmount = Math.max(0, (b.amount || 0) - (b.paidAmount || 0));
    const formattedPeriodMonth =
      b.periodMonth instanceof Date
        ? formatMonthPeriod(b.periodMonth)
        : b.periodMonth || "";

    const statusLabel =
      computed === BILL_STATUS.PAID
        ? "Paid"
        : computed === BILL_STATUS.PARTIAL
          ? isOverdue
            ? "Partially paid (Overdue)"
            : "Partially paid"
          : computed === BILL_STATUS.OVERDUE
            ? "Overdue"
            : "Due";

    return {
      _id: b._id,
      id: b._id,
      invoiceNumber: b.invoiceNumber,
      billType: b.billType,
      billCategory: b.billCategory,
      title: b.description || formatChargeTypeLabel(b.billType),
      description: b.description || "",
      periodMonth: b.periodMonth,
      formattedPeriodMonth,
      amount: b.amount || 0,
      paidAmount: b.paidAmount || 0,
      dueAmount,
      dueDate: b.dueDate,
      paidAt: b.paidAt || null,
      paymentMethod: b.paymentMethod || null,
      status: computed,
      statusLabel,
      canPayOnline: computed !== BILL_STATUS.PAID,
      property: b.property
        ? {
            _id: b.property._id,
            propertyName: b.property.propertyName,
            streetAddress: b.property.streetAddress,
            postCode: b.property.postCode,
          }
        : null,
      flat: b.flat
        ? {
            _id: b.flat._id,
            unitName: b.flat.unitName,
          }
        : null,
      landlord: b.landlord
        ? {
            _id: b.landlord._id,
            name:
              b.landlord.name ||
              `${b.landlord.firstName || ""} ${b.landlord.lastName || ""}`.trim() ||
              b.landlord.companyName ||
              "Landlord",
            email: b.landlord.email,
            phone: b.landlord.phone,
            companyName: b.landlord.companyName,
          }
        : null,
      createdAt: b.createdAt,
    };
  });

  return {
    meta,
    data: {
      tab,
      summary,
      history,
    },
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
  const formattedPeriod = bill.periodMonth
    ? formatMonthPeriod(parsePeriodMonthToDate(bill.periodMonth))
    : "";
  const remainingAmount = Math.max(
    0,
    Number(bill.amount || 0) - Number(bill.paidAmount || 0),
  );
  if (remainingAmount <= 0) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "This bill has no remaining balance to pay",
    );
  }

  const billTitle =
    bill.billType === CHARGE_TYPE.RENT
      ? `${formattedPeriod} Rent`
      : `${formatDisplayBillType(bill.billType)} - ${bill.description || formattedPeriod}`;

  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: billTitle,
            description: `Invoice: ${bill.invoiceNumber} | Flat: ${(bill.flat as any)?.unitName || "N/A"}`,
          },
          unit_amount: Math.round(remainingAmount * 100),
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
      amount: remainingAmount.toString(),
    },
  });

  bill.stripeSessionId = session.id;
  await bill.save();

  return {
    paymentUrl: session.url,
    sessionId: session.id,
    amount: remainingAmount,
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
      { path: "tenant", select: "name email phone profileImage" },
      { path: "tenants", select: "name email phone profileImage" },
    ])
    .lean();

  // 3. Active Tenancies for accurate tenant mappings
  const activeTenancies = await Tenancy.find({
    landlord: new Types.ObjectId(landlordId),
    status: "active",
  })
    .populate([
      { path: "tenant", select: "name email phone profileImage" },
      { path: "flat", select: "unitName" },
      { path: "property", select: "propertyName streetAddress postCode" },
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
      { path: "landlord", select: "name firstName lastName email phone profileImage" },
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
        { path: "landlord", select: "name firstName lastName email phone profileImage" },
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
  getLandlordTransactionsFromDB,
  getRecordPaymentDataFromDB,
  getSingleBillFromDB,
  createChargeIntoDB,
  recordPaymentIntoDB,
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
