export enum TENANCY_STATUS {
  PENDING = "pending",
  ACTIVE = "active",
  EXPIRED = "expired",
  TERMINATED = "terminated",
}

export enum DEPOSIT_PROTECTION_SCHEME {
  MY_DEPOSITS = "my_deposits",
  SECURITY_DEPOSIT = "security_deposit",
}

export const tenantSearchableFields = [
  "email",
  "depositProtectionScheme",
  "status",
];
