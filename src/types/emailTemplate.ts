export type ICreateAccount = {
  name: string;
  email: string;
  otp: number;
};

export type IResetPassword = {
  email: string;
  otp: number;
};

export type ITenantInvitationEmail = {
  email: string;
  password?: string;
  tenantName?: string;
  landlordName?: string;
  propertyName: string;
  propertyAddress?: string;
  flatUnitName: string;
  rentAmount: number;
  leaseStartDate: string;
  leaseEndDate: string;
  securityDeposit?: number;
  advanceRent?: number;
  depositProtectionScheme?: string;
  personalMessage?: string;
  loginUrl?: string;
};
