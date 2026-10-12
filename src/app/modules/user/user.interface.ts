import { Model } from "mongoose";
import { GENDER, STATUS, USER_ROLES } from "../../../enums/user";
import { ISoftDeleteModel } from "../../../types/softDelete";

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
  dateOfBirth?: Date;
  gender?: GENDER;
  userName?: string;
  deviceToken?: string;
  address?: string;
  timezone?: string;
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
