import { USER_ROLES } from "../../../enums/user";
import { User } from "../user/user.model";
import { Subscription } from "../subscription/subscription.model";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { IPackage } from "../package/package.interface";
import {
  ADMIN_CURRENCY_SYMBOL,
  ADMIN_CURRENCY_CODE,
} from "./admin.constant";
import {
  IAdminDashboardStats,
  IAdminMetricCard,
  IAdminRecentLandlord,
} from "./admin.interface";

const getAdminDashboardDataFromDB = async (
  _query: Record<string, unknown> = {},
): Promise<IAdminDashboardStats> => {
  // Parallel fetch for optimal high performance
  const [
    totalLandlords,
    activeSubscriptionsCount,
    trialingSubscriptionsCount,
    canceledSubscriptionsCount,
    activeSubscriptions,
    totalTenants,
    totalContractors,
    totalProperties,
    totalFlats,
    recentLandlordDocs,
  ] = await Promise.all([
    // 1. Total Landlords count
    User.countDocuments({
      role: USER_ROLES.LANDLORD,
      isDeleted: { $ne: true },
    }),

    // 2. Active Subscriptions count
    Subscription.countDocuments({
      status: "active",
      isDeleted: { $ne: true },
    }),

    // 3. Trialing Subscriptions count
    Subscription.countDocuments({
      status: "trialing",
      isDeleted: { $ne: true },
    }),

    // 4. Canceled Subscriptions count
    Subscription.countDocuments({
      status: "canceled",
      isDeleted: { $ne: true },
    }),

    // 5. Active Subscriptions with Package details for revenue computation
    Subscription.find({
      status: "active",
      isDeleted: { $ne: true },
    })
      .populate<{ packageId: IPackage }>("packageId")
      .lean(),

    // 6. Total Tenants
    User.countDocuments({
      role: USER_ROLES.TENANT,
      isDeleted: { $ne: true },
    }),

    // 7. Total Contractors
    User.countDocuments({
      role: USER_ROLES.CONTRACTOR,
      isDeleted: { $ne: true },
    }),

    // 8. Total Properties
    Property.countDocuments({
      isDeleted: { $ne: true },
    }),

    // 9. Total Flats
    Flat.countDocuments({
      isDeleted: { $ne: true },
    }),

    // 10. Recent Landlords (Last 5 registered)
    User.find({
      role: USER_ROLES.LANDLORD,
      isDeleted: { $ne: true },
    })
      .select("name email phone profileImage status createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  // Calculate Monthly Revenue (MRR) across all active subscriptions
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

  // Round to 2 decimal places or integer if whole
  monthlyRevenue = Math.round(monthlyRevenue * 100) / 100;

  const formattedMonthlyRevenue = `${ADMIN_CURRENCY_SYMBOL}${monthlyRevenue.toLocaleString(
    "en-GB",
  )}`;

  // Cards exactly matching the 3 admin dashboard metrics
  const cards: IAdminMetricCard[] = [
    {
      key: "total_landlords",
      title: "Total Landlords",
      value: totalLandlords,
      formattedValue: totalLandlords.toLocaleString("en-GB"),
      icon: "users",
    },
    {
      key: "monthly_revenue",
      title: "Monthly Revenue",
      value: monthlyRevenue,
      formattedValue: formattedMonthlyRevenue,
      currencySymbol: ADMIN_CURRENCY_SYMBOL,
      icon: "credit-card",
    },
    {
      key: "active_subscriptions",
      title: "Active Subscriptions",
      value: activeSubscriptionsCount,
      formattedValue: activeSubscriptionsCount.toLocaleString("en-GB"),
      icon: "layers",
    },
  ];

  const recentLandlords: IAdminRecentLandlord[] = recentLandlordDocs.map(
    (item: any) => ({
      _id: item._id.toString(),
      name: item.name || "N/A",
      email: item.email || "N/A",
      phone: item.phone,
      profileImage: item.profileImage,
      status: item.status || "active",
      createdAt: item.createdAt,
    }),
  );

  const now = new Date();
  const periodMonth = now.toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return {
    totalLandlords,
    monthlyRevenue,
    formattedMonthlyRevenue,
    activeSubscriptions: activeSubscriptionsCount,
    currencySymbol: ADMIN_CURRENCY_SYMBOL,
    currency: ADMIN_CURRENCY_CODE,
    cards,
    overview: {
      totalTenants,
      totalContractors,
      totalProperties,
      totalFlats,
      trialingSubscriptions: trialingSubscriptionsCount,
      canceledSubscriptions: canceledSubscriptionsCount,
    },
    recentLandlords,
    meta: {
      serverTime: now.toISOString(),
      periodMonth,
    },
  };
};

export const AdminService = {
  getAdminDashboardDataFromDB,
};
