import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import {
  CONTRACTOR_STATUS,
  MAINTENANCE_LOCATION_TYPE,
  MAINTENANCE_PAID_BY,
  MAINTENANCE_PRIORITY,
  MAINTENANCE_REQUESTER,
  MAINTENANCE_STATUS,
  PAYMENT_STATUS,
} from "./maintenance.constant";

export type TMaintenanceSchedule = {
  visitDate: Date | string;
  visitTime?: string;
  notes?: string;
};

export type TMaintenance = {
  _id?: Types.ObjectId | string;
  jobId?: string;
  issueTitle: string;
  issueType: Types.ObjectId;
  priority: MAINTENANCE_PRIORITY;
  description: string;
  attachments?: string[];

  // Location details
  locationType: MAINTENANCE_LOCATION_TYPE;
  communalArea?: Types.ObjectId | string;
  locationInProperty?: string;

  // Property & Unit References
  property: Types.ObjectId;
  flat?: Types.ObjectId;

  // Request Creator (Tenant or Landlord)
  requestedBy: Types.ObjectId;
  requesterRole: MAINTENANCE_REQUESTER;

  // Associated Stakeholders
  landlord: Types.ObjectId;
  tenant?: Types.ObjectId;

  // Status & Progress Tracking
  status: MAINTENANCE_STATUS;

  // Contractor Assignment & Scheduling
  contractor?: Types.ObjectId;
  contractorStatus?: CONTRACTOR_STATUS;
  reportedAt?: Date | string;
  assignedDate?: Date | string;
  scheduledDate?: Date | string;
  scheduledTime?: string;
  scheduleNotes?: string;
  startedAt?: Date | string;

  // Financial & Billing
  paidBy?: MAINTENANCE_PAID_BY;
  invoiceAmount?: number;
  invoiceAmounts?: number;
  invoiceNotes?: string;
  notes?: string;
  certificates?: string[];

  // Payment Tracking
  paymentStatus?: PAYMENT_STATUS;
  paidAt?: Date | string;
  stripeSessionId?: string;
  transactionId?: string;
  invoiceStatus?: "submitted" | "approved" | "rejected";
  rejectionReason?: string;
  rejectedAt?: Date | string;

  // Resolution & Completion
  completionPhotos?: string[];
  completionNotes?: string;
  completedAt?: Date | string;

  // Cancellation
  cancellationReason?: string;
  cancelledBy?: Types.ObjectId;
  cancelledAt?: Date | string;

  isDeleted?: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type MaintenanceModel = ISoftDeleteModel<TMaintenance>;

export type TCreateMaintenancePayload = {
  issueTitle: string;
  issueType: string;
  priority?: MAINTENANCE_PRIORITY;
  description: string;
  attachments?: string[];
  locationType?: MAINTENANCE_LOCATION_TYPE;
  communalArea?: string;
  locationInProperty?: string;
  property?: string;
  flat?: string;
  landlord?: string;
  tenant?: string;
  paidBy?: MAINTENANCE_PAID_BY;
};

export type TAssignContractorPayload = {
  contractor: string;
  notes?: string;
};

export type TScheduleVisitPayload = {
  visitDate: string | Date;
  visitTime: string;
  notes?: string;
};

export type TSubmitInvoicePayload = {
  invoiceAmount: number;
  invoiceNotes?: string;
  notes?: string;
  certificates?: string[];
  completionPhotos?: string[];
  completionNotes?: string;
};

export type TPayMaintenancePayload = {
  successUrl?: string;
  cancelUrl?: string;
  notes?: string;
};

export type TRejectInvoicePayload = {
  rejectionReason: string;
};

export type TCancelMaintenancePayload = {
  cancellationReason?: string;
};
