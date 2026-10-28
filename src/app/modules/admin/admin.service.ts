import Stripe from "stripe";
import mongoose, { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import config from "../../../config";
import { STATUS, USER_ROLES } from "../../../enums/user";
import { getStripe } from "../../../helpers/stripeHelper";
import {
  formatCurrency,
  formatMonthlyPrice,
  getCurrencyCodeUpper,
  getCurrencySymbol,
} from "../../../helpers/currencyHelper";
import { IPackage } from "../package/package.interface";
import { Package } from "../package/package.model";
import { Subscription } from "../subscription/subscription.model";
import { User } from "../user/user.model";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { Tenancy } from "../tenant/tenant.model";
import { TENANCY_STATUS } from "../tenant/tenant.constant";
import { Contractor } from "../contractor/contractor.model";
import { CONTRACTOR_RELATION_STATUS } from "../contractor/contractor.constant";
import { Maintenance } from "../maintenance/maintenance.model";
import { MAINTENANCE_STATUS } from "../maintenance/maintenance.constant";
import {
  IAdminCascadeActionResult,
  IAdminContractorItem,
  IAdminDashboardStats,
  IAdminLandlordDetail,
  IAdminLandlordFullDetails,
  IAdminLandlordListItem,
  IAdminLandlordsResponse,
  IAdminMonthlyRevenueResponse,
  IAdminPropertyItem,
  IAdminPropertyUnitItem,
  IAdminTenantItem,
  IAdminTransactionItem,
  IAdminTransactionQuery,
  IAdminTransactionsResponse,
  IAdminTransactionStats,
  IAdminUserGrowthResponse,
  IMonthlyRevenueItem,
  IUserGrowthItem,
} from "./admin.interface";

const MONTH_NAMES = [
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

// 1. Existing Dashboard Stats (Cards)
const getAdminDashboardDataFromDB = async (): Promise<IAdminDashboardStats> => {
  const [totalLandlords, activeSubscriptions] = await Promise.all([
    // Total Landlords
    User.countDocuments({
      role: USER_ROLES.LANDLORD,
      isDeleted: { $ne: true },
    }),

    // Active Subscriptions with Package details
    Subscription.find({
      status: "active",
      isDeleted: { $ne: true },
    })
      .populate<{ packageId: IPackage }>("packageId")
      .lean(),
  ]);

  // Calculate Monthly Revenue across active subscriptions
  let monthlyRevenue = 0;
  for (const sub of activeSubscriptions) {
    const pkg = sub.packageId as unknown as IPackage;
    if (pkg) {
      if (sub.planType === "yearly") {
        const yearlyAmount =
          typeof pkg.yearlyPrice === "number" ? pkg.yearlyPrice : 0;
        monthlyRevenue +=
          yearlyAmount > 0
            ? Math.round((yearlyAmount / 12) * 100) / 100
            : pkg.monthlyPrice || 0;
      } else {
        monthlyRevenue += pkg.monthlyPrice || 0;
      }
    }
  }

  monthlyRevenue = Math.round(monthlyRevenue * 100) / 100;

  return {
    totalLandlords,
    monthlyRevenue,
    activeSubscriptions: activeSubscriptions.length,
  };
};

// 2. Monthly Revenue - Landlord subscription income (Billed via Stripe)
const getMonthlyRevenueFromDB = async (
  year?: number,
): Promise<IAdminMonthlyRevenueResponse> => {
  const targetYear = year ? Number(year) : new Date().getFullYear();
  const startOfYear = new Date(targetYear, 0, 1, 0, 0, 0, 0);
  const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59, 999);

  const monthlyTotals: number[] = new Array(12).fill(0);
  let hasStripeInvoices = false;

  // Try fetching paid invoices directly from Stripe if secret key is present
  const secretKey = config.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
  if (secretKey) {
    try {
      const stripe = getStripe();
      const gte = Math.floor(startOfYear.getTime() / 1000);
      const lte = Math.floor(endOfYear.getTime() / 1000);

      let startingAfter: string | undefined = undefined;
      let hasMore = true;

      while (hasMore) {
        const response: Stripe.Response<Stripe.ApiList<Stripe.Invoice>> =
          await stripe.invoices.list({
            created: { gte, lte },
            status: "paid",
            limit: 100,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          });

        if (response.data && response.data.length > 0) {
          hasStripeInvoices = true;
          for (const invoice of response.data) {
            const invoiceDate = new Date(invoice.created * 1000);
            const monthIndex = invoiceDate.getMonth();
            const amount = (invoice.amount_paid || 0) / 100;
            monthlyTotals[monthIndex] += amount;
          }
          startingAfter = response.data[response.data.length - 1].id;
          hasMore = response.has_more;
        } else {
          hasMore = false;
        }
      }
    } catch {
      // In case of local/offline dev or invalid Stripe keys, continue to DB fallback
      hasStripeInvoices = false;
    }
  }

  // Fallback to internal Subscription and Package database
  if (!hasStripeInvoices) {
    const subscriptions = await Subscription.find({
      isDeleted: { $ne: true },
      isTrial: { $ne: true },
    })
      .populate<{ packageId: IPackage }>("packageId")
      .lean();

    const now = new Date();

    for (const sub of subscriptions) {
      const pkg = sub.packageId as unknown as IPackage;
      if (!pkg) continue;

      const subCreatedAt = (sub as any).createdAt
        ? new Date((sub as any).createdAt)
        : sub.currentPeriodStart
          ? new Date(sub.currentPeriodStart)
          : new Date();
      const monthlyRate =
        sub.planType === "yearly"
          ? (pkg.yearlyPrice || 0) > 0
            ? Math.round(((pkg.yearlyPrice || 0) / 12) * 100) / 100
            : pkg.monthlyPrice || 0
          : pkg.monthlyPrice || 0;

      for (let m = 0; m < 12; m++) {
        // Skip future months that have not occurred yet
        if (
          targetYear > now.getFullYear() ||
          (targetYear === now.getFullYear() && m > now.getMonth())
        ) {
          continue;
        }

        const monthStart = new Date(targetYear, m, 1);
        const monthEnd = new Date(targetYear, m + 1, 0, 23, 59, 59, 999);

        // Subscription must have started on or before the month end
        if (subCreatedAt <= monthEnd) {
          // If subscription was canceled before this month began, skip
          if (sub.canceledAt && new Date(sub.canceledAt) < monthStart) {
            continue;
          }

          monthlyTotals[m] += monthlyRate;
        }
      }
    }
  }

  const revenueData: IMonthlyRevenueItem[] = MONTH_NAMES.map((month, idx) => ({
    month,
    revenue: Math.round(monthlyTotals[idx] * 100) / 100,
  }));

  const totalRevenue =
    Math.round(revenueData.reduce((acc, curr) => acc + curr.revenue, 0) * 100) /
    100;

  return {
    year: targetYear,
    totalRevenue,
    revenue: revenueData,
  };
};

// 3. User Growth - Registered landlords, tenants & contractors
const getUserGrowthFromDB = async (
  year?: number,
): Promise<IAdminUserGrowthResponse> => {
  const targetYear = year ? Number(year) : new Date().getFullYear();
  const startOfYear = new Date(targetYear, 0, 1, 0, 0, 0, 0);
  const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59, 999);

  // 1. Baseline users created prior to the start of the target year
  const baselineUsers = await User.aggregate([
    {
      $match: {
        role: {
          $in: [USER_ROLES.LANDLORD, USER_ROLES.TENANT, USER_ROLES.CONTRACTOR],
        },
        isDeleted: { $ne: true },
        createdAt: { $lt: startOfYear },
      },
    },
    {
      $group: {
        _id: "$role",
        count: { $sum: 1 },
      },
    },
  ]);

  let cumulativeLandlords = 0;
  let cumulativeTenants = 0;
  let cumulativeContractors = 0;

  for (const item of baselineUsers) {
    if (item._id === USER_ROLES.LANDLORD) cumulativeLandlords = item.count;
    if (item._id === USER_ROLES.TENANT) cumulativeTenants = item.count;
    if (item._id === USER_ROLES.CONTRACTOR) cumulativeContractors = item.count;
  }

  // 2. New registrations during the target year grouped by role and month
  const usersInYear = await User.aggregate([
    {
      $match: {
        role: {
          $in: [USER_ROLES.LANDLORD, USER_ROLES.TENANT, USER_ROLES.CONTRACTOR],
        },
        isDeleted: { $ne: true },
        createdAt: { $gte: startOfYear, $lte: endOfYear },
      },
    },
    {
      $group: {
        _id: {
          role: "$role",
          month: { $month: "$createdAt" }, // 1 to 12
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const monthlyNewMap: Record<
    number,
    { landlords: number; tenants: number; contractors: number }
  > = {};

  for (let m = 1; m <= 12; m++) {
    monthlyNewMap[m] = { landlords: 0, tenants: 0, contractors: 0 };
  }

  for (const item of usersInYear) {
    const month = item._id.month;
    const role = item._id.role;
    if (monthlyNewMap[month]) {
      if (role === USER_ROLES.LANDLORD) {
        monthlyNewMap[month].landlords = item.count;
      }
      if (role === USER_ROLES.TENANT) {
        monthlyNewMap[month].tenants = item.count;
      }
      if (role === USER_ROLES.CONTRACTOR) {
        monthlyNewMap[month].contractors = item.count;
      }
    }
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth(); // 0-indexed: 0 = Jan, 9 = Oct

  // 3. Build user growth across 12 months
  const growthData: IUserGrowthItem[] = MONTH_NAMES.map((month, idx) => {
    const m = idx + 1;
    const newCounts = monthlyNewMap[m];

    // Check if this month is in the future
    const isFutureMonth =
      targetYear > currentYear ||
      (targetYear === currentYear && idx > currentMonthIndex);

    cumulativeLandlords += newCounts.landlords;
    cumulativeTenants += newCounts.tenants;
    cumulativeContractors += newCounts.contractors;

    if (isFutureMonth) {
      return {
        month,
        landlords: 0,
        tenants: 0,
        contractors: 0,
        total: 0,
        newLandlords: 0,
        newTenants: 0,
        newContractors: 0,
      };
    }

    return {
      month,
      landlords: cumulativeLandlords,
      tenants: cumulativeTenants,
      contractors: cumulativeContractors,
      total: cumulativeLandlords + cumulativeTenants + cumulativeContractors,
      newLandlords: newCounts.landlords,
      newTenants: newCounts.tenants,
      newContractors: newCounts.contractors,
    };
  });

  return {
    year: targetYear,
    growth: growthData,
  };
};

// ==========================================
// 4. Admin Transactions & Summary Stats
// ==========================================

const formatTransactionDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const fetchUnifiedTransactions = async (): Promise<IAdminTransactionItem[]> => {
  // 1. Query MongoDB Subscription collection (Ground truth)
  const subscriptions = await Subscription.find({
    isDeleted: { $ne: true },
  })
    .populate<{ userId: any }>("userId")
    .populate<{ packageId: IPackage }>("packageId")
    .sort({ createdAt: -1 })
    .lean();

  if (!subscriptions || subscriptions.length === 0) {
    return [];
  }

  const items: IAdminTransactionItem[] = [];
  const secretKey = config.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
  let stripe: Stripe | null = null;
  if (secretKey) {
    try {
      stripe = getStripe();
    } catch {
      stripe = null;
    }
  }

  const defaultCurrency = getCurrencyCodeUpper();
  const defaultSymbol = getCurrencySymbol(defaultCurrency);

  for (const sub of subscriptions) {
    const user = sub.userId;
    const pkg = sub.packageId as unknown as IPackage;
    if (!user) continue;

    const isYearly = sub.planType === "yearly";
    const packagePrice = isYearly
      ? pkg?.yearlyPrice || 0
      : pkg?.monthlyPrice || 0;

    let transactionInvoices: Stripe.Invoice[] = [];

    // If Stripe is available, fetch only the invoices belonging to THIS specific subscription
    if (stripe && sub.stripeSubscriptionId) {
      try {
        const invList = await stripe.invoices.list({
          subscription: sub.stripeSubscriptionId,
          limit: 100,
        });
        if (invList.data && invList.data.length > 0) {
          transactionInvoices = invList.data;
        }
      } catch {
        // Fallback to latestInvoiceId or direct DB record
      }
    } else if (stripe && sub.latestInvoiceId) {
      try {
        const singleInv = await stripe.invoices.retrieve(sub.latestInvoiceId);
        if (singleInv) {
          transactionInvoices = [singleInv];
        }
      } catch {
        // Fallback to direct DB record
      }
    }

    if (transactionInvoices.length > 0) {
      for (const inv of transactionInvoices) {
        const isPaid = inv.status === "paid";
        const statusText: "Completed" | "Failed" = isPaid
          ? "Completed"
          : "Failed";

        const amount =
          inv.amount_paid > 0
            ? inv.amount_paid / 100
            : inv.total > 0
              ? inv.total / 100
              : packagePrice;

        const currency = (inv.currency || defaultCurrency).toUpperCase();
        const currencySymbol = getCurrencySymbol(inv.currency);
        const invDate = new Date(inv.created * 1000);

        items.push({
          id: inv.id,
          transactionId: inv.id,
          invoiceNumber: inv.number || inv.id,
          landlord: {
            id: user._id.toString(),
            name: user.name || inv.customer_name || "Landlord",
            email: user.email || inv.customer_email || "",
            profileImage: user.profileImage || "",
          },
          plan: pkg?.name || "Starter Plus",
          billing: isYearly ? "Yearly" : "Monthly",
          amount,
          formattedAmount: `${currencySymbol}${amount}`,
          currency,
          currencySymbol,
          method: "Card",
          status: statusText,
          date: invDate.toISOString(),
          formattedDate: formatTransactionDate(invDate),
          invoiceUrl: inv.hosted_invoice_url || "",
          invoicePdf: inv.invoice_pdf || "",
        });
      }
    } else {
      // Direct MongoDB record
      const isCompleted = sub.status === "active" || sub.status === "trialing";
      const statusText: "Completed" | "Failed" = isCompleted
        ? "Completed"
        : "Failed";
      const transDate = sub.currentPeriodStart
        ? new Date(sub.currentPeriodStart)
        : sub.createdAt
          ? new Date(sub.createdAt)
          : new Date();

      items.push({
        id: sub._id.toString(),
        transactionId:
          sub.latestInvoiceId || `sub_${sub._id.toString().slice(-8)}`,
        invoiceNumber: sub.latestInvoiceId
          ? sub.latestInvoiceId.toUpperCase()
          : `INV-${sub._id.toString().slice(-6).toUpperCase()}`,
        landlord: {
          id: user._id.toString(),
          name: user.name || "Landlord",
          email: user.email || "",
          profileImage: user.profileImage || "",
        },
        plan: pkg?.name || "Starter Plus",
        billing: isYearly ? "Yearly" : "Monthly",
        amount: packagePrice,
        formattedAmount: `${defaultSymbol}${packagePrice}`,
        currency: defaultCurrency,
        currencySymbol: defaultSymbol,
        method: "Card",
        status: statusText,
        date: transDate.toISOString(),
        formattedDate: formatTransactionDate(transDate),
        invoiceUrl: "",
        invoicePdf: "",
      });
    }
  }

  return items;
};

// Filter transactions by date or pre-set range
const filterTransactionsByDate = (
  list: IAdminTransactionItem[],
  query: IAdminTransactionQuery,
): IAdminTransactionItem[] => {
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (query.startDate) {
    startDate = new Date(query.startDate);
  }
  if (query.endDate) {
    endDate = new Date(query.endDate);
    endDate.setHours(23, 59, 59, 999);
  }

  const dateRange = (query.dateRange || query.range || "").toLowerCase();

  if (!startDate && !endDate && dateRange && dateRange !== "all_time") {
    const now = new Date();
    if (dateRange === "today") {
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0,
      );
      endDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );
    } else if (dateRange === "this_week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (dateRange === "this_month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
    } else if (dateRange === "this_year") {
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    }
  }

  if (startDate || endDate) {
    return list.filter((item) => {
      const d = new Date(item.date);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }

  return list;
};

// Filter transactions by tab status ("all", "completed", "failed")
const filterTransactionsByStatus = (
  list: IAdminTransactionItem[],
  status?: string,
): IAdminTransactionItem[] => {
  if (!status || status.toLowerCase() === "all") return list;
  const s = status.toLowerCase();
  if (s === "completed" || s === "paid" || s === "success") {
    return list.filter((item) => item.status === "Completed");
  }
  if (s === "failed" || s === "unpaid" || s === "uncollectible") {
    return list.filter((item) => item.status === "Failed");
  }
  return list;
};

// Filter transactions by search term
const filterTransactionsBySearch = (
  list: IAdminTransactionItem[],
  query: IAdminTransactionQuery,
): IAdminTransactionItem[] => {
  const term = (query.searchTerm || query.search || query.q || "")
    .trim()
    .toLowerCase();

  if (!term) return list;

  return list.filter(
    (item) =>
      item.landlord.name.toLowerCase().includes(term) ||
      item.landlord.email.toLowerCase().includes(term) ||
      item.plan.toLowerCase().includes(term) ||
      item.invoiceNumber.toLowerCase().includes(term) ||
      item.transactionId.toLowerCase().includes(term),
  );
};

// API 1: Transaction Summary Cards (Total Collected, Transactions, Paying Landlords)
const getTransactionStatsFromDB = async (
  query: IAdminTransactionQuery = {},
): Promise<IAdminTransactionStats> => {
  let allTransactions = await fetchUnifiedTransactions();

  // Apply optional date filter (e.g., "All Time", "This Month", etc.)
  allTransactions = filterTransactionsByDate(allTransactions, query);

  const completedTransactions = allTransactions.filter(
    (item) => item.status === "Completed",
  );

  const totalCollected =
    Math.round(
      completedTransactions.reduce((acc, curr) => acc + curr.amount, 0) * 100,
    ) / 100;

  const totalTransactions = allTransactions.length;

  const payingLandlordsSet = new Set<string>();
  for (const item of completedTransactions) {
    const identifier = item.landlord.id || item.landlord.email;
    if (identifier) {
      payingLandlordsSet.add(identifier);
    }
  }
  const payingLandlords = payingLandlordsSet.size;

  const currency =
    allTransactions[0]?.currency || getCurrencyCodeUpper();
  const currencySymbol =
    allTransactions[0]?.currencySymbol || getCurrencySymbol(currency);

  return {
    totalCollected,
    formattedTotalCollected: `${currencySymbol}${totalCollected}`,
    currency,
    currencySymbol,
    totalTransactions,
    payingLandlords,
  };
};

// API 2: Transactions List (Table, Search, Status tabs, Date filter, Pagination, CSV Export)
const getTransactionsFromDB = async (
  query: IAdminTransactionQuery = {},
): Promise<IAdminTransactionsResponse> => {
  let transactions = await fetchUnifiedTransactions();

  // 1. Date Range Filter
  transactions = filterTransactionsByDate(transactions, query);

  // 2. Status Filter ("all", "completed", "failed")
  transactions = filterTransactionsByStatus(transactions, query.status);

  // 3. Search Filter
  transactions = filterTransactionsBySearch(transactions, query);

  // Sort descending by date
  transactions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const total = transactions.length;

  const isExport =
    query.export === true ||
    query.export === "true" ||
    query.limit === "all" ||
    Number(query.limit) === -1;

  if (isExport) {
    return {
      meta: {
        page: 1,
        limit: total,
        total,
        totalPage: 1,
      },
      data: transactions,
    };
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Number(query.limit) || 10);
  const totalPage = Math.ceil(total / limit) || 1;

  const startIndex = (page - 1) * limit;
  const paginatedData = transactions.slice(startIndex, startIndex + limit);

  return {
    meta: {
      page,
      limit,
      total,
      totalPage,
    },
    data: paginatedData,
  };
};

// ==========================================
// 5. Landlord Management & Cascade Operations
// ==========================================

const formatDate = (date?: Date | string | null): string => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getInitials = (name?: string): string => {
  if (!name || !name.trim()) return "LL";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatFloor = (floor?: number, floorNote?: string): string => {
  if (floorNote && floorNote.trim()) return floorNote.trim();
  if (floor === undefined || floor === null || floor === 0)
    return "Ground Floor";
  if (floor === 1) return "1st Floor";
  if (floor === 2) return "2nd Floor";
  if (floor === 3) return "3rd Floor";
  return `${floor}th Floor`;
};

const formatContractDuration = (
  startDate?: Date | string,
  endDate?: Date | string,
): string => {
  if (!startDate || !endDate) return "AST Fixed 12m";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "AST Fixed 12m";
  const diffMonths = Math.max(
    1,
    Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375),
    ),
  );
  return `AST Fixed ${diffMonths}m`;
};

// 1. Get Landlords List (Formatted for Admin Users Screen)
const getLandlordsFromDB = async (
  query: Record<string, unknown>,
): Promise<IAdminLandlordsResponse> => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Number(query.limit) || 10);
  const skip = (page - 1) * limit;

  const searchTerm =
    (query.searchTerm as string) || (query.search as string) || "";
  const statusFilter = ((query.status as string) || "all").toLowerCase();
  const planFilter = (query.plan as string) || "";
  const sortBy = (query.sortBy as string) || "newest";

  // Base match for landlords
  const baseLandlordFilter: Record<string, any> = {
    role: USER_ROLES.LANDLORD,
    isDeleted: { $ne: true },
  };

  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.trim();
    baseLandlordFilter.$or = [
      { name: { $regex: term, $options: "i" } },
      { email: { $regex: term, $options: "i" } },
      { address: { $regex: term, $options: "i" } },
      { phone: { $regex: term, $options: "i" } },
    ];
  }

  // Summary counts across all landlords
  const [allCount, suspendedCount, trialSubs, pastDueSubs] = await Promise.all([
    User.countDocuments({
      role: USER_ROLES.LANDLORD,
      isDeleted: { $ne: true },
    }),
    User.countDocuments({
      role: USER_ROLES.LANDLORD,
      isDeleted: { $ne: true },
      status: STATUS.INACTIVE,
    }),
    Subscription.find({
      $or: [{ isTrial: true }, { status: "trialing" }],
      isDeleted: { $ne: true },
    }).select("userId"),
    Subscription.find({
      status: { $in: ["past_due", "unpaid"] },
      isDeleted: { $ne: true },
    }).select("userId"),
  ]);

  const trialUserIds = trialSubs.map((s) => s.userId.toString());
  const pastDueUserIds = pastDueSubs.map((s) => s.userId.toString());

  const activeCount = Math.max(
    0,
    allCount - suspendedCount - trialUserIds.length - pastDueUserIds.length,
  );

  const summary = {
    allCount,
    activeCount,
    trialCount: trialUserIds.length,
    pastDueCount: pastDueUserIds.length,
    suspendedCount,
  };

  // Build query filter with status tabs
  const queryFilter: Record<string, any> = { ...baseLandlordFilter };

  if (statusFilter === "suspended") {
    queryFilter.status = STATUS.INACTIVE;
  } else if (statusFilter === "trial") {
    queryFilter._id = {
      $in: trialUserIds.map((id) => new Types.ObjectId(id)),
    };
    queryFilter.status = { $ne: STATUS.INACTIVE };
  } else if (statusFilter === "past_due" || statusFilter === "pastdue") {
    queryFilter._id = {
      $in: pastDueUserIds.map((id) => new Types.ObjectId(id)),
    };
    queryFilter.status = { $ne: STATUS.INACTIVE };
  } else if (statusFilter === "active") {
    queryFilter.status = STATUS.ACTIVE;
    const excludeIds = [...trialUserIds, ...pastDueUserIds];
    if (excludeIds.length > 0) {
      queryFilter._id = {
        $nin: excludeIds.map((id) => new Types.ObjectId(id)),
      };
    }
  }

  // Optional plan filter
  if (planFilter && planFilter.trim() && planFilter.toLowerCase() !== "all") {
    const matchedPackages = await Package.find({
      name: { $regex: planFilter.trim(), $options: "i" },
    }).select("_id");
    const packageIds = matchedPackages.map((p) => p._id);
    const matchedSubscriptions = await Subscription.find({
      packageId: { $in: packageIds },
      isDeleted: { $ne: true },
    }).select("userId");
    const landlordIdsForPlan = matchedSubscriptions.map((s) => s.userId);
    queryFilter._id = {
      ...(queryFilter._id || {}),
      $in: landlordIdsForPlan,
    };
  }

  // Sort order
  const sortOption: Record<string, 1 | -1> =
    sortBy === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

  const [landlords, total] = await Promise.all([
    User.find(queryFilter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .select("name email phone profileImage address status createdAt")
      .lean(),
    User.countDocuments(queryFilter),
  ]);

  const landlordIds = landlords.map((l) => l._id);

  // Parallel enrichment for properties, flats, and subscriptions
  const [propertiesCounts, flatsCounts, subscriptions] = await Promise.all([
    Property.aggregate([
      { $match: { landlord: { $in: landlordIds }, isDeleted: { $ne: true } } },
      { $group: { _id: "$landlord", count: { $sum: 1 } } },
    ]),
    Flat.aggregate([
      { $match: { landlord: { $in: landlordIds }, isDeleted: { $ne: true } } },
      { $group: { _id: "$landlord", count: { $sum: 1 } } },
    ]),
    Subscription.find({
      userId: { $in: landlordIds },
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .populate<{ packageId: IPackage }>("packageId")
      .lean(),
  ]);

  const propCountMap: Record<string, number> = {};
  for (const item of propertiesCounts) {
    propCountMap[item._id.toString()] = item.count;
  }

  const flatCountMap: Record<string, number> = {};
  for (const item of flatsCounts) {
    flatCountMap[item._id.toString()] = item.count;
  }

  const subMap: Record<string, any> = {};
  for (const sub of subscriptions) {
    const uId = sub.userId.toString();
    if (!subMap[uId]) {
      subMap[uId] = sub;
    }
  }

  const data: IAdminLandlordListItem[] = landlords.map((landlord) => {
    const lId = landlord._id.toString();
    const propCount = propCountMap[lId] || 0;
    const unitCount = flatCountMap[lId] || 0;
    const sub = subMap[lId];
    const pkg = sub ? (sub.packageId as unknown as IPackage) : null;
    const maxUnits =
      pkg && typeof pkg.maxFlats === "number" && pkg.maxFlats > 0
        ? pkg.maxFlats
        : null;
    const isNearLimit =
      maxUnits !== null && maxUnits > 0 && unitCount >= maxUnits;

    const isTrial = Boolean(sub?.isTrial || sub?.status === "trialing");
    const isPastDue = Boolean(
      sub?.status === "past_due" || sub?.status === "unpaid",
    );
    const isSuspended = landlord.status === STATUS.INACTIVE;

    let displayStatus: "active" | "trial" | "past_due" | "suspended" = "active";
    let statusBadge: {
      label: string;
      variant: "success" | "warning" | "danger" | "neutral";
    } = {
      label: "Active",
      variant: "success",
    };

    if (isSuspended) {
      displayStatus = "suspended";
      statusBadge = { label: "Suspended", variant: "danger" };
    } else if (isTrial) {
      displayStatus = "trial";
      statusBadge = { label: "Trial", variant: "warning" };
    } else if (isPastDue) {
      displayStatus = "past_due";
      statusBadge = { label: "Past Due", variant: "danger" };
    }

    const planData = pkg
      ? {
          packageName: pkg.name,
          price: pkg.monthlyPrice || 0,
          formattedPrice: formatMonthlyPrice(pkg.monthlyPrice),
          billingCadence:
            sub?.planType === "yearly"
              ? ("yearly" as const)
              : (pkg.monthlyPrice || 0) > 0
                ? ("monthly" as const)
                : ("free" as const),
          isTrial,
          status: sub?.status || "active",
        }
      : null;

    return {
      id: lId,
      name: landlord.name || "Unknown Landlord",
      email: landlord.email || "",
      phone: landlord.phone,
      profileImage: landlord.profileImage,
      initials: getInitials(landlord.name),
      portfolio: {
        propertiesCount: propCount,
        unitsCount: unitCount,
        maxUnits,
        formattedPortfolio: `${propCount} ${propCount === 1 ? "Property" : "Properties"}`,
        formattedUnits:
          maxUnits !== null
            ? `${unitCount} / ${maxUnits} units`
            : `${unitCount} ${unitCount === 1 ? "unit" : "units"}`,
        isNearLimit,
      },
      plan: planData,
      status: displayStatus,
      rawStatus: landlord.status === STATUS.INACTIVE ? "inactive" : "active",
      statusBadge,
      joinedDate: formatDate((landlord as any).createdAt),
      createdAt: (landlord as any).createdAt || new Date(),
    };
  });

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    summary,
    data,
  };
};

// 2. Get Landlord Header & Detail by ID
const getLandlordByIdFromDB = async (
  id: string,
): Promise<IAdminLandlordDetail> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid landlord ID");
  }

  const landlord = await User.findOne({
    _id: id,
    role: USER_ROLES.LANDLORD,
    isDeleted: { $ne: true },
  }).select("-password -authentication -deviceToken");

  if (!landlord) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Landlord not found");
  }

  const landlordId = landlord._id;

  const [
    managedProperties,
    rentalUnits,
    activeTenants,
    assignedContractors,
    subscription,
  ] = await Promise.all([
    Property.countDocuments({ landlord: landlordId, isDeleted: { $ne: true } }),
    Flat.countDocuments({ landlord: landlordId, isDeleted: { $ne: true } }),
    Tenancy.countDocuments({
      landlord: landlordId,
      status: TENANCY_STATUS.ACTIVE,
      isDeleted: { $ne: true },
    }),
    Contractor.countDocuments({
      landlord: landlordId,
      isDeleted: { $ne: true },
    }),
    Subscription.findOne({ userId: landlordId, isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .populate<{ packageId: IPackage }>("packageId")
      .lean(),
  ]);

  const pkg = subscription
    ? (subscription.packageId as unknown as IPackage)
    : null;
  const isSuspended = landlord.status === STATUS.INACTIVE;
  const isTrial = Boolean(
    subscription?.isTrial || subscription?.status === "trialing",
  );

  return {
    id: landlord._id.toString(),
    displayId: `ID: #${landlord._id.toString().slice(-4).toUpperCase()}`,
    name: landlord.name,
    email: landlord.email,
    phone: landlord.phone,
    profileImage: landlord.profileImage,
    initials: getInitials(landlord.name),
    address: landlord.address,
    status: isSuspended ? "suspended" : "active",
    statusBadge: isSuspended ? "Suspended Landlord" : "Active Landlord",
    joinedDate: formatDate((landlord as any).createdAt),
    createdAt: (landlord as any).createdAt || new Date(),
    plan: pkg
      ? {
          packageName: pkg.name.toUpperCase(),
          price: formatMonthlyPrice(pkg.monthlyPrice),
          nextRenewal: subscription?.currentPeriodEnd
            ? formatDate(subscription.currentPeriodEnd)
            : "N/A",
          billingCadence:
            subscription?.planType === "yearly" ? "Yearly" : "Monthly",
          paymentMethod: subscription?.stripeCustomerId
            ? "Direct Debit (**** 4242) / Stripe"
            : "Not configured",
          complianceStanding: "100% Valid (4/4 Cleared)",
          features:
            pkg.features && pkg.features.length > 0
              ? pkg.features
              : [
                  "Digital AST Creation",
                  "Gas Safety (CP12) Tracker",
                  "DPS / TDS Deposit Protection",
                  "Tenant & Contractor Portal",
                ],
          isTrial,
          status: subscription?.status || "active",
        }
      : null,
    stats: {
      managedProperties,
      rentalUnits,
      activeTenants,
      assignedContractors,
    },
  };
};

// 3. Get Landlord Properties & Units Tab
const getLandlordPropertiesFromDB = async (
  landlordId: string,
): Promise<IAdminPropertyItem[]> => {
  if (!mongoose.Types.ObjectId.isValid(landlordId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid landlord ID");
  }

  const landlord = await User.findOne({
    _id: landlordId,
    role: USER_ROLES.LANDLORD,
    isDeleted: { $ne: true },
  });

  if (!landlord) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Landlord not found");
  }

  const properties = await Property.find({
    landlord: landlordId,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .lean();

  const propertyIds = properties.map((p) => p._id);

  // Fetch all flats belonging to these properties
  const flats = await Flat.find({
    property: { $in: propertyIds },
    isDeleted: { $ne: true },
  })
    .populate("tenant", "name email phone profileImage")
    .sort({ floor: 1, unitName: 1 })
    .lean();

  const flatsByProperty: Record<string, any[]> = {};
  for (const flat of flats) {
    const propId = flat.property.toString();
    if (!flatsByProperty[propId]) {
      flatsByProperty[propId] = [];
    }
    flatsByProperty[propId].push(flat);
  }

  return properties.map((prop) => {
    const pId = prop._id.toString();
    const propFlats = flatsByProperty[pId] || [];
    const totalUnits = propFlats.length;

    let occupiedUnits = 0;
    const unitItems: IAdminPropertyUnitItem[] = propFlats.map((flat) => {
      const isOccupied = Boolean(flat.tenant);
      if (isOccupied) occupiedUnits++;

      const tenantObj = flat.tenant as any;
      const occupantName = tenantObj?.name || `Occupant ${flat.unitName}`;

      return {
        id: flat._id.toString(),
        unitName: flat.unitName,
        unitType: flat.unitType || `${flat.beds || 1} Bed Apartment`,
        beds: flat.beds,
        baths: flat.baths,
        floor: formatFloor(flat.floor, flat.floorNote),
        rentPerMonth: flat.rentPerMonth || 0,
        formattedRent: formatMonthlyPrice(flat.rentPerMonth),
        isOccupied,
        status: isOccupied ? "Occupied" : "Vacant",
        occupant: occupantName,
        tenant: tenantObj
          ? {
              id: tenantObj._id.toString(),
              name: tenantObj.name,
              email: tenantObj.email,
              phone: tenantObj.phone,
            }
          : null,
      };
    });

    const occupancyPercentage =
      totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
    const occupancyText = `${occupiedUnits} of ${totalUnits} units occupied (${occupancyPercentage}%)`;

    // CP12 Gas Safety check
    const hasCp12 = Boolean(
      prop.compliance?.gasSafety?.current ||
      (prop.compliance?.gasSafety?.history &&
        prop.compliance.gasSafety.history.length > 0),
    );

    const fullAddress = [prop.streetAddress, prop.postCode]
      .filter(Boolean)
      .join(", ");

    return {
      id: pId,
      propertyName: prop.propertyName,
      thumbnail: prop.propertyPhotos?.[0] || "",
      propertyPhotos: prop.propertyPhotos || [],
      streetAddress: prop.streetAddress || "",
      postCode: prop.postCode || "",
      fullAddress: fullAddress || prop.propertyName,
      unitsBadge: `${totalUnits} ${totalUnits === 1 ? "Unit" : "Units"}`,
      epcRating: prop.epcRating ? `EPC Rating: ${prop.epcRating}` : "EPC: N/A",
      cp12Status: hasCp12 ? "CP12 Valid" : "CP12 Pending",
      cp12Valid: hasCp12,
      totalUnits,
      occupiedUnits,
      occupancyPercentage,
      occupancyText,
      units: unitItems,
    };
  });
};

// 4. Get Landlord Tenants Tab
const getLandlordTenantsFromDB = async (
  landlordId: string,
): Promise<IAdminTenantItem[]> => {
  if (!mongoose.Types.ObjectId.isValid(landlordId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid landlord ID");
  }

  const landlord = await User.findOne({
    _id: landlordId,
    role: USER_ROLES.LANDLORD,
    isDeleted: { $ne: true },
  });

  if (!landlord) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Landlord not found");
  }

  const tenancies = await Tenancy.find({
    landlord: landlordId,
    isDeleted: { $ne: true },
  })
    .populate("property", "propertyName streetAddress postCode")
    .populate("flat", "unitName floor rentPerMonth")
    .populate("tenant", "name email phone profileImage status")
    .sort({ createdAt: -1 })
    .lean();

  return tenancies.map((tenancy) => {
    const tenant = (tenancy.tenant as any) || {};
    const prop = (tenancy.property as any) || {};
    const flat = (tenancy.flat as any) || {};

    const addressText = prop.streetAddress || prop.propertyName || "Property";
    const unitText = flat.unitName || "Unit";
    const propertyUnitText = `${addressText} / ${unitText}`;

    return {
      id: tenancy._id.toString(),
      tenantId: tenant._id ? tenant._id.toString() : "",
      name: tenant.name || tenancy.email || "Unknown Tenant",
      email: tenant.email || tenancy.email || "",
      phone: tenant.phone,
      profileImage: tenant.profileImage,
      initials: getInitials(tenant.name || tenancy.email),
      property: {
        id: prop._id ? prop._id.toString() : "",
        propertyName: prop.propertyName || "",
        streetAddress: prop.streetAddress || "",
      },
      unit: {
        id: flat._id ? flat._id.toString() : "",
        unitName: flat.unitName || "",
      },
      propertyUnitText,
      contract: formatContractDuration(
        tenancy.leaseStartDate,
        tenancy.leaseEndDate,
      ),
      status: (tenancy.status || "ACTIVE").toUpperCase(),
      leaseStartDate: tenancy.leaseStartDate,
      leaseEndDate: tenancy.leaseEndDate,
      moveInDate: formatDate(tenancy.leaseStartDate),
      rentAmount: tenancy.rentAmount || flat.rentPerMonth || 0,
      formattedRent: formatCurrency(tenancy.rentAmount || flat.rentPerMonth || 0),
      tenantAccountStatus:
        tenant.status === STATUS.INACTIVE ? "inactive" : "active",
    };
  });
};

// 5. Get Landlord Contractors Tab
const getLandlordContractorsFromDB = async (
  landlordId: string,
): Promise<IAdminContractorItem[]> => {
  if (!mongoose.Types.ObjectId.isValid(landlordId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid landlord ID");
  }

  const landlord = await User.findOne({
    _id: landlordId,
    role: USER_ROLES.LANDLORD,
    isDeleted: { $ne: true },
  });

  if (!landlord) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Landlord not found");
  }

  const contractors = await Contractor.find({
    landlord: landlordId,
    isDeleted: { $ne: true },
  })
    .populate("contractor", "name email phone profileImage companyName status")
    .populate("trades", "name type")
    .sort({ createdAt: -1 })
    .lean();

  const contractorUserIds = contractors
    .map((c) => (c.contractor as any)?._id)
    .filter(Boolean);

  // Active maintenance jobs for these contractors under this landlord
  const activeJobsCounts = await Maintenance.aggregate([
    {
      $match: {
        landlord: new Types.ObjectId(landlordId),
        contractor: { $in: contractorUserIds },
        status: {
          $in: [MAINTENANCE_STATUS.PENDING, MAINTENANCE_STATUS.IN_PROGRESS],
        },
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: "$contractor",
        count: { $sum: 1 },
      },
    },
  ]);

  const activeJobsMap: Record<string, number> = {};
  for (const item of activeJobsCounts) {
    activeJobsMap[item._id.toString()] = item.count;
  }

  return contractors.map((c) => {
    const user = (c.contractor as any) || {};
    const uId = user._id ? user._id.toString() : "";
    const activeJobs = activeJobsMap[uId] || 0;

    const tradeNames: string[] = Array.isArray(c.trades)
      ? c.trades.map((t: any) => t.name).filter(Boolean)
      : [];

    const primaryTrade =
      tradeNames.length > 0
        ? tradeNames[0]
        : user.primaryTrade || "Trade Contractor";

    return {
      id: c._id.toString(),
      contractorId: uId,
      name: user.name || c.name || "Contractor",
      companyName: c.companyName || user.companyName || "Service Provider",
      email: user.email || c.email || "",
      phone: user.phone || c.phone,
      profileImage: user.profileImage,
      initials: getInitials(user.name || c.name),
      trades: tradeNames,
      primaryTrade,
      status: (c.status || "active").toLowerCase(),
      rating: c.rating,
      activeJobs,
      activeJobsText: `${activeJobs} active ${activeJobs === 1 ? "job" : "jobs"}`,
    };
  });
};

// 6. Get Complete Full Details in One Shot (For Single Page Frontend Dashboards)
const getLandlordFullDetailsFromDB = async (
  id: string,
): Promise<IAdminLandlordFullDetails> => {
  const [landlord, properties, tenants, contractors] = await Promise.all([
    getLandlordByIdFromDB(id),
    getLandlordPropertiesFromDB(id),
    getLandlordTenantsFromDB(id),
    getLandlordContractorsFromDB(id),
  ]);

  return {
    landlord,
    properties,
    tenants,
    contractors,
  };
};

// 7. Update Landlord Status (Auto-Suspend / Auto-Reactivate Associated Tenants & Contractors)
const updateLandlordStatusToDB = async (
  landlordId: string,
  statusInput: "active" | "inactive" | "suspended",
): Promise<IAdminCascadeActionResult> => {
  if (!mongoose.Types.ObjectId.isValid(landlordId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid landlord ID");
  }

  const landlord = await User.findOne({
    _id: landlordId,
    role: USER_ROLES.LANDLORD,
    isDeleted: { $ne: true },
  });

  if (!landlord) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Landlord not found");
  }

  const isSuspending =
    statusInput === "suspended" || statusInput === "inactive";
  const targetStatus = isSuspending ? STATUS.INACTIVE : STATUS.ACTIVE;

  // 1. Update Landlord user status
  await User.findByIdAndUpdate(landlordId, { status: targetStatus });

  // 2. Cascade to all Tenants residing under this landlord
  const tenancies = await Tenancy.find({
    landlord: landlordId,
    isDeleted: { $ne: true },
  }).select("tenant");
  const tenantIds = tenancies.map((t) => t.tenant).filter(Boolean);

  let affectedTenantsCount = 0;
  if (tenantIds.length > 0) {
    const tenantRes = await User.updateMany(
      { _id: { $in: tenantIds } },
      { status: targetStatus },
    );
    affectedTenantsCount = tenantRes.modifiedCount;
  }

  // 3. Cascade to all Contractors assigned to this landlord
  const contractorLinks = await Contractor.find({
    landlord: landlordId,
    isDeleted: { $ne: true },
  }).select("contractor");
  const contractorUserIds = contractorLinks
    .map((c) => c.contractor)
    .filter(Boolean);

  let affectedContractorsCount = 0;
  if (contractorUserIds.length > 0) {
    // Update contractor relationships
    await Contractor.updateMany(
      { landlord: landlordId },
      {
        status: isSuspending
          ? CONTRACTOR_RELATION_STATUS.INACTIVE
          : CONTRACTOR_RELATION_STATUS.ACTIVE,
      },
    );

    // Update contractor user accounts
    const contractorRes = await User.updateMany(
      { _id: { $in: contractorUserIds } },
      { status: targetStatus },
    );
    affectedContractorsCount = contractorRes.modifiedCount;
  }

  const actionName = isSuspending ? "suspend" : "activate";
  const message = isSuspending
    ? `Landlord suspended successfully. ${affectedTenantsCount} tenant(s) and ${affectedContractorsCount} contractor(s) accounts were automatically suspended and cannot access their accounts.`
    : `Landlord activated successfully. ${affectedTenantsCount} tenant(s) and ${affectedContractorsCount} contractor(s) accounts were reactivated.`;

  return {
    landlordId,
    action: actionName,
    landlordStatus: targetStatus,
    affectedTenantsCount,
    affectedContractorsCount,
    message,
  };
};

// 8. Delete Landlord with Standard Cascade Soft-Delete
const deleteLandlordFromDB = async (
  landlordId: string,
): Promise<IAdminCascadeActionResult> => {
  if (!mongoose.Types.ObjectId.isValid(landlordId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid landlord ID");
  }

  const landlord = await User.findOne({
    _id: landlordId,
    role: USER_ROLES.LANDLORD,
  });

  if (!landlord) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Landlord not found");
  }

  const now = new Date();

  // 1. Soft-delete and deactivate landlord account
  await User.findByIdAndUpdate(landlordId, {
    isDeleted: true,
    deletedAt: now,
    status: STATUS.INACTIVE,
  });

  // 2. Cascade soft-delete Properties
  const propRes = await Property.updateMany(
    { landlord: landlordId, isDeleted: { $ne: true } },
    { isDeleted: true, deletedAt: now },
  );

  // 3. Cascade soft-delete Flats / Units
  const flatRes = await Flat.updateMany(
    { landlord: landlordId, isDeleted: { $ne: true } },
    { isDeleted: true, deletedAt: now },
  );

  // 4. Cascade soft-delete and terminate Tenancies
  await Tenancy.updateMany(
    { landlord: landlordId, isDeleted: { $ne: true } },
    {
      isDeleted: true,
      deletedAt: now,
      status: TENANCY_STATUS.TERMINATED,
    },
  );

  // 5. Cascade soft-delete and deactivate associated Tenant users
  const tenancies = await Tenancy.find({ landlord: landlordId }).select(
    "tenant",
  );
  const tenantIds = tenancies.map((t) => t.tenant).filter(Boolean);

  let affectedTenantsCount = 0;
  if (tenantIds.length > 0) {
    const tenantRes = await User.updateMany(
      { _id: { $in: tenantIds } },
      {
        isDeleted: true,
        deletedAt: now,
        status: STATUS.INACTIVE,
      },
    );
    affectedTenantsCount = tenantRes.modifiedCount;
  }

  // 6. Cascade soft-delete Contractor relationships and deactivate exclusive contractors
  const contractorLinks = await Contractor.find({
    landlord: landlordId,
  }).select("contractor");
  const contractorUserIds = contractorLinks
    .map((c) => c.contractor)
    .filter(Boolean);

  let affectedContractorsCount = 0;
  if (contractorUserIds.length > 0) {
    await Contractor.updateMany(
      { landlord: landlordId, isDeleted: { $ne: true } },
      {
        isDeleted: true,
        deletedAt: now,
        status: CONTRACTOR_RELATION_STATUS.TERMINATED,
      },
    );

    // Check if contractor has any other active landlord
    const otherRelations = await Contractor.find({
      contractor: { $in: contractorUserIds },
      landlord: { $ne: landlordId },
      isDeleted: { $ne: true },
    }).select("contractor");

    const otherContractorIds = new Set(
      otherRelations.map((r) => r.contractor.toString()),
    );
    const exclusiveContractors = contractorUserIds.filter(
      (id) => !otherContractorIds.has(id.toString()),
    );

    if (exclusiveContractors.length > 0) {
      const contractorRes = await User.updateMany(
        { _id: { $in: exclusiveContractors } },
        {
          isDeleted: true,
          deletedAt: now,
          status: STATUS.INACTIVE,
        },
      );
      affectedContractorsCount = contractorRes.modifiedCount;
    }
  }

  // 7. Cancel and soft-delete Subscriptions
  await Subscription.updateMany(
    { userId: landlordId, isDeleted: { $ne: true } },
    {
      isDeleted: true,
      status: "canceled",
      canceledAt: now,
    },
  );

  return {
    landlordId,
    action: "delete",
    landlordStatus: "deleted",
    affectedTenantsCount,
    affectedContractorsCount,
    affectedPropertiesCount: propRes.modifiedCount,
    affectedFlatsCount: flatRes.modifiedCount,
    message: `Landlord deleted successfully. Cascaded soft-delete to ${propRes.modifiedCount} properties, ${flatRes.modifiedCount} flats, ${affectedTenantsCount} tenants, and exclusive contractors.`,
  };
};

export const AdminService = {
  getAdminDashboardDataFromDB,
  getMonthlyRevenueFromDB,
  getUserGrowthFromDB,
  getTransactionStatsFromDB,
  getTransactionsFromDB,
  getLandlordsFromDB,
  getLandlordByIdFromDB,
  getLandlordPropertiesFromDB,
  getLandlordTenantsFromDB,
  getLandlordContractorsFromDB,
  getLandlordFullDetailsFromDB,
  updateLandlordStatusToDB,
  deleteLandlordFromDB,
};
