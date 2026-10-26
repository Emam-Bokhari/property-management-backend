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
  IContractorHomeDashboardData,
  INextScheduleCard,
  IContractorMetricCard,
  IUpcomingJobItem,
  IContractorProfileSummary,
} from "./contractor.interface";
import { Maintenance } from "../maintenance/maintenance.model";
import {
  MAINTENANCE_STATUS,
  CONTRACTOR_STATUS,
} from "../maintenance/maintenance.constant";
import { Notification } from "../notification/notification.model";
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
    type: NOTIFICATION_TYPE.JOB_UPDATE,
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

// Helper: Format next schedule card data
const formatNextScheduleCard = (job: any, now: Date): INextScheduleCard => {
  const scheduledDate = new Date(job.scheduledDate);
  const isToday =
    scheduledDate.getFullYear() === now.getFullYear() &&
    scheduledDate.getMonth() === now.getMonth() &&
    scheduledDate.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    scheduledDate.getFullYear() === tomorrow.getFullYear() &&
    scheduledDate.getMonth() === tomorrow.getMonth() &&
    scheduledDate.getDate() === tomorrow.getDate();

  const dayNumber = scheduledDate.getDate();
  const monthShort = scheduledDate.toLocaleString("en-GB", { month: "short" });

  let badgeDate = `${dayNumber} ${monthShort}`;
  if (isToday) {
    badgeDate = `Today · ${dayNumber} ${monthShort}`;
  } else if (isTomorrow) {
    badgeDate = `Tomorrow · ${dayNumber} ${monthShort}`;
  } else {
    const weekdayShort = scheduledDate.toLocaleString("en-GB", {
      weekday: "short",
    });
    badgeDate = `${weekdayShort} · ${dayNumber} ${monthShort}`;
  }

  const prop = job.property as any;
  const flat = job.flat as any;
  const addressParts: string[] = [];
  if (prop?.streetAddress || prop?.propertyName) {
    addressParts.push(prop?.streetAddress || prop?.propertyName);
  }
  if (flat?.unitName) {
    addressParts.push(flat.unitName);
  }
  const formattedAddress = addressParts.join(" · ") || "Address not specified";

  return {
    id: job._id.toString(),
    jobId: job.jobId || `#JOB-${job._id.toString().slice(-4)}`,
    title: job.issueTitle,
    time: job.scheduledTime || "Scheduled",
    badgeDate,
    scheduledDate: job.scheduledDate,
    scheduledTime: job.scheduledTime || "",
    isToday,
    location: formattedAddress,
    streetAddress: prop?.streetAddress || prop?.propertyName || "",
    flatUnit: flat?.unitName || "",
    postCode: prop?.postCode || "",
    status: job.status,
    contractorStatus: job.contractorStatus,
  };
};

