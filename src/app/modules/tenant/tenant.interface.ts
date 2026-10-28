import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { DEPOSIT_PROTECTION_SCHEME, TENANCY_STATUS } from "./tenant.constant";

export type ITenancy = {
  _id?: Types.ObjectId | string;
  landlord: Types.ObjectId;
  property: Types.ObjectId;
  flat: Types.ObjectId;
  tenant: Types.ObjectId;
  email: string;
  rentAmount: number;
  leaseStartDate: Date;
  leaseEndDate: Date;
  securityDeposit?: number;
  advanceRent?: number;
  depositProtectionScheme?: DEPOSIT_PROTECTION_SCHEME | string;
  personalMessage?: string;
  status: TENANCY_STATUS;
  invitedAt: Date;
  isDeleted?: boolean;
  deletedAt?: Date | null;
};

export type TenancyModel = ISoftDeleteModel<ITenancy>;

export type IInviteTenantPayload = {
  property: string;
  flat: string;
  email: string;
  password?: string;
  rentAmount?: number;
  leaseStartDate: string | Date;
  leaseEndDate: string | Date;
  securityDeposit?: number;
  advanceRent?: number;
  depositProtectionScheme?: string;
  personalMessage?: string;
};

export type IUpdateTenancyPayload = {
  rentAmount?: number;
  leaseStartDate?: string | Date;
  leaseEndDate?: string | Date;
  securityDeposit?: number;
  advanceRent?: number;
  depositProtectionScheme?: string;
  personalMessage?: string;
  status?: TENANCY_STATUS;
};

// ==========================================
// Tenant Mobile Home Dashboard Interfaces
// ==========================================

export interface ITenantProfileSummary {
  id: string;
  name: string;
  firstName: string;
  email: string;
  phone?: string;
  profileImage?: string;
}

export interface IActiveTenancyCard {
  tenancyId: string;
  propertyId: string;
  flatId: string;
  flatName: string; // "Flat 2A"
  propertyName: string; // "Park Lane Mansions"
  streetAddress: string; // "12 Park Lane"
  postCode: string;
  displayAddress: string; // "12 Park Lane"
  fullAddress: string;
  rentAmount: number;
  rentAmountFormatted: string; // e.g., "$2,450"
  leaseStartDate: Date | string;
  leaseEndDate: Date | string;
  depositProtectionScheme?: string;
  landlord: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    companyName?: string;
    profileImage?: string;
  } | null;
}

export interface INextRentDueCard {
  billId?: string;
  title: string; // "Next rent due"
  amount: number; // 2450
  amountFormatted: string; // e.g., "$2,450"
  currency: string; // e.g., "$"
  dueDate: Date | string;
  dueDateFormatted: string; // "Due Jul 1, 2026"
  status: string; // "Payment due" | "Overdue" | "Paid"
  statusBadge: "payment_due" | "overdue" | "paid";
  isOverdue: boolean;
  isPaid: boolean;
  lastPaidText?: string | null; // e.g., "Last paid: $2,450 on May 2, 2026"
  lastPaidAmount?: number | null;
  lastPaidDate?: Date | string | null;
  actionText: string; // "Pay Rent"
  canPay: boolean;
}

export interface IPendingChargeItem {
  id: string;
  billId: string;
  title: string; // "Kitchen sink repair share"
  chargeType: string; // "repair_charge"
  category: string;
  amount: number; // 85
  amountFormatted: string; // e.g., "$85"
  dueDate: Date | string;
  dueDateFormatted: string; // "Due Jul 20, 2026"
  status: string; // "pending" | "due" | "overdue"
  statusBadge: string;
  invoiceNumber?: string;
  icon: string; // "repair" | "wrench" | "utility" | "service"
  actionText: string; // "Pay"
  canPay: boolean;
}

export interface IPendingChargesSection {
  totalCount: number;
  totalAmount: number;
  totalAmountFormatted: string;
  items: IPendingChargeItem[];
}

export interface ITenantQuickAction {
  key: "report_issue" | "message_landlord" | "payments" | "announcements";
  title: string;
  badgeCount?: number | null;
}

export interface IBuildingAnnouncementBanner {
  id: string;
  badgeLabel: string; // "BUILDING ANNOUNCEMENT"
  title: string; // "Annual Boiler Service Next Week"
  message: string; // "Heating Co. will access units on Mon 28 Jul, 9-11am. Please ensure someo..."
  fullContent: string;
  image?: string | null;
  createdAt: Date | string;
  dateFormatted?: string;
  landlordName?: string;
}

export interface ITenantHomeDashboardData {
  tenant: ITenantProfileSummary;
  unreadNotificationsCount: number;
  activeTenancy: IActiveTenancyCard | null;
  nextRentDue: INextRentDueCard | null;
  pendingCharges: IPendingChargesSection;
  quickActions: ITenantQuickAction[];
  latestAnnouncement: IBuildingAnnouncementBanner | null;
  meta: {
    serverTime: string;
  };
}
