import auth from "../app/middlewares/auth";
import { USER_ROLES } from "../enums/user";

export const isLandlord = auth(USER_ROLES.LANDLORD);

export const isTenant = auth(USER_ROLES.TENANT);

export const isContractor = auth(USER_ROLES.CONTRACTOR);

export const isLandlordOrTenant = auth(USER_ROLES.LANDLORD, USER_ROLES.TENANT);

export const isAdmin = auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN);

export const isSuperAdmin = auth(USER_ROLES.SUPER_ADMIN);

export const isAuthenticated = auth(
  USER_ROLES.LANDLORD,
  USER_ROLES.TENANT,
  USER_ROLES.CONTRACTOR,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
);
