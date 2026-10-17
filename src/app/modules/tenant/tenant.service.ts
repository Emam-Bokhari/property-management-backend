import mongoose, { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { Tenancy } from "./tenant.model";
import { Flat } from "../flat/flat.model";
import { Property } from "../property/property.model";
import { User } from "../user/user.model";
import { USER_ROLES, STATUS } from "../../../enums/user";
import {
  DEPOSIT_PROTECTION_SCHEME,
  TENANCY_STATUS,
  tenantSearchableFields,
} from "./tenant.constant";
import {
  IInviteTenantPayload,
  IUpdateTenancyPayload,
} from "./tenant.interface";
import { emailTemplate } from "../../../shared/emailTemplate";
import { emailHelper } from "../../../helpers/emailHelper";
import config from "../../../config";

const tenancyPopulateOptions = [
  {
    path: "property",
    select:
      "propertyName streetAddress postCode propertyPhotos propertyType floorsInBuilding",
  },
  {
    path: "flat",
    select: "unitName floor rentPerMonth unitType beds baths flatPhotos",
  },
  {
    path: "tenant",
    select: "name email phone profileImage status role verified property flat",
  },
  {
    path: "landlord",
    select: "name email phone profileImage companyName",
  },
];

// 1. Invite Tenant (Landlord / Admin)
const inviteTenantToDB = async (
  authUser: JwtPayload,
  payload: IInviteTenantPayload,
) => {
  // Validate Property ID
  if (!mongoose.Types.ObjectId.isValid(payload.property)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }

  // Validate Flat ID
  if (!mongoose.Types.ObjectId.isValid(payload.flat)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  // Verify Property exists and landlord ownership
  const propertyDoc = await Property.findById(payload.property);
  if (!propertyDoc || (propertyDoc as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  if (authUser.role === USER_ROLES.LANDLORD) {
    const landlordId = propertyDoc.landlord?._id
      ? propertyDoc.landlord._id.toString()
      : propertyDoc.landlord?.toString();

    if (landlordId !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to invite tenants for this property",
      );
    }
  }

  // Verify Flat exists and belongs to the property
  const flatDoc = await Flat.findById(payload.flat);
  if (!flatDoc || (flatDoc as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  if (flatDoc.property.toString() !== propertyDoc._id.toString()) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "The specified flat does not belong to this property",
    );
  }

  if (authUser.role === USER_ROLES.LANDLORD) {
    const flatLandlordId = flatDoc.landlord?._id
      ? flatDoc.landlord._id.toString()
      : flatDoc.landlord?.toString();

    if (flatLandlordId && flatLandlordId !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to manage this flat",
      );
    }
  }

  // Password selection: default to '12345678' if not provided
  const rawPassword =
    payload.password && payload.password.trim()
      ? payload.password.trim()
      : "12345678";

  const normalizedEmail = payload.email.trim().toLowerCase();

  // Check or provision Tenant User account
  let tenantUser = await User.findOne({ email: normalizedEmail });

  if (tenantUser) {
    // If user already exists, verify role
    if (tenantUser.role !== USER_ROLES.TENANT) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        `User with email ${normalizedEmail} already exists with role ${tenantUser.role}. Only tenant accounts can be invited.`,
      );
    }

    // Assign tenant's scoped property and flat (SaaS isolation)
    tenantUser.property = propertyDoc._id;
    tenantUser.flat = flatDoc._id;
    tenantUser.status = STATUS.ACTIVE;
    tenantUser.verified = true;
    // Update password as requested (custom or default 12345678)
    tenantUser.password = rawPassword;
    await tenantUser.save();
  } else {
    // Create new Tenant User with scoped property & flat access
    const defaultName = normalizedEmail
      .split("@")[0]
      .replace(/[._-]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

    tenantUser = await User.create({
      name: defaultName,
      email: normalizedEmail,
      password: rawPassword,
      role: USER_ROLES.TENANT,
      status: STATUS.ACTIVE,
      verified: true,
      property: propertyDoc._id,
      flat: flatDoc._id,
    });
  }

  // Link Tenant to Flat
  flatDoc.tenant = tenantUser._id;
  if (!flatDoc.tenants) {
    flatDoc.tenants = [];
  }
  if (
    !flatDoc.tenants.some(
      (tId: any) => tId.toString() === tenantUser._id.toString(),
    )
  ) {
    flatDoc.tenants.push(tenantUser._id);
  }
  await flatDoc.save();

  // Create or Update Tenancy Record
  const effectiveRent = payload.rentAmount || flatDoc.rentPerMonth;
  const startDate = new Date(payload.leaseStartDate);
  const endDate = new Date(payload.leaseEndDate);

  let tenancy = await Tenancy.findOne({
    property: propertyDoc._id,
    flat: flatDoc._id,
    tenant: tenantUser._id,
    isDeleted: { $ne: true },
  });

  if (tenancy) {
    tenancy.rentAmount = effectiveRent;
    tenancy.leaseStartDate = startDate;
    tenancy.leaseEndDate = endDate;
    tenancy.securityDeposit = payload.securityDeposit ?? 0;
    tenancy.advanceRent = payload.advanceRent ?? 0;
    tenancy.depositProtectionScheme =
      payload.depositProtectionScheme || DEPOSIT_PROTECTION_SCHEME.MY_DEPOSITS;
    tenancy.personalMessage = payload.personalMessage || "";
    tenancy.status = TENANCY_STATUS.ACTIVE;
    tenancy.invitedAt = new Date();
    await tenancy.save();
  } else {
    tenancy = await Tenancy.create({
      landlord: propertyDoc.landlord || new Types.ObjectId(authUser.id),
      property: propertyDoc._id,
      flat: flatDoc._id,
      tenant: tenantUser._id,
      email: normalizedEmail,
      rentAmount: effectiveRent,
      leaseStartDate: startDate,
      leaseEndDate: endDate,
      securityDeposit: payload.securityDeposit ?? 0,
      advanceRent: payload.advanceRent ?? 0,
      depositProtectionScheme:
        payload.depositProtectionScheme ||
        DEPOSIT_PROTECTION_SCHEME.MY_DEPOSITS,
      personalMessage: payload.personalMessage || "",
      status: TENANCY_STATUS.ACTIVE,
      invitedAt: new Date(),
    });
  }

  // Fetch Landlord for display name in email
  const landlordDoc = await User.findById(authUser.id);
  const landlordName = landlordDoc?.name || "Your Landlord";

  const formattedStart = startDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const formattedEnd = endDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Prepare and dispatch beautiful HTML Email
  const emailPayload = emailTemplate.tenantInvitation({
    email: normalizedEmail,
    password: rawPassword,
    tenantName: tenantUser.name,
    landlordName: landlordName,
    propertyName: propertyDoc.propertyName,
    propertyAddress: `${propertyDoc.streetAddress}, ${propertyDoc.postCode}`,
    flatUnitName: flatDoc.unitName,
    rentAmount: effectiveRent,
    leaseStartDate: formattedStart,
    leaseEndDate: formattedEnd,
    securityDeposit: payload.securityDeposit,
    advanceRent: payload.advanceRent,
    depositProtectionScheme: payload.depositProtectionScheme,
    personalMessage: payload.personalMessage,
    loginUrl: config.client_url,
  });

  emailHelper.sendEmail(emailPayload);

  return (await Tenancy.findById(tenancy._id).populate(
    tenancyPopulateOptions,
  )) as any;
};

// 2. Get All Tenancies (Landlord / Tenant / Admin - SaaS Multi-tenant isolated)
const getAllTenantsFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const filter: Record<string, any> = {};

  if (authUser.role === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(authUser.id);
  } else if (authUser.role === USER_ROLES.TENANT) {
    filter.tenant = new Types.ObjectId(authUser.id);
  }

  // Filter by property if requested
  if (query.property) {
    if (mongoose.Types.ObjectId.isValid(query.property as string)) {
      filter.property = new Types.ObjectId(query.property as string);
      delete query.property;
    }
  }

  // Filter by flat if requested
  if (query.flat) {
    if (mongoose.Types.ObjectId.isValid(query.flat as string)) {
      filter.flat = new Types.ObjectId(query.flat as string);
      delete query.flat;
    }
  }

  // Filter by status if requested
  if (query.status) {
    filter.status = query.status;
    delete query.status;
  }

  const baseQuery = Tenancy.find(filter).populate(tenancyPopulateOptions);

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(tenantSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [tenants, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  return {
    meta,
    data: tenants,
  };
};

// 3. Get Single Tenancy (SaaS scoped)
const getSingleTenantFromDB = async (authUser: JwtPayload, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid tenancy ID");
  }

  const tenancy = await Tenancy.findById(id).populate(tenancyPopulateOptions);
  if (!tenancy || (tenancy as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Tenancy not found");
  }

  // SaaS Isolation check
  if (authUser.role === USER_ROLES.LANDLORD) {
    const landlordId = (tenancy.landlord as any)?._id
      ? (tenancy.landlord as any)._id.toString()
      : tenancy.landlord?.toString();

    if (landlordId !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to view this tenancy",
      );
    }
  } else if (authUser.role === USER_ROLES.TENANT) {
    const tenantId = (tenancy.tenant as any)?._id
      ? (tenancy.tenant as any)._id.toString()
      : tenancy.tenant?.toString();

    if (tenantId !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to view this tenancy",
      );
    }
  }

  return tenancy;
};

