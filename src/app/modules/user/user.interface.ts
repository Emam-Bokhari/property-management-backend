import { Model } from "mongoose";
import { GENDER, STATUS, USER_ROLES } from "../../../enums/user";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { PRIMARY_TRADE } from "./user.constant";

export type TCertificate = {
  certificateName?: string;
  certificateAttachment?: string;
};

export type IUser = {
  name: string;
  role: USER_ROLES;
  email: string;
  profileImage?: string;
  password?: string;
  verified: boolean;
  phone?: string;
  countryCode?: string;
  status: STATUS;
  firebaseUid?: string;
  gender?: GENDER;
  userName?: string;
  deviceToken?: string;
  address?: string;
  timezone?: string;
  dateOfBirth?: string | Date;
  nidNumber?: string | number;
  nidPhoto?: string;
  emergencyPhone?: string;
  homeAddress?: string;
  certificates?: TCertificate[];
  companyName?: string;
  primaryTrade?: PRIMARY_TRADE;
  authentication?: {
    isResetPassword?: boolean;
    oneTimeCode?: number | null;
    expireAt?: Date | null;
    authType?: string | null;
  };
  isDeleted?: boolean;
};

export type UserModal = {
  isExistUserById(id: string): Promise<IUser | null>;
  isExistUserByEmail(email: string): Promise<IUser | null>;
  isMatchPassword(password: string, hashPassword: string): Promise<boolean>;
} & Model<IUser>;

export type IUserModel = ISoftDeleteModel<IUser> & UserModal;
