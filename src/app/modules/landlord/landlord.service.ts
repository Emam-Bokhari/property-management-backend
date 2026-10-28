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
import { FinanceBill } from "../finance/finance.model";
import { BILL_STATUS } from "../finance/finance.constant";
import { REMINDER_STATUS } from "../smartReminder/smartReminder.constant";
import { MAINTENANCE_STATUS } from "../maintenance/maintenance.constant";
import {
  formatCurrency,
  getCurrencySymbol,
} from "../../../helpers/currencyHelper";
import {
  ILandlordHomeDashboardData,
  ILandlordMonthlyIncomeCard,
  ILandlordFinancialOverview,
  INeedsAttentionOverdueRent,
  INeedsAttentionOverdueRentItem,
  INeedsAttentionTenantReports,
  INeedsAttentionTenantReportItem,
  ISmartReminderDashboardItem,
} from "./landlord.interface";

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
    User.findById(landlordId)
      .select("name email phone profileImage companyName role")
      .lean(),
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
      .select(
        "jobId issueTitle priority status locationInProperty reportedAt createdAt",
      )
      .populate("property", "propertyName streetAddress postCode")
      .populate("flat", "unitName")
      .populate("tenant", "name email phone profileImage")
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

  const now = new Date();

  // Query overdue rent bills (after syncMonthlyRentBills in financeOverview)
  const overdueBills = await FinanceBill.find({
    landlord: landlordObjectId,
    status: { $nin: [BILL_STATUS.PAID, BILL_STATUS.CANCELLED] },
    dueDate: { $lt: now },
    isDeleted: { $ne: true },
  })
    .populate("tenant", "name email phone profileImage")
    .populate("property", "propertyName streetAddress postCode")
    .populate("flat", "unitName floor")
    .sort({ dueDate: 1 })
    .lean();

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
    currency: getCurrencySymbol(),
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
  const overdueAmount =
    overdueBills.reduce(
      (sum, bill) => sum + (Number(bill.amount) || 0),
      0,
    ) ||
    allFinances.overdue ||
    0;
  const expectedTotal =
    allFinances.thisMonth.expected ||
    paidAmount + pendingAmount + overdueAmount;
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
  const overdueRentCount = overdueBills.length || allFinances.overdueCount || 0;
  const overdueRentItems: INeedsAttentionOverdueRentItem[] = overdueBills.map(
    (bill: any) => {
      const dueDate = new Date(bill.dueDate);
      const diffTime = now.getTime() - dueDate.getTime();
      const daysOverdue = Math.max(
        0,
        Math.floor(diffTime / (1000 * 60 * 60 * 24)),
      );

      let statusText = "Overdue";
      if (daysOverdue === 0) {
        statusText = "Due today";
      } else if (daysOverdue === 1) {
        statusText = "1 day overdue";
      } else {
        statusText = `${daysOverdue} days overdue`;
      }

      const prop = bill.property;
      const flat = bill.flat;
      const tenant = bill.tenant;

      const propertyAddress =
        prop?.streetAddress || prop?.propertyName || "Property";
      const unitPart = flat?.unitName ? `${flat.unitName} · ` : "";
      const subtitle = `${unitPart}${propertyAddress}`;

      return {
        id: bill._id.toString(),
        invoiceNumber: bill.invoiceNumber,
        billType: bill.billType,
        billCategory: bill.billCategory,
        title: bill.description || `${bill.periodMonth || ""} Rent`.trim(),
        subtitle,
        amount: bill.amount,
        formattedAmount: formatCurrency(bill.amount),
        dueDate: bill.dueDate,
        daysOverdue,
        statusText,
        tenant: tenant
          ? {
              id: tenant._id?.toString(),
              name: tenant.name,
              email: tenant.email,
              phone: tenant.phone,
              profileImage: tenant.profileImage,
            }
          : undefined,
        property: prop
          ? {
              id: prop._id?.toString(),
              propertyName: prop.propertyName,
              streetAddress: prop.streetAddress,
              postCode: prop.postCode,
            }
          : undefined,
        flat: flat
          ? {
              id: flat._id?.toString(),
              unitName: flat.unitName,
              floor: flat.floor,
            }
          : undefined,
      };
    },
  );

  const overdueRentItem: INeedsAttentionOverdueRent = {
    type: "overdue_rent",
    count: overdueRentCount,
    title: `${overdueRentCount} overdue rent${overdueRentCount === 1 ? "" : "s"}`,
    subtitle:
      overdueRentCount > 0
        ? `${formatCurrency(overdueAmount)} to collect`
        : "All rents are up to date",
    amount: overdueAmount,
    formattedAmount: formatCurrency(overdueAmount),
    actionRoute: "/finance?tab=outstanding&status=overdue",
    items: overdueRentItems,
  };

  // 3.2 Tenant reports needing contractor
  const reportsCount = pendingMaintenanceReports.length;
  const sampleTitles = pendingMaintenanceReports
    .map((r: any) => r.issueTitle)
    .filter(Boolean)
    .slice(0, 2);

  let reportsSubtitle = "All reports currently assigned";
  if (sampleTitles.length > 0) {
    reportsSubtitle =
      sampleTitles.join(", ") + (reportsCount > 2 ? "..." : "");
  }

  const tenantReportItems: INeedsAttentionTenantReportItem[] =
    pendingMaintenanceReports.map((r: any) => {
      const prop = r.property;
      const flat = r.flat;
      const tenant = r.tenant;

      const propertyAddress =
        prop?.streetAddress || prop?.propertyName || "Property";
      const unitPart = flat?.unitName ? `${flat.unitName} · ` : "";
      const subtitle = `${unitPart}${propertyAddress}`;

      return {
        id: r._id.toString(),
        jobId: r.jobId,
        title: r.issueTitle,
        subtitle,
        priority: r.priority,
        status: r.status,
        date: r.createdAt || r.reportedAt,
        tenant: tenant
          ? {
              id: tenant._id?.toString(),
              name: tenant.name,
              email: tenant.email,
              phone: tenant.phone,
              profileImage: tenant.profileImage,
            }
          : undefined,
        property: prop
          ? {
              id: prop._id?.toString(),
              propertyName: prop.propertyName,
              streetAddress: prop.streetAddress,
              postCode: prop.postCode,
            }
          : undefined,
        flat: flat
          ? {
              id: flat._id?.toString(),
              unitName: flat.unitName,
            }
          : undefined,
      };
    });

  const tenantReportsItem: INeedsAttentionTenantReports = {
    type: "tenant_reports",
    count: reportsCount,
    title: `${reportsCount} tenant report${reportsCount === 1 ? "" : "s"} need contractor`,
    subtitle: reportsSubtitle,
    actionRoute: "/maintenance?tab=reported&status=pending",
    items: tenantReportItems,
  };

  const needsAttention = {
    totalCount: overdueRentCount + reportsCount,
    overdueRent: overdueRentItem,
    tenantReports: tenantReportsItem,
  };

  // 4. Smart Reminders (Urgent expiry & overdue reminders)
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
    const propertyAddress =
      prop?.streetAddress || prop?.propertyName || "Property";
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
  const dueSoonCount = reminderItems.filter(
    (i) => i.urgencyLevel === "due_soon",
  ).length;



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
    needsAttention,
    smartReminders: {
      items: reminderItems,
    },
  };
};

export const LandlordService = {
  getLandlordHomeDashboardFromDB,
};
