import { JwtPayload } from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { User } from "../user/user.model";
import { Property } from "../property/property.model";
import { Tenancy } from "../tenant/tenant.model";
import { Maintenance } from "../maintenance/maintenance.model";
import { SmartReminder } from "../smartReminder/smartReminder.model";
import { Notification } from "../notification/notification.model";
import { FinanceService } from "../finance/finance.service";
import { REMINDER_STATUS } from "../smartReminder/smartReminder.constant";
import { MAINTENANCE_STATUS } from "../maintenance/maintenance.constant";
import {
  LANDLORD_CURRENCY_SYMBOL,
  DEFAULT_LANDLORD_QUICK_ACTIONS,
} from "./landlord.constant";
import {
  ILandlordHomeDashboardData,
  ILandlordMonthlyIncomeCard,
  ILandlordFinancialOverview,
  INeedsAttentionItem,
  ISmartReminderDashboardItem,
} from "./landlord.interface";

// Helper to format currency numbers like £8,350
const formatCurrency = (amount: number, symbol = LANDLORD_CURRENCY_SYMBOL): string => {
  return `${symbol}${Number(amount || 0).toLocaleString("en-GB")}`;
};

const getLandlordHomeDashboardFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
): Promise<ILandlordHomeDashboardData> => {
  const landlordId = authUser.userId || authUser.id;

  if (!mongoose.Types.ObjectId.isValid(landlordId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid landlord ID");
  }

  const landlordObjectId = new Types.ObjectId(landlordId);

  // Parallel fetch for ultra-fast performance
  const [
    landlordUser,
    totalPropertiesCount,
    activeTenancies,
    financeOverview,
    pendingMaintenanceReports,
    dbSmartReminders,
    unreadNotificationsCount,
  ] = await Promise.all([
    User.findById(landlordId).select(
      "name email phone profileImage companyName role",
    ).lean(),
    Property.countDocuments({
      landlord: landlordObjectId,
      isDeleted: { $ne: true },
    }),
    Tenancy.find({
      landlord: landlordObjectId,
      status: "active",
      isDeleted: { $ne: true },
    })
      .populate("property", "propertyName streetAddress postCode")
      .populate("flat", "unitName rentPerMonth")
      .populate("tenant", "name email phone profileImage")
      .lean(),
    FinanceService.getLandlordOverviewFromDB(authUser, query),
    Maintenance.find({
      landlord: landlordObjectId,
      isDeleted: { $ne: true },
      status: {
        $in: [
          MAINTENANCE_STATUS.PENDING,
          MAINTENANCE_STATUS.ACCEPTED,
          MAINTENANCE_STATUS.WAITING_APPROVAL,
        ],
      },
      contractor: { $in: [null, undefined] },
    })
      .select("issueTitle priority status locationInProperty reportedAt createdAt")
      .populate("property", "propertyName streetAddress")
      .populate("flat", "unitName")
      .sort({ createdAt: -1 })
      .lean(),
    SmartReminder.find({
      landlord: landlordObjectId,
      status: { $ne: REMINDER_STATUS.COMPLETED },
      isDeleted: { $ne: true },
    })
      .populate("property", "propertyName streetAddress postCode")
      .sort({ dueDate: 1 })
      .limit(10)
      .lean(),
    Notification.countDocuments({
      receiver: landlordObjectId,
      read: false,
    }),
  ]);

  if (!landlordUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Landlord account not found");
  }

  // 1. Calculate Monthly Income & Portfolio stats (Top Blue Card)
  const totalMonthlyIncome = activeTenancies.reduce((sum, tenancy) => {
    return sum + (Number(tenancy.rentAmount) || 0);
  }, 0);

  const occupiedPropertyIdSet = new Set<string>();
  const uniqueTenantIdSet = new Set<string>();

  activeTenancies.forEach((tenancy: any) => {
    const propId = tenancy.property?._id || tenancy.property;
    if (propId) {
      occupiedPropertyIdSet.add(propId.toString());
    }
    const tenantId = tenancy.tenant?._id || tenancy.tenant;
    if (tenantId) {
      uniqueTenantIdSet.add(tenantId.toString());
    }
  });

  const occupiedPropertiesCount = occupiedPropertyIdSet.size;
  const totalTenantsCount = uniqueTenantIdSet.size;

  const occupancyRate =
    totalPropertiesCount > 0
      ? Math.round((occupiedPropertiesCount / totalPropertiesCount) * 100)
      : 0;

  const incomeOverview: ILandlordMonthlyIncomeCard = {
    monthlyIncome: totalMonthlyIncome,
    currency: LANDLORD_CURRENCY_SYMBOL,
    formattedMonthlyIncome: formatCurrency(totalMonthlyIncome),
    occupiedPropertiesCount,
    occupiedPropertiesText: `From ${occupiedPropertiesCount} occupied ${
      occupiedPropertiesCount === 1 ? "property" : "properties"
    }`,
    totalPropertiesCount,
    totalTenantsCount,
    occupancyRate,
    formattedOccupancyRate: `${occupancyRate}%`,
  };

  // 2. Financial Overview (Collected Donut Chart, Paid, Pending, Overdue)
  const allFinances = financeOverview.all;
  const paidAmount = allFinances.thisMonth.collected || 0;
  const pendingAmount = allFinances.dueSoon || 0;
  const overdueAmount = allFinances.overdue || 0;
  const expectedTotal = allFinances.thisMonth.expected || paidAmount + pendingAmount + overdueAmount;
  const collectedPercentage = allFinances.thisMonth.percentage || 0;

  const financialOverviewResult: ILandlordFinancialOverview = {
    collectedPercentage,
    formattedCollectedPercentage: `${collectedPercentage}%`,
    paidAmount,
    formattedPaidAmount: formatCurrency(paidAmount),
    pendingAmount,
    formattedPendingAmount: formatCurrency(pendingAmount),
    overdueAmount,
    formattedOverdueAmount: formatCurrency(overdueAmount),
    expectedTotal,
    formattedExpectedTotal: formatCurrency(expectedTotal),
    period: financeOverview.period,
  };

  // 3. Needs Attention Section
  // 3.1 Overdue Rent
  const overdueRentCount = allFinances.overdueCount || 0;
  const overdueRentItem: INeedsAttentionItem = {
    type: "overdue_rent",
    count: overdueRentCount,
    title: `${overdueRentCount} overdue rent`,
    subtitle: `${formatCurrency(overdueAmount)} to collect`,
    amount: overdueAmount,
    formattedAmount: formatCurrency(overdueAmount),
    actionRoute: "/finance?tab=outstanding&status=overdue",
  };

  // 3.2 Tenant reports needing contractor
  const reportsCount = pendingMaintenanceReports.length;
  const sampleTitles = pendingMaintenanceReports
    .map((r) => r.issueTitle)
    .filter(Boolean)
    .slice(0, 2);

  let reportsSubtitle = "All reports currently assigned";
  if (sampleTitles.length > 0) {
    reportsSubtitle =
      sampleTitles.join(", ") + (reportsCount > 2 ? "..." : "");
  }

  const tenantReportsItem: INeedsAttentionItem = {
    type: "tenant_reports",
    count: reportsCount,
    title: `${reportsCount} tenant report${reportsCount === 1 ? "" : "s"} need contractor`,
    subtitle: reportsSubtitle,
    actionRoute: "/maintenance?tab=reported&status=pending",
    items: pendingMaintenanceReports.slice(0, 5).map((r: any) => ({
      id: r._id.toString(),
      title: r.issueTitle,
      subtitle: r.property?.streetAddress || r.property?.propertyName || "",
      priority: r.priority,
      date: r.createdAt || r.reportedAt,
    })),
  };

  const needsAttention = {
    totalCount: overdueRentCount + reportsCount,
    overdueRent: overdueRentItem,
    tenantReports: tenantReportsItem,
    items: [overdueRentItem, tenantReportsItem],
  };

  // 4. Smart Reminders (Urgent expiry & overdue reminders)
  const now = new Date();
  const reminderItems: ISmartReminderDashboardItem[] = [];

  dbSmartReminders.forEach((r: any) => {
    const dueDate = new Date(r.dueDate);
    const diffTime = now.getTime() - dueDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const isOverdue = diffDays > 0;

    let statusText = "";
    let urgencyLevel: "overdue" | "due_soon" | "upcoming" = "upcoming";

    if (isOverdue) {
      statusText = `${diffDays} days overdue`;
      urgencyLevel = "overdue";
    } else if (diffDays === 0) {
      statusText = "Due today";
      urgencyLevel = "due_soon";
    } else {
      const remaining = Math.abs(diffDays);
      statusText = `Due in ${remaining} ${remaining === 1 ? "day" : "days"}`;
      urgencyLevel = remaining <= 30 ? "due_soon" : "upcoming";
    }

    const prop = r.property;
    const propertyAddress = prop?.streetAddress || prop?.propertyName || "Property";
    const displaySubtitle = `${propertyAddress} · ${statusText}`;

    reminderItems.push({
      id: r._id.toString(),
      title: r.title,
      propertyId: prop?._id?.toString(),
      propertyName: prop?.propertyName,
      streetAddress: prop?.streetAddress,
      postCode: prop?.postCode,
      dueDate: r.dueDate,
      status: r.status,
      isOverdue,
      daysLate: diffDays > 0 ? diffDays : 0,
      daysRemaining: diffDays < 0 ? Math.abs(diffDays) : 0,
      statusText,
      displaySubtitle,
      urgencyLevel,
    });
  });

  const overdueCount = reminderItems.filter((i) => i.isOverdue).length;
  const dueSoonCount = reminderItems.filter((i) => i.urgencyLevel === "due_soon").length;

  // 5. Quick Actions with dynamic badge counts
  const quickActions = DEFAULT_LANDLORD_QUICK_ACTIONS.map((action) => {
    let badgeCount = 0;
    if (action.id === "maintenance") {
      badgeCount = reportsCount;
    } else if (action.id === "finance") {
      badgeCount = overdueRentCount;
    }
    return {
      ...action,
      badgeCount,
    };
  });

  return {
    landlord: {
      id: landlordUser._id.toString(),
      name: landlordUser.name,
      email: landlordUser.email,
      phone: landlordUser.phone,
      profileImage: landlordUser.profileImage,
      companyName: (landlordUser as any).companyName,
    },
    unreadNotificationsCount,
    incomeOverview,
    financialOverview: financialOverviewResult,
    quickActions,
    needsAttention,
    smartReminders: {
      totalCount: reminderItems.length,
      overdueCount,
      dueSoonCount,
      items: reminderItems,
    },
  };
};

export const LandlordService = {
  getLandlordHomeDashboardFromDB,
};
