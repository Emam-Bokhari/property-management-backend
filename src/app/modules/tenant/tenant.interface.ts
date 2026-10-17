import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { DEPOSIT_PROTECTION_SCHEME, TENANCY_STATUS } from "./tenant.constant";

export type ITenancy = {
  _id?: Types.ObjectId | string;
  landlord: Types.ObjectId;
  property: Types.ObjectId;
  flat: Types.ObjectId;
  tenant: Types.ObjectId;
  email: string;
  rentAmount: number;
  leaseStartDate: Date;
  leaseEndDate: Date;
  securityDeposit?: number;
  advanceRent?: number;
  depositProtectionScheme?: DEPOSIT_PROTECTION_SCHEME | string;
  personalMessage?: string;
  status: TENANCY_STATUS;
  invitedAt: Date;
  isDeleted?: boolean;
  deletedAt?: Date | null;
};

export type TenancyModel = ISoftDeleteModel<ITenancy>;

export type IInviteTenantPayload = {
  property: string;
  flat: string;
  email: string;
  password?: string;
  rentAmount?: number;
  leaseStartDate: string | Date;
  leaseEndDate: string | Date;
  securityDeposit?: number;
  advanceRent?: number;
  depositProtectionScheme?: string;
  personalMessage?: string;
};

export type IUpdateTenancyPayload = {
  rentAmount?: number;
  leaseStartDate?: string | Date;
  leaseEndDate?: string | Date;
  securityDeposit?: number;
  advanceRent?: number;
  depositProtectionScheme?: string;
  personalMessage?: string;
  status?: TENANCY_STATUS;
};