// 4. Get Current Logged-in Tenant Tenancy
const getMyTenancyFromDB = async (authUser: JwtPayload) => {
  if (authUser.role !== USER_ROLES.TENANT) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Only tenants can access this endpoint",
    );
  }

  const tenancy = await Tenancy.findOne({
    tenant: new Types.ObjectId(authUser.id),
    status: TENANCY_STATUS.ACTIVE,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .populate(tenancyPopulateOptions);

  if (!tenancy) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No active tenancy found for your account",
    );
  }

  return tenancy;
};

// 5. Update Tenancy (Landlord / Admin)
const updateTenancyToDB = async (
  authUser: JwtPayload,
  id: string,
  payload: IUpdateTenancyPayload,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid tenancy ID");
  }

  const tenancy = await Tenancy.findById(id);
  if (!tenancy || (tenancy as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Tenancy not found");
  }

  if (authUser.role === USER_ROLES.LANDLORD) {
    if (tenancy.landlord.toString() !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to update this tenancy",
      );
    }
  }

  if (payload.rentAmount !== undefined) {
    tenancy.rentAmount = payload.rentAmount;
  }
  if (payload.leaseStartDate) {
    tenancy.leaseStartDate = new Date(payload.leaseStartDate);
  }
  if (payload.leaseEndDate) {
    tenancy.leaseEndDate = new Date(payload.leaseEndDate);
  }
  if (payload.securityDeposit !== undefined) {
    tenancy.securityDeposit = payload.securityDeposit;
  }
  if (payload.advanceRent !== undefined) {
    tenancy.advanceRent = payload.advanceRent;
  }
  if (payload.depositProtectionScheme !== undefined) {
    tenancy.depositProtectionScheme = payload.depositProtectionScheme;
  }
  if (payload.personalMessage !== undefined) {
    tenancy.personalMessage = payload.personalMessage;
  }
  if (payload.status) {
    tenancy.status = payload.status;
  }

  await tenancy.save();

  return (await Tenancy.findById(tenancy._id).populate(
    tenancyPopulateOptions,
  )) as any;
};

