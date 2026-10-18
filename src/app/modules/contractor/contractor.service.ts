import mongoose, { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { Contractor } from "./contractor.model";
import { Property } from "../property/property.model";
import { User } from "../user/user.model";
import { Review } from "../review/review.model";
import { USER_ROLES, STATUS } from "../../../enums/user";
import {
  CONTRACTOR_RELATION_STATUS,
  contractorSearchableFields,
} from "./contractor.constant";
import {
  IInviteContractorPayload,
  IUpdateContractorPayload,
} from "./contractor.interface";
import { AppOption } from "../appOption/appOption.model";
import { AppOptionType } from "../appOption/appOption.constant";
import { emailTemplate } from "../../../shared/emailTemplate";
import { emailHelper } from "../../../helpers/emailHelper";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import config from "../../../config";

const contractorPopulateOptions = [
  {
    path: "contractor",
    select:
      "name email phone profileImage verified status companyName deviceToken address",
  },
  {
    path: "landlord",
    select: "name email phone profileImage companyName",
  },
  {
    path: "trades",
    select: "name type isActive",
  },
];

// Helper: Resolve trade inputs (ObjectIds) to Types.ObjectId[]
const resolveTradeIds = (
  rawTrades?: Types.ObjectId[] | string[],
): Types.ObjectId[] => {
  if (!rawTrades || !Array.isArray(rawTrades)) {
    return [];
  }

  const validObjectIds: Types.ObjectId[] = [];
  for (const item of rawTrades) {
    const str = item.toString().trim();
    if (mongoose.Types.ObjectId.isValid(str)) {
      const objId = new Types.ObjectId(str);
      if (!validObjectIds.some((id) => id.equals(objId))) {
        validObjectIds.push(objId);
      }
    }
  }

  return validObjectIds;
};

// 1. Invite Contractor (Landlord / Admin)
const inviteContractorToDB = async (
  authUser: JwtPayload,
  payload: IInviteContractorPayload,
) => {
  const landlordId =
    authUser.role === USER_ROLES.LANDLORD ? authUser.id : authUser.id;

  const tradeIds = resolveTradeIds(payload.trades);

  // Password selection: default to '12345678' if not provided
  const rawPassword =
    payload.password && payload.password.trim()
      ? payload.password.trim()
      : "12345678";

  const normalizedEmail = payload.email.trim().toLowerCase();

  // Determine contractor name
  const defaultName = normalizedEmail
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const contractorName =
    payload.name && payload.name.trim() ? payload.name.trim() : defaultName;

  // Check or provision Contractor User account
  let contractorUser = await User.findOne({ email: normalizedEmail });

  if (contractorUser) {
    // If user already exists, verify role
    if (contractorUser.role !== USER_ROLES.CONTRACTOR) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        `User with email ${normalizedEmail} already exists with role ${contractorUser.role}. Only contractor accounts can be invited.`,
      );
    }

    // Update password as requested (custom or default 12345678)
    contractorUser.password = rawPassword;
    if (payload.phone && !contractorUser.phone) {
      contractorUser.phone = payload.phone;
    }
    if (payload.companyName && !contractorUser.companyName) {
      contractorUser.companyName = payload.companyName;
    }
    contractorUser.status = STATUS.ACTIVE;
    contractorUser.verified = true;
    await contractorUser.save();
  } else {
    // Create new Contractor User
    contractorUser = await User.create({
      name: contractorName,
      email: normalizedEmail,
      password: rawPassword,
      role: USER_ROLES.CONTRACTOR,
      status: STATUS.ACTIVE,
      verified: true,
      phone: payload.phone || "",
      companyName: payload.companyName || contractorName,
    });
  }

  // Find existing contractor relationship (including soft deleted)
  let contractorRelation = await Contractor.findOne({
    landlord: new Types.ObjectId(landlordId),
    contractor: contractorUser._id,
    isDeleted: { $in: [true, false] },
  });

  if (contractorRelation) {
    (contractorRelation as any).isDeleted = false;
    (contractorRelation as any).deletedAt = null;
    contractorRelation.name = contractorName;
    contractorRelation.email = normalizedEmail;
    contractorRelation.phone =
      payload.phone || contractorUser.phone || contractorRelation.phone || "";
    contractorRelation.companyName =
      payload.companyName ||
      contractorUser.companyName ||
      contractorRelation.companyName ||
      "";
    if (tradeIds.length > 0) {
      contractorRelation.trades = tradeIds;
    }
    contractorRelation.personalMessage =
      payload.personalMessage || contractorRelation.personalMessage || "";
    contractorRelation.status = CONTRACTOR_RELATION_STATUS.ACTIVE;
    contractorRelation.invitedAt = new Date();
    await contractorRelation.save();
  } else {
    contractorRelation = await Contractor.create({
      landlord: new Types.ObjectId(landlordId),
      contractor: contractorUser._id,
      name: contractorName,
      email: normalizedEmail,
      phone: payload.phone || contractorUser.phone || "",
      companyName:
        payload.companyName ||
        contractorUser.companyName ||
        contractorName ||
        "",
      trades: tradeIds,
      personalMessage: payload.personalMessage || "",
      status: CONTRACTOR_RELATION_STATUS.ACTIVE,
      invitedAt: new Date(),
    });
  }

  // Fetch Landlord for display name in email
  const landlordDoc = await User.findById(landlordId);
  const landlordName =
    landlordDoc?.companyName || landlordDoc?.name || "Your Landlord";

  const propertiesScopeText = `All Properties of ${landlordName}`;

  // Fetch trade names from AppOption for email display
  let tradesDisplayNameList: string[] = [];
  if (tradeIds.length > 0) {
    const tradeDocs = await AppOption.find({ _id: { $in: tradeIds } }).select(
      "name",
    );
    tradesDisplayNameList = tradeDocs.map((t) => t.name);
  }

  // Prepare and dispatch HTML Email
  const emailPayload = emailTemplate.contractorInvitation({
    email: normalizedEmail,
    password: rawPassword,
    contractorName: contractorName,
    landlordName: landlordName,
    companyName: payload.companyName || contractorUser.companyName,
    trades: tradesDisplayNameList,
    propertiesScope: propertiesScopeText,
    personalMessage: payload.personalMessage,
    loginUrl: config.client_url,
  });

  emailHelper.sendEmail(emailPayload);

  // Send push / DB notification to contractor user
  await sendNotifications({
    receiver: contractorUser._id,
    sender: new Types.ObjectId(landlordId),
    type: NOTIFICATION_TYPE.CONTRACTOR,
    title: "New Contractor Invitation",
    text: `${landlordName} has invited you to work as a contractor for their properties.`,
    referenceId: contractorUser._id,
    referenceModel: "User",
  });

  const result = await Contractor.findById(contractorRelation._id).populate(
    contractorPopulateOptions,
  );

  return result;
};

