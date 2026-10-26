import Stripe from "stripe";
import config from "../../../config";
import { USER_ROLES } from "../../../enums/user";
import { getStripe } from "../../../helpers/stripeHelper";
import { IPackage } from "../package/package.interface";
import { Subscription } from "../subscription/subscription.model";
import { User } from "../user/user.model";
import {
  IAdminDashboardStats,
  IAdminMonthlyRevenueResponse,
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
    Math.round(
      revenueData.reduce((acc, curr) => acc + curr.revenue, 0) * 100,
    ) / 100;

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
          $in: [
            USER_ROLES.LANDLORD,
            USER_ROLES.TENANT,
            USER_ROLES.CONTRACTOR,
          ],
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
          $in: [
            USER_ROLES.LANDLORD,
            USER_ROLES.TENANT,
            USER_ROLES.CONTRACTOR,
          ],
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

export const AdminService = {
  getAdminDashboardDataFromDB,
  getMonthlyRevenueFromDB,
  getUserGrowthFromDB,
};
