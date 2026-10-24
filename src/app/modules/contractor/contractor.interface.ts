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