// 2. Get All Contractors (Landlord / Contractor / Admin - SaaS Multi-tenant isolated)
const getAllContractorsFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const filter: Record<string, any> = {};

  if (authUser.role === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(authUser.id);
  } else if (authUser.role === USER_ROLES.CONTRACTOR) {
    filter.contractor = new Types.ObjectId(authUser.id);
  }

  // Filter by property if requested:
  // Since contractors are under the landlord and cover all of the landlord's properties,
  // verify property belongs to landlord (if landlord role)
  if (query.property) {
    const propStr = String(query.property).trim();
    if (propStr !== "all" && propStr !== "ALL" && propStr !== "") {
      if (mongoose.Types.ObjectId.isValid(propStr)) {
        if (authUser.role === USER_ROLES.LANDLORD) {
          const propertyDoc = await Property.findOne({
            _id: new Types.ObjectId(propStr),
            landlord: new Types.ObjectId(authUser.id),
          });
          if (!propertyDoc) {
            return {
              meta: { page: 1, limit: 10, total: 0, totalPage: 0 },
              data: [],
            };
          }
        }
      }
    }
    delete query.property;
  }

  // Filter by trade if requested
  if (query.trade) {
    const tradeStr = String(query.trade).trim();
    if (tradeStr !== "all" && tradeStr !== "ALL" && tradeStr !== "") {
      if (mongoose.Types.ObjectId.isValid(tradeStr)) {
        filter.trades = new Types.ObjectId(tradeStr);
      } else {
        const matchedOptions = await AppOption.find({
          type: AppOptionType.TRADE,
          name: { $regex: tradeStr, $options: "i" },
        }).select("_id");
        const matchedIds = matchedOptions.map((o) => o._id);
        filter.trades = { $in: matchedIds };
      }
    }
    delete query.trade;
  }

  // Filter by status if requested
  if (query.status) {
    filter.status = query.status;
    delete query.status;
  }

  const baseQuery = Contractor.find(filter).populate(contractorPopulateOptions);

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(contractorSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [contractors, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  // Enrich contractors with average rating and total reviews
  const enrichedContractors = await Promise.all(
    contractors.map(async (item: any) => {
      const contractorUserId = item.contractor?._id || item.contractor;
      if (contractorUserId) {
        try {
          const stats = await Review.calculateAverageRating(contractorUserId);
          return {
            ...item,
            rating: stats.averageRating || 0,
            totalReviews: stats.totalReviews || 0,
          };
        } catch {
          return {
            ...item,
            rating: item.rating || 0,
            totalReviews: item.totalReviews || 0,
          };
        }
      }
      return item;
    }),
  );

  return {
    meta,
    data: enrichedContractors,
  };
};

// 3. Get Single Contractor (SaaS scoped)
const getSingleContractorFromDB = async (authUser: JwtPayload, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid contractor ID");
  }

  const contractor = await Contractor.findById(id).populate(
    contractorPopulateOptions,
  );
  if (!contractor || (contractor as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Contractor not found");
  }

  // SaaS Isolation check
  if (authUser.role === USER_ROLES.LANDLORD) {
    const landlordId = (contractor.landlord as any)?._id
      ? (contractor.landlord as any)._id.toString()
      : contractor.landlord?.toString();

    if (landlordId !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to view this contractor",
      );
    }
  } else if (authUser.role === USER_ROLES.CONTRACTOR) {
    const contractorId = (contractor.contractor as any)?._id
      ? (contractor.contractor as any)._id.toString()
      : contractor.contractor?.toString();

    if (contractorId !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to view this contractor",
      );
    }
  }

  // Fetch full review summary
  const contractorUserId =
    (contractor.contractor as any)?._id || contractor.contractor;
  let reviewSummary = {
    averageRating: 0.0,
    totalReviews: 0,
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  };

  if (contractorUserId) {
    try {
      reviewSummary = await Review.calculateAverageRating(contractorUserId);
    } catch {
      // Use defaults if review calculation fails
    }
  }

  return {
    ...contractor.toObject(),
    rating: reviewSummary.averageRating,
    totalReviews: reviewSummary.totalReviews,
    reviewSummary,
  };
};

