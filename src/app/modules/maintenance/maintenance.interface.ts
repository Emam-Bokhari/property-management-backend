import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import {
    CONTRACTOR_STATUS,
    MAINTENANCE_PAID_BY,
    MAINTENANCE_PRIORITY,
    MAINTENANCE_REQUESTER,
    MAINTENANCE_STATUS,
} from "./maintenance.constant";

export type TMaintenanceSchedule = {
    visitDate: Date | string;
    visitTime?: string;
    notes?: string;
};

export type TMaintenance = {
    jobId?: string;
    issueTitle: string;
    issueType: Types.ObjectId;
    priority: MAINTENANCE_PRIORITY;
    description: string;
    attachments?: string;
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
    assignedDate?: Date | string;
    scheduledDate?: Date | string;
    scheduledTime?: string;
    scheduleNotes?: string;

    // Financial & Billing
    paidBy?: MAINTENANCE_PAID_BY;
    invoiceAmounts?: number;
    notes?: string;
    certificates?: string[];

    // Resolution & Completion
    completionPhotos?: string[];
    completionNotes?: string;
    completedAt?: Date | string;

    // Cancellation
    cancellationReason?: string;
    cancelledBy?: Types.ObjectId;
    cancelledAt?: Date | string;
};

export type MaintenanceModel = ISoftDeleteModel<TMaintenance>;
