import { USER_ROLES } from "../enums/user";

export type ISignUpData = {
  name: string;
  email: string;
  password: string;
  role?: USER_ROLES;
  phone?: string;
  countryCode?: string;
  address?: string;
  fcmToken?: string;
  deviceId?: string;
  deviceType?: "ios" | "android" | "web";
};

export type IVerifyEmail = {
  email: string;
  oneTimeCode: number;
};

export type ILoginData = {
  email?: string;
  phone?: string;
  password?: string;
  fcmToken?: string;
  deviceId?: string;
  deviceType?: "ios" | "android" | "web";
};

export type IAuthResetPassword = {
  newPassword: string;
  confirmPassword: string;
};

export type IChangePassword = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