// 6. Resend Invitation Email (Landlord / Admin)
const resendInvitationEmail = async (
  authUser: JwtPayload,
  id: string,
  customPassword?: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid tenancy ID");
  }

  const tenancy = await Tenancy.findById(id)
    .populate("property")
    .populate("flat")
    .populate("tenant");

  if (!tenancy || (tenancy as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Tenancy not found");
  }

  if (authUser.role === USER_ROLES.LANDLORD) {
    if (tenancy.landlord.toString() !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to manage this tenancy",
      );
    }
  }

  const passwordToUse = customPassword?.trim() || "12345678";

  // Update password on tenant user
  const tenantUser = await User.findById(tenancy.tenant);
  if (tenantUser) {
    tenantUser.password = passwordToUse;
    await tenantUser.save();
  }

  const landlordDoc = await User.findById(authUser.id);
  const landlordName = landlordDoc?.name || "Your Landlord";
  const propertyDoc: any = tenancy.property;
  const flatDoc: any = tenancy.flat;

  const formattedStart = new Date(tenancy.leaseStartDate).toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  );
  const formattedEnd = new Date(tenancy.leaseEndDate).toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  );

  const emailPayload = emailTemplate.tenantInvitation({
    email: tenancy.email,
    password: passwordToUse,
    tenantName: tenantUser?.name || "Tenant",
    landlordName: landlordName,
    propertyName: propertyDoc?.propertyName || "Property",
    propertyAddress: propertyDoc
      ? `${propertyDoc.streetAddress}, ${propertyDoc.postCode}`
      : "",
    flatUnitName: flatDoc?.unitName || "Flat",
    rentAmount: tenancy.rentAmount,
    leaseStartDate: formattedStart,
    leaseEndDate: formattedEnd,
    securityDeposit: tenancy.securityDeposit,
    advanceRent: tenancy.advanceRent,
    depositProtectionScheme: tenancy.depositProtectionScheme,
    personalMessage: tenancy.personalMessage,
    loginUrl: config.client_url,
  });

  emailHelper.sendEmail(emailPayload);

  return {
    message: "Invitation email resent successfully",
  };
};

// 7. Remove Tenant from Flat / Terminate Tenancy (Landlord / Admin)
const removeTenantFromDB = async (authUser: JwtPayload, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid tenancy ID");
  }

  const tenancy = await Tenancy.findById(id);
  if (!tenancy || (tenancy as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Tenancy not found");
  }

  if (authUser.role === USER_ROLES.LANDLORD) {
    if (tenancy.landlord.toString() !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to remove this tenant",
      );
    }
  }

  // Update tenancy status
  tenancy.status = TENANCY_STATUS.TERMINATED;
  await (tenancy as any).delete();

  // Clear tenant assignment from flat
  const flatDoc = await Flat.findById(tenancy.flat);
  if (flatDoc) {
    if (
      flatDoc.tenant &&
      flatDoc.tenant.toString() === tenancy.tenant.toString()
    ) {
      flatDoc.tenant = null as any;
    }
    if (Array.isArray(flatDoc.tenants)) {
      flatDoc.tenants = flatDoc.tenants.filter(
        (t: any) => t.toString() !== tenancy.tenant.toString(),
      );
    }
    await flatDoc.save();
  }

  // Clear property & flat scope on tenant user
  await User.findByIdAndUpdate(tenancy.tenant, {
    property: null,
    flat: null,
  });

  return {
    message: "Tenant successfully removed from flat",
  };
};

export const TenantService = {
  inviteTenantToDB,
  getAllTenantsFromDB,
  getSingleTenantFromDB,
  getMyTenancyFromDB,
  updateTenancyToDB,
  resendInvitationEmail,
  removeTenantFromDB,
};
