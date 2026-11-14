import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { CONTRACTOR_RELATION_STATUS } from "./contractor.constant";

export type IContractor = {
  _id?: Types.ObjectId | string;
  landlord: Types.ObjectId;
  contractor: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  trades?: Types.ObjectId[];
  personalMessage?: string;
  status: CONTRACTOR_RELATION_STATUS;
  invitedAt: Date;
  rating?: number;
  totalReviews?: number;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ContractorModel = ISoftDeleteModel<IContractor>;

export type IInviteContractorPayload = {
  name?: string;
  email: string;
  password?: string;
  phone?: string;
  trades?: Types.ObjectId[] | string[];
  companyName?: string;
  personalMessage?: string;
};

export type IUpdateContractorPayload = {
  name?: string;
  phone?: string;
  companyName?: string;
  trades?: Types.ObjectId[] | string[];
  personalMessage?: string;
  status?: CONTRACTOR_RELATION_STATUS;
};

export interface IContractorProfileSummary {
  id: string;
  name: string;
  firstName: string;
  email: string;
  phone?: string;
  profileImage?: string;
  companyName?: string;
  primaryTrade?: string;
}

export interface INextScheduleCard {
  id: string;
  jobId: string;
  title: string;
  time: string;
  badgeDate: string;
  scheduledDate: Date | string;
  scheduledTime: string;
  isToday: boolean;
  location: string;
  streetAddress?: string;
  flatUnit?: string;
  postCode?: string;
  status: string;
  contractorStatus?: string;
}

export interface IContractorMetricCard {
  key: "pending_review" | "assigned_jobs" | "in_progress" | "completed";
  title: string;
  count: number;
  subtitle: string;
}

export interface IContractorOverviewStats {
  pendingReviewCount: number;
  assignedJobsCount: number;
  inProgressCount: number;
  completedThisMonthCount: number;
  totalCompletedCount: number;
  totalActiveJobs: number;
}

export interface IUpcomingJobItem {
  id: string;
  jobId: string;
  title: string;
  location: string;
  propertyId?: string;
  propertyName?: string;
  streetAddress?: string;
  flatUnit?: string;
  postCode?: string;
  scheduledDate?: Date | string;
  scheduledTime?: string;
  dateFormatted: string;
  status: string;
  statusBadge: string;
  contractorStatus?: string;
  priority?: string;
  image?: string | null;
}

export interface IContractorHomeDashboardData {
  contractor: IContractorProfileSummary;
  unreadNotificationsCount: number;
  nextSchedule: INextScheduleCard | null;
  statsCards: IContractorMetricCard[];
  overview: IContractorOverviewStats;
  upcomingJobs: {
    totalCount: number;
    items: IUpcomingJobItem[];
  };
}

export interface IContractorAssignedPropertyItem {
  _id: Types.ObjectId | string;
  id: string;
  propertyName: string;
  streetAddress: string;
  postCode: string;
  isHmo: boolean;
  unitCount: number;
  unitLabel: string;
  subtitle: string;
  propertyType: Record<string, unknown> | null;
  propertyPhotos: string[];
  floorsInBuilding: string;
  authorizationStatus: "authorized";
  statusBadge: string;
  landlord: Record<string, unknown> | null;
  activeJobsCount: number;
  totalJobsCount: number;
}

export interface IContractorEarningItem {
  _id: Types.ObjectId | string;
  id: string;
  jobId: string;
  title: string;
  issueTitle: string;
  amount: number;
  currency: string;
  currencySymbol: string;
  formattedAmount: string;
  type: "payout";
  direction: "credit";
  paymentStatus: string;
  invoiceStatus: string | null;
  paidBy: string | null;
  transactionId: string | null;
  paidAt: Date | string;
  date: Date | string;
  dateFormatted: string;
  completedAt: Date | string | null;
  property: Record<string, unknown> | null;
  flat: Record<string, unknown> | null;
  landlord: Record<string, unknown> | null;
}

export interface IContractorEarningsSummary {
  totalEarnings: number;
  formattedTotalEarnings: string;
  thisMonthEarnings: number;
  formattedThisMonthEarnings: string;
  pendingPayouts: number;
  formattedPendingPayouts: string;
  totalPaidJobs: number;
  currency: string;
  currencySymbol: string;
}

export interface IContractorEmergencyContactProperty {
  id: string;
  propertyName: string;
  streetAddress: string;
  postCode: string;
  displayAddress: string;
  propertyPhotos?: string[];
  isHmo?: boolean;
}

export interface IContractorLandlordEmergencyContact {
  landlordId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  emergencyContact: string;
  emergencyPhone: string;
  companyName?: string;
  profileImage?: string;
  address?: string;
  connectionStatus: string;
  connectedAt?: Date | string | null;
  totalProperties: number;
  properties: IContractorEmergencyContactProperty[];
}

