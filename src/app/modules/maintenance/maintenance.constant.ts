export enum MAINTENANCE_STATUS {
  PENDING = "pending",
  ACCEPTED = "accepted",
  ASSIGNED = "assigned",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  REJECTED = "rejected",
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

export enum CONTRACTOR_STATUS {
  PENDING = "pending",
  ACCEPTED = "accepted",
  DECLINED = "declined",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
}

export enum MAINTENANCE_CATEGORY {
  PLUMBING = "plumbing",
  ELECTRICAL = "electrical",
  HEATING = "heating",
  APPLIANCE = "appliance",
  ROOFING = "roofing",
  CARPENTRY = "carpentry",
  PAINTING = "painting",
  SECURITY = "security",
  PEST_CONTROL = "pest_control",
  OTHER = "other",
}
