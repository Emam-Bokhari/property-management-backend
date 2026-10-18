export enum MAINTENANCE_STATUS {
  PENDING = "pending",
  ACCEPTED = "accepted",
  ASSIGNED = "assigned",
  SCHEDULED = "scheduled",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  REJECTED = "rejected",
  WAITING_APPROVAL = "waiting_approval",
  INVOICE_REJECTED = "invoice_rejected",
}

export enum MAINTENANCE_PRIORITY {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent",
}

export enum MAINTENANCE_REQUESTER {
  TENANT = "tenant",
  LANDLORD = "landlord",
}

export enum MAINTENANCE_PAID_BY {
  LANDLORD = "landlord",
  TENANT = "tenant",
  SHARED = "shared",
}

export enum MAINTENANCE_LOCATION_TYPE {
  UNIT = "unit",
  COMMUNAL = "communal",
}

export enum CONTRACTOR_STATUS {
  PENDING = "pending",
  ACCEPTED = "accepted",
  SCHEDULED = "scheduled",
  DECLINED = "declined",
  IN_PROGRESS = "in_progress",
  INVOICE_SUBMITTED = "invoice_submitted",
  INVOICE_REJECTED = "invoice_rejected",
  COMPLETED = "completed",
}

export enum PAYMENT_STATUS {
  UNPAID = "unpaid",
  PAID = "paid",
  FAILED = "failed",
}

export const maintenanceSearchableFields = [
  "issueTitle",
  "description",
  "jobId",
  "locationInProperty",
  "scheduleNotes",
  "invoiceNotes",
  "notes",
];

export const maintenanceFilterableFields = [
  "searchTerm",
  "property",
  "flat",
  "landlord",
  "tenant",
  "contractor",
  "status",
  "priority",
  "requesterRole",
  "tab",
  "locationType",
  "issueType",
  "paymentStatus",
];
