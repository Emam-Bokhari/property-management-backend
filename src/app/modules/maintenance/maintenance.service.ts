import mongoose, { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { Maintenance } from "./maintenance.model";
import {
  TAssignContractorPayload,
  TCreateMaintenancePayload,
  TMaintenance,
  TScheduleVisitPayload,
  TSubmitInvoicePayload,
  TCancelMaintenancePayload,
  TPayMaintenancePayload,
  TRejectInvoicePayload,
} from "./maintenance.interface";
import {
  CONTRACTOR_STATUS,
  MAINTENANCE_LOCATION_TYPE,
  MAINTENANCE_REQUESTER,
  MAINTENANCE_STATUS,
  PAYMENT_STATUS,
  maintenanceSearchableFields,
} from "./maintenance.constant";
import {
  getCurrencyCode,
  getCurrencySymbol,
} from "../../../helpers/currencyHelper";
import { USER_ROLES } from "../../../enums/user";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { Tenancy } from "../tenant/tenant.model";
import { TENANCY_STATUS } from "../tenant/tenant.constant";
import { Contractor } from "../contractor/contractor.model";
import { AppOption } from "../appOption/appOption.model";
import { User } from "../user/user.model";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import { logger } from "../../../shared/logger";

const maintenancePopulate = [
  {
    path: "property",
    select: "propertyName streetAddress postCode propertyPhotos city country",
  },
  {
    path: "flat",
    select: "unitName floor floorNote flatPhotos rentPerMonth",
  },
  {
    path: "issueType",
    select: "name type isActive",
  },
  {
    path: "communalArea",
    select: "name type isActive",
  },
  {
    path: "landlord",
    select: "name email phone profileImage companyName",
  },
  {
    path: "tenant",
    select: "name email phone profileImage",
  },
  {
    path: "requestedBy",
    select: "name email phone role profileImage",
  },
  {
    path: "contractor",
    select: "name email phone countryCode profileImage companyName primaryTrade",
  },
  {
    path: "cancelledBy",
    select: "name email phone role profileImage",
  },
];

// Helper to calculate progress step index (0: Reported, 1: Assigned/Scheduled, 2: In Progress, 3: Done)
const calculateProgressStep = (status: MAINTENANCE_STATUS): number => {
  switch (status) {
    case MAINTENANCE_STATUS.PENDING:
      return 0; // Reported
    case MAINTENANCE_STATUS.ASSIGNED:
    case MAINTENANCE_STATUS.SCHEDULED:
    case MAINTENANCE_STATUS.ACCEPTED:
      return 1; // Assigned / Scheduled
    case MAINTENANCE_STATUS.IN_PROGRESS:
    case MAINTENANCE_STATUS.WAITING_APPROVAL:
    case MAINTENANCE_STATUS.INVOICE_REJECTED:
      return 2; // In Progress / Awaiting approval
    case MAINTENANCE_STATUS.COMPLETED:
      return 3; // Done
    case MAINTENANCE_STATUS.CANCELLED:
    case MAINTENANCE_STATUS.REJECTED:
      return -1;
    default:
      return 0;
  }
};

// Helper to format human-readable relative time
const formatTimeAgo = (date?: Date | string | null): string => {
  if (!date) return "";
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  const diffInWeeks = Math.floor(diffInDays / 7);
  return `${diffInWeeks}w ago`;
};


// Helper to extract authenticated user id reliably
const getUserId = (authUser: JwtPayload): string => {
  return (
    authUser.userId ||
    authUser.id ||
    (authUser as any)._id
  )?.toString() || "";
};

// Enhance maintenance object with UI friendly metadata
const enhanceMaintenanceData = (item: any) => {
  const plain = item?.toObject ? item.toObject() : { ...item };
  return {
    ...plain,
    timeAgo: formatTimeAgo(plain.reportedAt || plain.createdAt),
    assignedTimeAgo: plain.assignedDate
      ? formatTimeAgo(plain.assignedDate)
      : null,
    progressStep: calculateProgressStep(plain.status),
  };
};

// 1. Create Maintenance Issue (Tenant or Landlord)
const createMaintenanceIssueIntoDB = async (
  authUser: JwtPayload,
  payload: TCreateMaintenancePayload,
) => {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }
  // Validate issueType exists
  if (!mongoose.Types.ObjectId.isValid(payload.issueType)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid issue type ID");
  }

  const issueOption = await AppOption.findById(payload.issueType);
  if (!issueOption) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Issue type option not found");
  }

  let propertyId: Types.ObjectId;
  let flatId: Types.ObjectId | undefined;
  let landlordId: Types.ObjectId;
  let tenantId: Types.ObjectId | undefined;
  let requesterRole = MAINTENANCE_REQUESTER.LANDLORD;

  // Handle Tenant creation flow
  if (authUser.role === USER_ROLES.TENANT) {
    requesterRole = MAINTENANCE_REQUESTER.TENANT;
    tenantId = new Types.ObjectId(userId);

    // Auto-detect property, flat, and landlord from Tenant's active tenancy
    let tenancy = await Tenancy.findOne({
      tenant: new Types.ObjectId(userId),
      isDeleted: false,
      status: TENANCY_STATUS.ACTIVE,
    });

    if (!tenancy) {
      // Fallback to any latest tenancy
      tenancy = await Tenancy.findOne({
        tenant: new Types.ObjectId(userId),
        isDeleted: false,
      }).sort({ createdAt: -1 });
    }

    if (tenancy) {
      propertyId = tenancy.property as Types.ObjectId;
      flatId = tenancy.flat as Types.ObjectId;
      landlordId = tenancy.landlord as Types.ObjectId;
    } else {
      // Check user record for flat / property
      const tenantUser = await User.findById(userId);
      if (tenantUser?.property && tenantUser?.flat) {
        propertyId = tenantUser.property as Types.ObjectId;
        flatId = tenantUser.flat as Types.ObjectId;
        const prop = await Property.findById(propertyId);
        if (!prop) {
          throw new ApiError(
            StatusCodes.NOT_FOUND,
            "Associated property not found",
          );
        }
        landlordId = prop.landlord as Types.ObjectId;
      } else if (payload.property) {
        if (!mongoose.Types.ObjectId.isValid(payload.property)) {
          throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
        }
        propertyId = new Types.ObjectId(payload.property);
        const prop = await Property.findById(propertyId);
        if (!prop) {
          throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
        }
        landlordId = prop.landlord as Types.ObjectId;
        if (payload.flat && mongoose.Types.ObjectId.isValid(payload.flat)) {
          flatId = new Types.ObjectId(payload.flat);
        }
      } else {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          "No active tenancy or property found for this tenant",
        );
      }
    }
  } else {
    // Landlord / Admin creation flow
    requesterRole = MAINTENANCE_REQUESTER.LANDLORD;
    landlordId = new Types.ObjectId(userId);

    if (
      !payload.property ||
      !mongoose.Types.ObjectId.isValid(payload.property)
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Valid property ID is required",
      );
    }

    propertyId = new Types.ObjectId(payload.property);
    const prop = await Property.findById(propertyId);
    if (!prop) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
    }

    // Verify ownership if not admin
    const currentUserId = userId;
    if (
      authUser.role === USER_ROLES.LANDLORD &&
      prop.landlord?.toString() !== currentUserId
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission for this property",
      );
    }

    // If location is Unit, flat is required
    const locationType = payload.locationType || MAINTENANCE_LOCATION_TYPE.UNIT;

    if (locationType === MAINTENANCE_LOCATION_TYPE.UNIT) {
      if (!payload.flat || !mongoose.Types.ObjectId.isValid(payload.flat)) {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          "Flat ID is required when location is Unit",
        );
      }
      flatId = new Types.ObjectId(payload.flat);

      const flatDoc = await Flat.findById(flatId);
      if (!flatDoc || flatDoc.property.toString() !== propertyId.toString()) {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          "Flat does not belong to the selected property",
        );
      }

      // Check if flat has an active tenant
      const activeTenancy = await Tenancy.findOne({
        flat: flatId,
        isDeleted: false,
        status: TENANCY_STATUS.ACTIVE,
      });

      if (activeTenancy) {
        tenantId = activeTenancy.tenant as Types.ObjectId;
      } else if (flatDoc.tenant) {
        tenantId = flatDoc.tenant as Types.ObjectId;
      }
    } else {
      // Communal location
      if (
        payload.communalArea &&
        mongoose.Types.ObjectId.isValid(payload.communalArea)
      ) {
        const communalOpt = await AppOption.findById(payload.communalArea);
        if (!communalOpt) {
          throw new ApiError(
            StatusCodes.NOT_FOUND,
            "Communal area option not found",
          );
        }
      }
    }
  }

  // Parse attachments (support attachments, attachment, images, image, photos)
  let attachments: string[] = [];
  const rawAttachments =
    payload.attachments ??
    payload.attachment ??
    (payload as any).images ??
    (payload as any).image ??
    (payload as any).photos;

  if (Array.isArray(rawAttachments)) {
    attachments = rawAttachments
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .filter((item) => typeof item === "string" && item.length > 0);
  } else if (typeof rawAttachments === "string" && rawAttachments.trim()) {
    const trimmed = rawAttachments.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          attachments = parsed
            .map((item) => (typeof item === "string" ? item.trim() : item))
            .filter((item) => typeof item === "string" && item.length > 0);
        }
      } catch {
        attachments = [trimmed];
      }
    } else {
      attachments = [trimmed];
    }
  }

  const maintenanceData = {
    issueTitle: payload.issueTitle.trim(),
    issueType: new Types.ObjectId(payload.issueType),
    priority: payload.priority,
    description: payload.description.trim(),
    attachments,
    locationType: payload.locationType || MAINTENANCE_LOCATION_TYPE.UNIT,
    communalArea: payload.communalArea
      ? new Types.ObjectId(payload.communalArea)
      : undefined,
    locationInProperty: payload.locationInProperty,
    property: propertyId,
    flat: flatId,
    requestedBy: new Types.ObjectId(userId),
    requesterRole,
    landlord: landlordId,
    tenant: tenantId,
    paidBy: payload.paidBy,
    status: MAINTENANCE_STATUS.PENDING,
    reportedAt: new Date(),
  };

  const createdIssue = await Maintenance.create(maintenanceData);

  const populatedIssue = await Maintenance.findById(createdIssue._id).populate(
    maintenancePopulate,
  );

  // Trigger push/in-app notifications based on preference settings
  try {
    const propDoc = populatedIssue?.property as any;
    const propertyTitle = propDoc?.propertyName || "your property";

    if (requesterRole === MAINTENANCE_REQUESTER.TENANT) {
      // Notify Landlord about new maintenance issue (maintenanceUpdates)
      await sendNotifications({
        receiver: landlordId,
        sender: userId,
        type: NOTIFICATION_TYPE.MAINTENANCE_UPDATE,
        title: "New Maintenance Request",
        text: `Tenant reported an issue: "${createdIssue.issueTitle}" for ${propertyTitle}.`,
        referenceId: createdIssue._id,
        referenceModel: "Maintenance",
      });
    } else if (requesterRole === MAINTENANCE_REQUESTER.LANDLORD && tenantId) {
      // Notify Tenant that landlord scheduled maintenance (maintenanceUpdates)
      await sendNotifications({
        receiver: tenantId,
        sender: userId,
        type: NOTIFICATION_TYPE.MAINTENANCE_UPDATE,
        title: "Maintenance Issue Logged",
        text: `Maintenance has been scheduled for "${createdIssue.issueTitle}" at ${propertyTitle}.`,
        referenceId: createdIssue._id,
        referenceModel: "Maintenance",
      });
    }
  } catch (notifErr) {
    logger.error(
      "Failed to dispatch maintenance creation notification:",
      notifErr,
    );
  }

  return enhanceMaintenanceData(populatedIssue);
};

