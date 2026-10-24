import { USER_ROLES } from "../../../enums/user";
import { User } from "../user/user.model";
import { Subscription } from "../subscription/subscription.model";
import { IPackage } from "../package/package.interface";
import { IAdminDashboardStats } from "./admin.interface";

const getAdminDashboardDataFromDB = async (): Promise<IAdminDashboardStats> => {
  const [totalLandlords, activeSubscriptions] = await Promise.all([
    // 1. Total Landlords
    User.countDocuments({
      role: USER_ROLES.LANDLORD,
      isDeleted: { $ne: true },
    }),

    // 2. Active Subscriptions with Package details
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

export const AdminService = {
  getAdminDashboardDataFromDB,
};
