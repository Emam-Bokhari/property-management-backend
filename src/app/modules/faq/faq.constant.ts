import { USER_ROLES } from "../../../enums/user";

export const faqSearchableFields = ["question", "answer"];

export const normalizeFaqRole = (
  role?: unknown,
): USER_ROLES | string | undefined => {
  if (!role || typeof role !== "string") return undefined;
  const cleaned = role.toLowerCase().trim();
  if (cleaned === "landlord" || cleaned === "landlords")
    return USER_ROLES.LANDLORD;
  if (cleaned === "tenant" || cleaned === "tenants") return USER_ROLES.TENANT;
  if (cleaned === "contractor" || cleaned === "contractors")
    return USER_ROLES.CONTRACTOR;
  if (cleaned === "admin" || cleaned === "admins") return USER_ROLES.ADMIN;
  if (
    cleaned === "super_admin" ||
    cleaned === "super_admins" ||
    cleaned === "superadmin"
  )
    return USER_ROLES.SUPER_ADMIN;
  return cleaned;
};
