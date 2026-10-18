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
  trades?: string[];
  primaryTrade?: string;
  properties?: Types.ObjectId[];
  allProperties: boolean;
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
  trade?: string;
  trades?: string[] | string;
  companyName?: string;
  properties?: string[];
  allProperties?: boolean;
  personalMessage?: string;
};

export type IUpdateContractorPayload = {
  name?: string;
  phone?: string;
  companyName?: string;
  trade?: string;
  trades?: string[] | string;
  properties?: string[];
  allProperties?: boolean;
  personalMessage?: string;
  status?: CONTRACTOR_RELATION_STATUS;
};
