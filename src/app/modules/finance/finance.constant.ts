export enum CHARGE_TYPE {
  RENT = "rent",
  UTILITY_CHARGE = "utility_charge",
  REPAIR_CHARGE = "repair_charge",
  PENALTY = "penalty",
  SERVICE_CHARGE = "service_charge",
  CUSTOM_CHARGE = "custom_charge",
}

export enum WHO_IS_BILLED {
  LEAD_TENANT = "lead_tenant",
  SPECIFIC_TENANT = "specific_tenant",
  ALL_TENANTS_ON_UNIT = "all_tenants_on_unit",
}

export enum PAYMENT_METHOD {
  BANK_TRANSFER = "bank_transfer",
  CASH = "cash",
  CHEQUE = "cheque",
  DIRECT_DEBIT = "direct_debit",
  STRIPE = "stripe",
  OTHER = "other",
}

export enum BILL_STATUS {
  PENDING = "pending",
  DUE = "due",
  OVERDUE = "overdue",
  PAID = "paid",
  CANCELLED = "cancelled",
}

export enum BILL_CATEGORY {
  RENT = "rent",
  CHARGES = "charges",
}

export const financeSearchableFields = [
  "invoiceNumber",
  "description",
  "periodMonth",
  "referenceNumber",
  "billType",
];