// 2. Get All Maintenance Issues (Role-Based SaaS Filtering)
const getAllMaintenanceFromDB = async (
  authUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  const userId = getUserId(authUser);
  const queryCopy = { ...query };
  const filter: Record<string, any> = { isDeleted: { $ne: true } };

  // Role Scoping
  if (authUser.role === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(userId);

    // Tab filtering for Landlord
    if (queryCopy.tab === "tenant_reports") {
      filter.requesterRole = MAINTENANCE_REQUESTER.TENANT;
    } else if (queryCopy.tab === "my_logs") {
      filter.requesterRole = MAINTENANCE_REQUESTER.LANDLORD;
    }
  } else if (authUser.role === USER_ROLES.TENANT) {
    // Tenant view
    filter.tenant = new Types.ObjectId(userId);
  } else if (authUser.role === USER_ROLES.CONTRACTOR) {
    // Contractor view
    filter.contractor = new Types.ObjectId(userId);

    const normalizedTab =
      typeof queryCopy.tab === "string"
        ? queryCopy.tab.trim().toLowerCase()
        : "";

    if (normalizedTab === CONTRACTOR_STATUS.PENDING) {
      filter.status = {
        $in: [MAINTENANCE_STATUS.ASSIGNED, MAINTENANCE_STATUS.PENDING],
      };
    } else if (normalizedTab === CONTRACTOR_STATUS.SCHEDULED) {
      filter.status = MAINTENANCE_STATUS.SCHEDULED;
    } else if (normalizedTab === CONTRACTOR_STATUS.IN_PROGRESS) {
      filter.status = {
        $in: [
          MAINTENANCE_STATUS.IN_PROGRESS,
          MAINTENANCE_STATUS.WAITING_APPROVAL,
          MAINTENANCE_STATUS.INVOICE_REJECTED,
        ],
      };
    } else if (normalizedTab === CONTRACTOR_STATUS.COMPLETED) {
      filter.status = MAINTENANCE_STATUS.COMPLETED;
    } else if (
      normalizedTab &&
      Object.values(CONTRACTOR_STATUS).includes(
        normalizedTab as CONTRACTOR_STATUS,
      )
    ) {
      filter.contractorStatus = normalizedTab;
    }
  }

  // Handle property & flat direct filters
  if (queryCopy.property) {
    filter.property = new Types.ObjectId(queryCopy.property as string);
    delete queryCopy.property;
  }

  if (queryCopy.flat) {
    filter.flat = new Types.ObjectId(queryCopy.flat as string);
    delete queryCopy.flat;
  }

  // Handle contractorStatus enum filter
  if (queryCopy.contractorStatus) {
    const normalizedContractorStatus = String(queryCopy.contractorStatus)
      .trim()
      .toLowerCase();
    const validContractorStatuses = Object.values(CONTRACTOR_STATUS) as string[];
    if (!validContractorStatuses.includes(normalizedContractorStatus)) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Invalid contractorStatus. Allowed values: ${validContractorStatuses.join(", ")}`,
      );
    }
    filter.contractorStatus = normalizedContractorStatus;
    delete queryCopy.contractorStatus;
  }

  // Handle status filter
  if (queryCopy.status) {
    if (queryCopy.status === "open") {
      filter.status = {
        $in: [
          MAINTENANCE_STATUS.PENDING,
          MAINTENANCE_STATUS.ASSIGNED,
          MAINTENANCE_STATUS.SCHEDULED,
        ],
      };
    } else if (queryCopy.status === "needs_contractor") {
      filter.status = MAINTENANCE_STATUS.PENDING;
      filter.contractor = { $exists: false };
    } else {
      filter.status = queryCopy.status;
    }
    delete queryCopy.status;
  }

  // Handle priority filter
  if (queryCopy.priority) {
    filter.priority = queryCopy.priority;
    delete queryCopy.priority;
  }

  delete queryCopy.tab;

  // Base query with populations
  const baseQuery = Maintenance.find(filter).populate(maintenancePopulate);

  const queryBuilder = new QueryBuilder(baseQuery, queryCopy)
    .search(maintenanceSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [issues, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  // Tab summary counts for Landlord / Contractor
  let summary: Record<string, any> | undefined;
  if (authUser.role === USER_ROLES.LANDLORD) {
    const landlordId = new Types.ObjectId(userId);
    const [allCount, tenantReportsCount, myLogsCount] = await Promise.all([
      Maintenance.countDocuments({ landlord: landlordId, isDeleted: false }),
      Maintenance.countDocuments({
        landlord: landlordId,
        requesterRole: MAINTENANCE_REQUESTER.TENANT,
        isDeleted: false,
      }),
      Maintenance.countDocuments({
        landlord: landlordId,
        requesterRole: MAINTENANCE_REQUESTER.LANDLORD,
        isDeleted: false,
      }),
    ]);
    summary = {
      all: allCount,
      tenantReports: tenantReportsCount,
      myLogs: myLogsCount,
    };
  } else if (authUser.role === USER_ROLES.CONTRACTOR) {
    const contractorId = new Types.ObjectId(userId);
    const contractorNotDeleted = {
      contractor: contractorId,
      isDeleted: { $ne: true },
    };
    const [
      allCount,
      pendingCount,
      scheduledCount,
      inProgressCount,
      completedCount,
      contractorStatusAgg,
    ] = await Promise.all([
      Maintenance.countDocuments(contractorNotDeleted),
      Maintenance.countDocuments({
        ...contractorNotDeleted,
        status: {
          $in: [MAINTENANCE_STATUS.ASSIGNED, MAINTENANCE_STATUS.PENDING],
        },
      }),
      Maintenance.countDocuments({
        ...contractorNotDeleted,
        status: MAINTENANCE_STATUS.SCHEDULED,
      }),
      Maintenance.countDocuments({
        ...contractorNotDeleted,
        status: {
          $in: [
            MAINTENANCE_STATUS.IN_PROGRESS,
            MAINTENANCE_STATUS.WAITING_APPROVAL,
            MAINTENANCE_STATUS.INVOICE_REJECTED,
          ],
        },
      }),
      Maintenance.countDocuments({
        ...contractorNotDeleted,
        status: MAINTENANCE_STATUS.COMPLETED,
      }),
      Maintenance.aggregate([
        { $match: contractorNotDeleted },
        { $group: { _id: "$contractorStatus", count: { $sum: 1 } } },
      ]),
    ]);

    const byContractorStatus = Object.values(CONTRACTOR_STATUS).reduce(
      (acc, st) => {
        const found = contractorStatusAgg.find((item: any) => item._id === st);
        acc[st] = found ? found.count : 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    summary = {
      all: allCount,
      pending: pendingCount,
      scheduled: scheduledCount,
      inProgress: inProgressCount,
      completed: completedCount,
      contractorStatusCounts: byContractorStatus,
      contractorStatusEnums: Object.values(CONTRACTOR_STATUS),
    };
  }

  const enhancedData = issues.map((item: any) => enhanceMaintenanceData(item));

  // Ensure contractor phone number is populated from Contractor model if missing on User
  const missingPhoneContractorIds = Array.from(
    new Set(
      enhancedData
        .filter(
          (item: any) =>
            item.contractor &&
            typeof item.contractor === "object" &&
            !item.contractor.phone &&
            item.contractor._id &&
            mongoose.Types.ObjectId.isValid(item.contractor._id.toString()),
        )
        .map((item: any) => item.contractor._id.toString()),
    ),
  );

  if (missingPhoneContractorIds.length > 0) {
    const objectIds = missingPhoneContractorIds.map(
      (cid) => new Types.ObjectId(cid),
    );
    const contractorDocs = await Contractor.find({
      $or: [{ contractor: { $in: objectIds } }, { _id: { $in: objectIds } }],
      isDeleted: false,
    })
      .select("contractor phone")
      .lean();

    const phoneMap = new Map<string, string>();
    for (const doc of contractorDocs) {
      if (doc.phone) {
        if (doc.contractor) {
          phoneMap.set(doc.contractor.toString(), doc.phone);
        }
        phoneMap.set(doc._id.toString(), doc.phone);
      }
    }

    for (const item of enhancedData) {
      if (item.contractor && typeof item.contractor === "object") {
        const cid = item.contractor._id?.toString();
        item.contractor.phone =
          item.contractor.phone || (cid ? phoneMap.get(cid) : "") || "";
      }
    }
  }

  return {
    meta: {
      ...meta,
      summary,
    },
    data: enhancedData,
  };
};

// 3. Get Single Maintenance Issue
const getSingleMaintenanceFromDB = async (authUser: JwtPayload, id: string) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id).populate(maintenancePopulate);
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  // Access control
  if (
    authUser.role === USER_ROLES.LANDLORD &&
    issue.landlord._id?.toString() !== userId && issue.landlord.toString() !== userId
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have access to this maintenance issue",
    );
  }

  if (
    authUser.role === USER_ROLES.TENANT &&
    issue.tenant?._id?.toString() !== userId &&
    issue.tenant?.toString() !== userId &&
    issue.requestedBy?._id?.toString() !== userId &&
    issue.requestedBy?.toString() !== userId
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have access to this maintenance issue",
    );
  }

  if (
    authUser.role === USER_ROLES.CONTRACTOR &&
    issue.contractor?._id?.toString() !== userId && issue.contractor?.toString() !== userId
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have access to this maintenance issue",
    );
  }

  const enhanced = enhanceMaintenanceData(issue);

  // Ensure contractor phone number is populated in the returned data
  if (enhanced.contractor) {
    const contractorUserId =
      (enhanced.contractor as any)?._id?.toString() ||
      enhanced.contractor.toString();

    let phone = (enhanced.contractor as any)?.phone || "";

    // If phone is missing on User model, query the Contractor relationship model
    if (!phone && contractorUserId && mongoose.Types.ObjectId.isValid(contractorUserId)) {
      const contractorDoc = await Contractor.findOne({
        $or: [
          { contractor: new Types.ObjectId(contractorUserId) },
          { _id: new Types.ObjectId(contractorUserId) },
        ],
        isDeleted: false,
      }).select("phone");

      if (contractorDoc?.phone) {
        phone = contractorDoc.phone;
      }
    }

    if (typeof enhanced.contractor === "object") {
      enhanced.contractor.phone = phone || "";
    }
  }

  return enhanced;
};

// 4. Get Suggested Contractors for an Issue (Top 3 + Full List)
const getSuggestedContractorsFromDB = async (
  authUser: JwtPayload,
  id: string,
) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id).populate("issueType");
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  if (
    authUser.role === USER_ROLES.LANDLORD &&
    issue.landlord.toString() !== userId && (issue.landlord as any)._id?.toString() !== userId
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission for this maintenance issue",
    );
  }

  if (
    authUser.role === USER_ROLES.TENANT &&
    issue.tenant?._id?.toString() !== userId &&
    issue.tenant?.toString() !== userId &&
    issue.requestedBy?._id?.toString() !== userId &&
    issue.requestedBy?.toString() !== userId
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission for this maintenance issue",
    );
  }

  const issueTypeId = issue.issueType?._id?.toString();
  const issueTypeName = (issue.issueType as any)?.name || "";

  // Extract trade keywords from issue title or issueType name (e.g. "Plumber", "Electrician", "Decorator")
  const issueWords = issueTypeName
    .toLowerCase()
    .split(/[\s—\-/,]+/)
    .filter(Boolean);

  // Fetch all contractors connected to this landlord
  const contractors = await Contractor.find({
    landlord: issue.landlord,
    isDeleted: false,
  }).populate([
    {
      path: "trades",
      select: "name type",
    },
    {
      path: "contractor",
      select: "name email phone profileImage companyName primaryTrade",
    },
  ]);

  // Score & sort contractors based on matching trade
  const suggested: any[] = [];
  const other: any[] = [];

  contractors.forEach((c) => {
    const plain = c.toObject();
    const tradeIds = (plain.trades || []).map((t: any) =>
      t._id ? t._id.toString() : t.toString(),
    );
    const tradeNames = (plain.trades || []).map((t: any) =>
      (t.name || "").toLowerCase(),
    );

    let isMatch = false;

    // Direct trade ID match
    if (issueTypeId && tradeIds.includes(issueTypeId)) {
      isMatch = true;
    }

    // Name keyword match
    if (!isMatch && issueWords.length > 0) {
      isMatch = tradeNames.some((tradeName: string) =>
        issueWords.some(
          (word: string) =>
            tradeName.includes(word) || word.includes(tradeName),
        ),
      );
    }

    const contractorUser = plain.contractor as any;
    const contractorItem = {
      _id: plain._id,
      contractorId: contractorUser?._id || plain.contractor,
      name: plain.name || contractorUser?.name,
      companyName: plain.companyName || contractorUser?.companyName,
      email: plain.email || contractorUser?.email,
      phone: plain.phone || contractorUser?.phone,
      trades: plain.trades,
      rating: plain.rating || 0,
      totalReviews: plain.totalReviews || 0,
      isSuggested: isMatch,
    };

    if (isMatch) {
      suggested.push(contractorItem);
    } else {
      other.push(contractorItem);
    }
  });

  return {
    issueId: issue._id,
    jobId: issue.jobId,
    issueType: issue.issueType,
    suggestedCount: suggested.length,
    suggested: suggested.slice(0, 3), // Top 3 matching contractors
    allSuggested: suggested,
    allContractors: [...suggested, ...other],
  };
};

// 5. Assign Contractor (Landlord)
const assignContractorIntoDB = async (
  authUser: JwtPayload,
  id: string,
  payload: TAssignContractorPayload,
) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  if (!mongoose.Types.ObjectId.isValid(payload.contractor)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid contractor ID");
  }

  const issue = await Maintenance.findById(id);
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  if (
    authUser.role === USER_ROLES.LANDLORD &&
    issue.landlord.toString() !== userId
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to assign contractors to this issue",
    );
  }

  // Check if target user is valid (support both User._id and Contractor._id)
  let contractorUser = await User.findById(payload.contractor);
  let resolvedContractorUserId = payload.contractor;

  if (!contractorUser && mongoose.Types.ObjectId.isValid(payload.contractor)) {
    const contractorDoc = await Contractor.findById(payload.contractor);
    if (contractorDoc) {
      resolvedContractorUserId = contractorDoc.contractor.toString();
      contractorUser = await User.findById(resolvedContractorUserId);
    }
  }

  if (!contractorUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Contractor not found");
  }

  issue.contractor = new Types.ObjectId(resolvedContractorUserId);
  issue.contractorStatus = CONTRACTOR_STATUS.PENDING;
  issue.assignedDate = new Date();
  issue.status = MAINTENANCE_STATUS.ASSIGNED;
  if (payload.notes) {
    issue.scheduleNotes = payload.notes;
  }

  await issue.save();

  // Notify Contractor (jobUpdates) & Tenant (maintenanceUpdates)
  try {
    // 1. Notify contractor about job assignment
    await sendNotifications({
      receiver: payload.contractor,
      sender: userId,
      type: NOTIFICATION_TYPE.JOB_UPDATE,
      title: "New Maintenance Job Assigned",
      text: `You have been assigned to maintenance job "${issue.issueTitle}".`,
      referenceId: issue._id,
      referenceModel: "Maintenance",
    });

    // 2. Notify tenant that a contractor was assigned
    if (issue.tenant) {
      await sendNotifications({
        receiver: issue.tenant,
        sender: userId,
        type: NOTIFICATION_TYPE.MAINTENANCE_UPDATE,
        title: "Maintenance Contractor Assigned",
        text: `A contractor has been assigned to your maintenance request "${issue.issueTitle}".`,
        referenceId: issue._id,
        referenceModel: "Maintenance",
      });
    }
  } catch (notifErr) {
    logger.error(
      "Failed to dispatch contractor assignment notifications:",
      notifErr,
    );
  }

  const updatedIssue =
    await Maintenance.findById(id).populate(maintenancePopulate);
  return enhanceMaintenanceData(updatedIssue);
};

// 6. Contractor: Schedule Visit (Accept & Confirm Date/Time)
const contractorScheduleVisitIntoDB = async (
  authUser: JwtPayload,
  id: string,
  payload: TScheduleVisitPayload,
) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id);
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  if (issue.contractor?.toString() !== userId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not the assigned contractor for this job",
    );
  }

  issue.scheduledDate = new Date(payload.visitDate);
  issue.scheduledTime = payload.visitTime;
  if (payload.notes) {
    issue.scheduleNotes = payload.notes;
  }
  issue.contractorStatus = CONTRACTOR_STATUS.SCHEDULED;
  issue.status = MAINTENANCE_STATUS.SCHEDULED;

  await issue.save();

  // Notify Tenant and Landlord about confirmed visit date/time (maintenanceUpdates)
  try {
    const formattedDate = new Date(payload.visitDate).toLocaleDateString();
    const timeSlot = payload.visitTime || "the agreed time";

    if (issue.tenant) {
      await sendNotifications({
        receiver: issue.tenant,
        sender: userId,
        type: NOTIFICATION_TYPE.MAINTENANCE_UPDATE,
        title: "Maintenance Visit Scheduled",
        text: `Contractor visit for "${issue.issueTitle}" is confirmed for ${formattedDate} at ${timeSlot}.`,
        referenceId: issue._id,
        referenceModel: "Maintenance",
      });
    }

    if (issue.landlord) {
      await sendNotifications({
        receiver: issue.landlord,
        sender: userId,
        type: NOTIFICATION_TYPE.MAINTENANCE_UPDATE,
        title: "Maintenance Visit Scheduled",
        text: `Contractor scheduled a visit for "${issue.issueTitle}" on ${formattedDate} at ${timeSlot}.`,
        referenceId: issue._id,
        referenceModel: "Maintenance",
      });
    }
  } catch (notifErr) {
    logger.error("Failed to dispatch visit schedule notifications:", notifErr);
  }

  const updatedIssue =
    await Maintenance.findById(id).populate(maintenancePopulate);
  return enhanceMaintenanceData(updatedIssue);
};

// 7. Contractor: Reject Job
const contractorRejectJobIntoDB = async (authUser: JwtPayload, id: string) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id);
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  if (issue.contractor?.toString() !== userId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not the assigned contractor for this job",
    );
  }

  issue.contractor = undefined;
  issue.contractorStatus = CONTRACTOR_STATUS.DECLINED;
  issue.status = MAINTENANCE_STATUS.PENDING;

  await issue.save();

  const updatedIssue =
    await Maintenance.findById(id).populate(maintenancePopulate);
  return enhanceMaintenanceData(updatedIssue);
};

// 8. Contractor: Start Job (On-Site Execution)
const contractorStartJobIntoDB = async (authUser: JwtPayload, id: string) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id);
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  if (issue.contractor?.toString() !== userId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not the assigned contractor for this job",
    );
  }

  issue.startedAt = new Date();
  issue.contractorStatus = CONTRACTOR_STATUS.IN_PROGRESS;
  issue.status = MAINTENANCE_STATUS.IN_PROGRESS;

  await issue.save();

  const updatedIssue =
    await Maintenance.findById(id).populate(maintenancePopulate);
  return enhanceMaintenanceData(updatedIssue);
};

// 9. Contractor: Finish & Submit Invoice
const contractorSubmitInvoiceIntoDB = async (
  authUser: JwtPayload,
  id: string,
  payload: TSubmitInvoicePayload,
) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id);
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  if (issue.contractor?.toString() !== userId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not the assigned contractor for this job",
    );
  }

  issue.invoiceAmount = payload.invoiceAmount;
  issue.invoiceAmounts = payload.invoiceAmount;
  issue.invoiceNotes = payload.invoiceNotes || payload.notes || "";
  issue.notes = payload.notes || payload.invoiceNotes || "";

  if (payload.certificates) {
    const certs = Array.isArray(payload.certificates)
      ? payload.certificates
      : [payload.certificates];
    issue.certificates = [...(issue.certificates || []), ...certs];
  }

  if (payload.completionPhotos) {
    const photos = Array.isArray(payload.completionPhotos)
      ? payload.completionPhotos
      : [payload.completionPhotos];
    issue.completionPhotos = [...(issue.completionPhotos || []), ...photos];
  }

  if (payload.completionNotes) {
    issue.completionNotes = payload.completionNotes;
  }

  issue.completedAt = new Date();
  issue.contractorStatus = CONTRACTOR_STATUS.INVOICE_SUBMITTED;
  issue.status = MAINTENANCE_STATUS.WAITING_APPROVAL;
  issue.invoiceStatus = "submitted";
  issue.paymentStatus = PAYMENT_STATUS.UNPAID;
  issue.rejectionReason = undefined;
  issue.rejectedAt = undefined;

  await issue.save();

  // Notify Landlord about invoice submission (maintenanceUpdates)
  try {
    if (issue.landlord) {
      await sendNotifications({
        receiver: issue.landlord,
        sender: userId,
        type: NOTIFICATION_TYPE.MAINTENANCE_UPDATE,
        title: "Maintenance Invoice Submitted",
        text: `Contractor has submitted an invoice of ${getCurrencySymbol()}${payload.invoiceAmount} for "${issue.issueTitle}".`,
        referenceId: issue._id,
        referenceModel: "Maintenance",
      });
    }
  } catch (notifErr) {
    logger.error(
      "Failed to dispatch invoice submission notification:",
      notifErr,
    );
  }

  const updatedIssue =
    await Maintenance.findById(id).populate(maintenancePopulate);
  return enhanceMaintenanceData(updatedIssue);
};

// 10. Cancel Maintenance Issue (Landlord or Reporting Tenant)
const cancelMaintenanceIntoDB = async (
  authUser: JwtPayload,
  id: string,
  payload: TCancelMaintenancePayload,
) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id);
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  // Only Landlord, reporting Tenant, or Admin can cancel
  const isLandlord =
    authUser.role === USER_ROLES.LANDLORD &&
    issue.landlord.toString() === userId;
  const isReporter = issue.requestedBy.toString() === userId;
  const isAdmin =
    authUser.role === USER_ROLES.ADMIN ||
    authUser.role === USER_ROLES.SUPER_ADMIN;

  if (!isLandlord && !isReporter && !isAdmin) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to cancel this issue",
    );
  }

  if (issue.status === MAINTENANCE_STATUS.COMPLETED) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Completed issues cannot be cancelled",
    );
  }

  issue.status = MAINTENANCE_STATUS.CANCELLED;
  issue.cancelledAt = new Date();
  issue.cancelledBy = new Types.ObjectId(userId);
  issue.cancellationReason = payload.cancellationReason || "Cancelled by user";

  await issue.save();

  const updatedIssue =
    await Maintenance.findById(id).populate(maintenancePopulate);
  return enhanceMaintenanceData(updatedIssue);
};

// 11. Generic Update Maintenance (Landlord / Admin)
const updateMaintenanceIntoDB = async (
  authUser: JwtPayload,
  id: string,
  payload: Partial<TMaintenance>,
) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id);
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  if (
    authUser.role === USER_ROLES.LANDLORD &&
    issue.landlord.toString() !== userId
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to edit this issue",
    );
  }

  const result = await Maintenance.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  }).populate(maintenancePopulate);

  return enhanceMaintenanceData(result);
};

// 12. Delete Maintenance Issue (Soft Delete)
const deleteMaintenanceFromDB = async (authUser: JwtPayload, id: string) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id);
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  if (
    authUser.role === USER_ROLES.LANDLORD &&
    issue.landlord.toString() !== userId
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to delete this issue",
    );
  }

  const result = await Maintenance.softDeleteById(id);
  return result;
};

// 13. Create Stripe Payment Checkout Session (Landlord / Tenant)
const createPaymentSessionIntoDB = async (
  authUser: JwtPayload,
  id: string,
  payload: TPayMaintenancePayload,
) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id).populate([
    { path: "property", select: "propertyName" },
    { path: "flat", select: "unitName" },
    { path: "contractor", select: "name email phone profileImage" },
  ]);

  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  const isLandlord =
    authUser.role === USER_ROLES.LANDLORD &&
    issue.landlord.toString() === userId;
  const isTenant =
    authUser.role === USER_ROLES.TENANT &&
    (issue.tenant?.toString() === userId ||
      issue.requestedBy.toString() === userId);
  const isAdmin =
    authUser.role === USER_ROLES.ADMIN ||
    authUser.role === USER_ROLES.SUPER_ADMIN;

  if (!isLandlord && !isTenant && !isAdmin) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to pay for this maintenance issue",
    );
  }

  if (issue.paymentStatus === PAYMENT_STATUS.PAID) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "This maintenance issue has already been paid",
    );
  }

  const amount = issue.invoiceAmount || issue.invoiceAmounts;
  if (!amount || amount <= 0) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "No valid invoice amount submitted by the contractor yet",
    );
  }

  const secretKey = config.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "Stripe secret key is not configured on the server",
    );
  }

  const stripe = new Stripe(secretKey);

  const clientBaseUrl = config.client_url || "http://localhost:3000";
  const successUrl =
    payload.successUrl ||
    `${clientBaseUrl}/maintenance/payment-success?session_id={CHECKOUT_SESSION_ID}&issue_id=${issue._id}`;
  const cancelUrl =
    payload.cancelUrl ||
    `${clientBaseUrl}/maintenance/payment-cancel?issue_id=${issue._id}`;

  const currency = getCurrencyCode();

  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: `Maintenance: ${issue.issueTitle}`,
            description: `Job ID: ${issue.jobId || issue._id} | Flat: ${(issue.flat as any)?.unitName || "N/A"}`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: issue._id.toString(),
    metadata: {
      paymentType: "maintenance",
      maintenanceId: issue._id.toString(),
      payerId: userId,
      payerRole: authUser.role,
      contractorId:
        (issue.contractor as any)?._id?.toString() ||
        issue.contractor?.toString() ||
        "",
      invoiceAmount: amount.toString(),
      jobId: issue.jobId || "",
    },
  });

  issue.stripeSessionId = session.id;
  await issue.save();

  return {
    paymentUrl: session.url,
    sessionId: session.id,
    amount,
    currency,
    jobId: issue.jobId,
    issueTitle: issue.issueTitle,
  };
};

// 14. Reject Contractor Invoice (Landlord / Tenant)
const rejectInvoiceIntoDB = async (
  authUser: JwtPayload,
  id: string,
  payload: TRejectInvoicePayload,
) => {
  const userId = getUserId(authUser);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid maintenance issue ID");
  }

  const issue = await Maintenance.findById(id);
  if (!issue || issue.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Maintenance issue not found");
  }

  const isLandlord =
    authUser.role === USER_ROLES.LANDLORD &&
    issue.landlord.toString() === userId;
  const isTenant =
    authUser.role === USER_ROLES.TENANT &&
    (issue.tenant?.toString() === userId ||
      issue.requestedBy.toString() === userId);
  const isAdmin =
    authUser.role === USER_ROLES.ADMIN ||
    authUser.role === USER_ROLES.SUPER_ADMIN;

  if (!isLandlord && !isTenant && !isAdmin) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to reject this invoice",
    );
  }

  if (issue.paymentStatus === PAYMENT_STATUS.PAID) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Paid maintenance issues cannot have invoice rejected",
    );
  }

  issue.status = MAINTENANCE_STATUS.INVOICE_REJECTED;
  issue.contractorStatus = CONTRACTOR_STATUS.INVOICE_REJECTED;
  issue.invoiceStatus = "rejected";
  issue.rejectionReason = payload.rejectionReason;
  issue.rejectedAt = new Date();

  await issue.save();

  const updatedIssue =
    await Maintenance.findById(id).populate(maintenancePopulate);
  return enhanceMaintenanceData(updatedIssue);
};

// 15. Handle Maintenance Payment Success (Called by Root Stripe Webhook)
const handleMaintenancePaymentSuccess = async (
  session: Stripe.Checkout.Session,
) => {
  const maintenanceId =
    session.metadata?.maintenanceId || session.client_reference_id;

  if (!maintenanceId || !mongoose.Types.ObjectId.isValid(maintenanceId)) {
    return false;
  }

  const issue = await Maintenance.findById(maintenanceId);
  if (!issue || issue.isDeleted) {
    return false;
  }

  issue.paymentStatus = PAYMENT_STATUS.PAID;
  issue.paidAt = new Date();
  issue.status = MAINTENANCE_STATUS.COMPLETED;
  issue.contractorStatus = CONTRACTOR_STATUS.COMPLETED;
  issue.completedAt = issue.completedAt || new Date();
  issue.invoiceStatus = "approved";
  issue.transactionId =
    (typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.id) || session.id;

  await issue.save();
  return true;
};

export const MaintenanceService = {
  createMaintenanceIssueIntoDB,
  getAllMaintenanceFromDB,
  getSingleMaintenanceFromDB,
  getSuggestedContractorsFromDB,
  assignContractorIntoDB,
  contractorScheduleVisitIntoDB,
  contractorRejectJobIntoDB,
  contractorStartJobIntoDB,
  contractorSubmitInvoiceIntoDB,
  cancelMaintenanceIntoDB,
  updateMaintenanceIntoDB,
  deleteMaintenanceFromDB,
  createPaymentSessionIntoDB,
  rejectInvoiceIntoDB,
  handleMaintenancePaymentSuccess,
};