// Helper: Format upcoming job item
const formatUpcomingJobItem = (job: any): IUpcomingJobItem => {
  const prop = job.property as any;
  const flat = job.flat as any;
  const locationParts: string[] = [];
  if (prop?.streetAddress || prop?.propertyName) {
    locationParts.push(prop?.streetAddress || prop?.propertyName);
  }
  if (flat?.unitName) {
    locationParts.push(flat.unitName);
  }
  const location = locationParts.join(" - ") || "Address not specified";

  let dateFormatted = "";
  if (job.scheduledDate) {
    const sDate = new Date(job.scheduledDate);
    const month = sDate.toLocaleString("en-GB", { month: "short" });
    const day = sDate.getDate();
    dateFormatted = `${month} ${day}${
      job.scheduledTime ? `, ${job.scheduledTime}` : ""
    }`;
  } else if (job.reportedAt || job.createdAt) {
    const rDate = new Date(job.reportedAt || job.createdAt);
    const month = rDate.toLocaleString("en-GB", { month: "short" });
    const day = rDate.getDate();
    dateFormatted = `${month} ${day}`;
  }

  let statusBadge = "Assigned";
  if (
    job.status === MAINTENANCE_STATUS.SCHEDULED ||
    job.contractorStatus === CONTRACTOR_STATUS.SCHEDULED
  ) {
    statusBadge = "Scheduled";
  } else if (
    job.status === MAINTENANCE_STATUS.IN_PROGRESS ||
    job.contractorStatus === CONTRACTOR_STATUS.IN_PROGRESS
  ) {
    statusBadge = "In Progress";
  } else if (
    job.status === MAINTENANCE_STATUS.WAITING_APPROVAL ||
    job.contractorStatus === CONTRACTOR_STATUS.INVOICE_SUBMITTED
  ) {
    statusBadge = "Pending Review";
  } else if (
    job.status === MAINTENANCE_STATUS.INVOICE_REJECTED ||
    job.contractorStatus === CONTRACTOR_STATUS.INVOICE_REJECTED
  ) {
    statusBadge = "Invoice Rejected";
  } else if (
    job.status === MAINTENANCE_STATUS.COMPLETED ||
    job.contractorStatus === CONTRACTOR_STATUS.COMPLETED
  ) {
    statusBadge = "Completed";
  }

  const image =
    (job.attachments && job.attachments.length > 0
      ? job.attachments[0]
      : null) ||
    (job.completionPhotos && job.completionPhotos.length > 0
      ? job.completionPhotos[0]
      : null);

  return {
    id: job._id.toString(),
    jobId: job.jobId || `#JOB-${job._id.toString().slice(-4)}`,
    title: job.issueTitle,
    location,
    propertyId: prop?._id?.toString(),
    propertyName: prop?.propertyName,
    streetAddress: prop?.streetAddress,
    flatUnit: flat?.unitName,
    postCode: prop?.postCode,
    scheduledDate: job.scheduledDate,
    scheduledTime: job.scheduledTime,
    dateFormatted,
    status: job.status,
    contractorStatus: job.contractorStatus,
    statusBadge,
    priority: job.priority,
    image,
  };
};