// 4. Get Current Logged-in Contractor's Landlords and Assignments
const getMyAssignedLandlordsFromDB = async (authUser: JwtPayload) => {
  if (authUser.role !== USER_ROLES.CONTRACTOR) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Only contractors can access this endpoint",
    );
  }

  const assignments = await Contractor.find({
    contractor: new Types.ObjectId(authUser.id),
    status: CONTRACTOR_RELATION_STATUS.ACTIVE,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .populate(contractorPopulateOptions)
    .lean();

  // Attach properties list of each landlord so the contractor knows all properties they cover
  const enrichedAssignments = await Promise.all(
    assignments.map(async (item: any) => {
      const landlordUserId = item.landlord?._id || item.landlord;
      if (landlordUserId) {
        const properties = await Property.find({
          landlord: landlordUserId,
        }).select(
          "propertyName streetAddress postCode propertyPhotos propertyType",
        );
        return {
          ...item,
          properties,
        };
      }
      return item;
    }),
  );

  return enrichedAssignments;
};

// 5. Update Contractor (Landlord / Admin)
const updateContractorToDB = async (
  authUser: JwtPayload,
  id: string,
  payload: IUpdateContractorPayload,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid contractor ID");
  }

  const contractor = await Contractor.findById(id);
  if (!contractor || (contractor as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Contractor not found");
  }

  if (authUser.role === USER_ROLES.LANDLORD) {
    const landlordId = (contractor.landlord as any)?._id
      ? (contractor.landlord as any)._id.toString()
      : contractor.landlord?.toString();

    if (landlordId !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to update this contractor",
      );
    }
  }

  if (payload.name) {
    contractor.name = payload.name.trim();
  }
  if (payload.phone) {
    contractor.phone = payload.phone.trim();
  }
  if (payload.companyName) {
    contractor.companyName = payload.companyName.trim();
  }

  // Update trades if provided
  if (payload.trades !== undefined) {
    contractor.trades = resolveTradeIds(payload.trades);
  }

  if (payload.personalMessage !== undefined) {
    contractor.personalMessage = payload.personalMessage;
  }

  if (payload.status) {
    contractor.status = payload.status;
  }

  await contractor.save();

  // If name, phone, or companyName updated, optionally update User profile
  const userUpdates: Record<string, any> = {};
  if (payload.name) userUpdates.name = payload.name.trim();
  if (payload.phone) userUpdates.phone = payload.phone.trim();
  if (payload.companyName) userUpdates.companyName = payload.companyName.trim();

  if (Object.keys(userUpdates).length > 0) {
    await User.findByIdAndUpdate(contractor.contractor, userUpdates);
  }

  return await Contractor.findById(contractor._id).populate(
    contractorPopulateOptions,
  );
};

