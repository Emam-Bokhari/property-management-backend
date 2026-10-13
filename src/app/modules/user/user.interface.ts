import { Model } from "mongoose";
import { GENDER, STATUS, USER_ROLES } from "../../../enums/user";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { PRIMARY_TRADE } from "./user.constant";

export type TCertificate = {
  certificateName?: string;
  certificateAttachment?: string;
}

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
  dateOfBirth: string | Date;
  nidNumber?: number;
  nidPhoto: string;
  emergencyPhone?: string;
  homeAddress?: string;
  certificates?: TCertificate[];
  companyName?: string;
  primaryTrade?: PRIMARY_TRADE;
  authentication?: {
    isResetPassword: boolean;
    oneTimeCode: number;
    expireAt: Date;
  };
};

export type UserModal = {
  isExistUserById(id: string): any;
  isExistUserByEmail(email: string): any;
  isAccountCreated(id: string): any;
  isMatchPassword(password: string, hashPassword: string): boolean;
} & Model<IUser>;

export type IUserModel = ISoftDeleteModel<IUser> & UserModal;