// Contractor Home Dashboard Service
const getContractorHomeDashboardFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
): Promise<IContractorHomeDashboardData> => {
  let targetContractorId = authUser.userId || authUser.id;

  if (
    (authUser.role === USER_ROLES.ADMIN ||
      authUser.role === USER_ROLES.SUPER_ADMIN) &&
    query?.contractorId &&
    typeof query.contractorId === "string"
  ) {
    targetContractorId = query.contractorId;
  }

  if (!mongoose.Types.ObjectId.isValid(targetContractorId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid contractor ID");
  }

  const contractorObjectId = new Types.ObjectId(targetContractorId);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  // Parallel fetch for ultra-fast performance
  const [
    contractorUser,
    unreadNotificationsCount,
    assignedJobsCount,
    pendingReviewCount,
    inProgressCount,
    completedThisMonthCount,
    totalCompletedCount,
    scheduledJobs,
    upcomingJobs,
  ] = await Promise.all([
    User.findById(contractorObjectId)
      .select(
        "name email phone profileImage companyName role primaryTrade status",
      )
      .lean(),
    Notification.countDocuments({
      receiver: contractorObjectId,
      read: false,
    }),
    Maintenance.countDocuments({
      contractor: contractorObjectId,
      isDeleted: { $ne: true },
      status: {
        $in: [MAINTENANCE_STATUS.ASSIGNED, MAINTENANCE_STATUS.PENDING],
      },
    }),
    Maintenance.countDocuments({
      contractor: contractorObjectId,
      isDeleted: { $ne: true },
      $or: [
        {
          status: {
            $in: [
              MAINTENANCE_STATUS.WAITING_APPROVAL,
              MAINTENANCE_STATUS.INVOICE_REJECTED,
            ],
          },
        },
        {
          contractorStatus: {
            $in: [
              CONTRACTOR_STATUS.INVOICE_SUBMITTED,
              CONTRACTOR_STATUS.INVOICE_REJECTED,
            ],
          },
        },
      ],
    }),
    Maintenance.countDocuments({
      contractor: contractorObjectId,
      isDeleted: { $ne: true },
      status: MAINTENANCE_STATUS.IN_PROGRESS,
    }),
    Maintenance.countDocuments({
      contractor: contractorObjectId,
      isDeleted: { $ne: true },
      status: MAINTENANCE_STATUS.COMPLETED,
      completedAt: { $gte: startOfMonth },
    }),
    Maintenance.countDocuments({
      contractor: contractorObjectId,
      isDeleted: { $ne: true },
      status: MAINTENANCE_STATUS.COMPLETED,
    }),
    Maintenance.find({
      contractor: contractorObjectId,
      isDeleted: { $ne: true },
      status: {
        $in: [MAINTENANCE_STATUS.SCHEDULED, MAINTENANCE_STATUS.IN_PROGRESS],
      },
      scheduledDate: { $ne: null },
    })
      .populate("property", "propertyName streetAddress city postCode")
      .populate("flat", "unitName")
      .sort({ scheduledDate: 1, scheduledTime: 1 })
      .lean(),
    Maintenance.find({
      contractor: contractorObjectId,
      isDeleted: { $ne: true },
      status: {
        $in: [
          MAINTENANCE_STATUS.SCHEDULED,
          MAINTENANCE_STATUS.ASSIGNED,
          MAINTENANCE_STATUS.IN_PROGRESS,
          MAINTENANCE_STATUS.WAITING_APPROVAL,
        ],
      },
    })
      .populate("property", "propertyName streetAddress city postCode")
      .populate("flat", "unitName")
      .populate("issueType", "name icon type")
      .populate("landlord", "name email phone profileImage companyName")
      .sort({ scheduledDate: 1, createdAt: -1 })
      .limit(Number(query?.limit) || 10)
      .lean(),
  ]);

  if (!contractorUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Contractor account not found");
  }

  // 1. Next Schedule Hero Card (Top Blue Banner)
  let nextScheduleJob = scheduledJobs.find(
    (j: any) => new Date(j.scheduledDate) >= startOfToday,
  );
  if (!nextScheduleJob && scheduledJobs.length > 0) {
    nextScheduleJob = scheduledJobs[0];
  }

  const nextSchedule: INextScheduleCard | null = nextScheduleJob
    ? formatNextScheduleCard(nextScheduleJob, now)
    : null;

  // 2. Metrics / Stat Cards (2x2 Grid)
  const statsCards: IContractorMetricCard[] = [
    {
      key: "pending_review",
      title: "Pending review",
      count: pendingReviewCount,
      subtitle:
        pendingReviewCount === 1
          ? "Needs action"
          : `${pendingReviewCount} need action`,
    },
    {
      key: "assigned_jobs",
      title: "Assigned jobs",
      count: assignedJobsCount,
      subtitle: `${assignedJobsCount} new`,
    },
    {
      key: "in_progress",
      title: "In progress",
      count: inProgressCount,
      subtitle: "Active now",
    },
    {
      key: "completed",
      title: "Completed",
      count: completedThisMonthCount,
      subtitle: "This month",
    },
  ];

  // 3. Profile
  const firstName = contractorUser.name
    ? contractorUser.name.trim().split(" ")[0]
    : "Contractor";

  const contractorProfile: IContractorProfileSummary = {
    id: contractorUser._id.toString(),
    name: contractorUser.name,
    firstName,
    email: contractorUser.email,
    phone: contractorUser.phone || "",
    profileImage: contractorUser.profileImage || "",
    companyName: contractorUser.companyName || "",
    primaryTrade: (contractorUser as any).primaryTrade || "",
  };

  return {
    contractor: contractorProfile,
    unreadNotificationsCount,
    nextSchedule,
    statsCards,
    overview: {
      pendingReviewCount,
      assignedJobsCount,
      inProgressCount,
      completedThisMonthCount,
      totalCompletedCount,
      totalActiveJobs: pendingReviewCount + assignedJobsCount + inProgressCount,
    },
    upcomingJobs: {
      totalCount: upcomingJobs.length,
      items: upcomingJobs.map(formatUpcomingJobItem),
    },
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
  getContractorHomeDashboardFromDB,
};
