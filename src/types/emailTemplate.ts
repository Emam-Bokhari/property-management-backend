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
  currencySymbol?: string;
  personalMessage?: string;
  loginUrl?: string;
};

export type IContractorInvitationEmail = {
  email: string;
  password?: string;
  contractorName?: string;
  landlordName?: string;
  companyName?: string;
  trades?: string[];
  propertiesScope?: string;
  personalMessage?: string;
  loginUrl?: string;
};