// 6. Resend Invitation Email (Landlord / Admin)
const resendInvitationEmail = async (
  authUser: JwtPayload,
  id: string,
  customPassword?: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid contractor ID");
  }

  const contractor = await Contractor.findById(id)
    .populate("contractor")
    .populate("landlord");

  if (!contractor || (contractor as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Contractor not found");
  }

  const landlordId = (contractor.landlord as any)?._id
    ? (contractor.landlord as any)._id.toString()
    : contractor.landlord?.toString();

  if (authUser.role === USER_ROLES.LANDLORD) {
    if (landlordId !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to manage this contractor",
      );
    }
  }

  const passwordToUse = customPassword?.trim() || "12345678";

  // Update password on contractor user
  const contractorUserId =
    (contractor.contractor as any)?._id || contractor.contractor;
  const contractorUser = await User.findById(contractorUserId);
  if (contractorUser) {
    contractorUser.password = passwordToUse;
    await contractorUser.save();
  }

  const landlordDoc: any = (contractor.landlord as any)?._id
    ? contractor.landlord
    : await User.findById(landlordId);
  const landlordName =
    landlordDoc?.companyName || landlordDoc?.name || "Your Landlord";

  const propertiesScopeText = `All Properties of ${landlordName}`;

  let tradesDisplayNameList: string[] = [];
  if (Array.isArray(contractor.trades) && contractor.trades.length > 0) {
    const tradeDocs = await AppOption.find({
      _id: { $in: contractor.trades },
    }).select("name");
    tradesDisplayNameList = tradeDocs.map((t) => t.name);
  }

  const emailPayload = emailTemplate.contractorInvitation({
    email: contractor.email,
    password: passwordToUse,
    contractorName: contractor.name,
    landlordName: landlordName,
    companyName: contractor.companyName,
    trades: tradesDisplayNameList,
    propertiesScope: propertiesScopeText,
    personalMessage: contractor.personalMessage,
    loginUrl: config.client_url,
  });

  emailHelper.sendEmail(emailPayload);

  return {
    message: "Contractor invitation email resent successfully",
  };
};

// 7. Remove Contractor / Terminate Relationship (Landlord / Admin)
const removeContractorFromDB = async (authUser: JwtPayload, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid contractor ID");
  }

  const contractor = await Contractor.findById(id);
  if (!contractor || (contractor as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Contractor not found");
  }

  if (authUser.role === USER_ROLES.LANDLORD) {
    const landlordId = (contractor.landlord as any)?._id
      ? (contractor.landlord as any)._id.toString()
      : contractor.landlord?.toString();

    if (landlordId !== authUser.id) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to remove this contractor",
      );
    }
  }

  // Update contractor status and soft delete
  contractor.status = CONTRACTOR_RELATION_STATUS.TERMINATED;
  await (contractor as any).delete();

  return {
    message: "Contractor successfully removed",
  };
};

export const ContractorService = {
  inviteContractorToDB,
  getAllContractorsFromDB,
  getSingleContractorFromDB,
  getMyAssignedLandlordsFromDB,
  updateContractorToDB,
  resendInvitationEmail,
  removeContractorFromDB,
};
