import mongoose, { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { Announcement } from "./announcement.model";
import { TAnnouncement } from "./announcement.interface";
import {
  VISIBILITY_SCOPE,
  announcementSearchableFields,
} from "./announcement.constant";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { User } from "../user/user.model";
import { STATUS, USER_ROLES } from "../../../enums/user";
import { notificationHelper } from "../../builder/pushNotification";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import unlinkFile from "../../../shared/unlinkFile";

// Helper: resolve target tenant IDs for a property / flats
const resolveTargetTenants = async (
  propertyId: Types.ObjectId | string,
  visibilityScope: VISIBILITY_SCOPE,
  flats?: (Types.ObjectId | string)[],
  excludeUserId?: string,
): Promise<Types.ObjectId[]> => {
  let targetFlats: any[] = [];

  if (
    visibilityScope === VISIBILITY_SCOPE.SELECTED_FLATS &&
    flats &&
    flats.length > 0
  ) {
    targetFlats = await Flat.find({
      _id: { $in: flats },
      property: propertyId,
      isDeleted: false,
    });
  } else {
    targetFlats = await Flat.find({
      property: propertyId,
      isDeleted: false,
    });
  }

  const flatIds = targetFlats.map((f) => f._id);
  const recipientSet = new Set<string>();

  // 1. From flat documents (tenant or tenants fields)
  for (const flat of targetFlats) {
    if (flat.tenant) {
      recipientSet.add(flat.tenant.toString());
    }
    if (Array.isArray(flat.tenants)) {
      flat.tenants.forEach((t: any) => {
        if (t) recipientSet.add(t.toString());
      });
    }
  }

  // 2. From User collection (role: TENANT linked to property or flat)
  const userConditions: Record<string, any>[] = [];
  if (visibilityScope === VISIBILITY_SCOPE.ENTIRE_PROPERTY) {
    userConditions.push({ property: propertyId });
  }
  if (flatIds.length > 0) {
    userConditions.push({ flat: { $in: flatIds } });
  }

  if (userConditions.length > 0) {
    const tenantUsers = await User.find({
      role: USER_ROLES.TENANT,
      $or: userConditions,
      status: STATUS.ACTIVE,
      isDeleted: false,
    }).select("_id");

    tenantUsers.forEach((u) => recipientSet.add(u._id.toString()));
  }

  if (excludeUserId) {
    recipientSet.delete(excludeUserId);
  }

  return Array.from(recipientSet).map((id) => new Types.ObjectId(id));
};

// 1. Create Announcement
const createAnnouncementToDB = async (
  userId: string,
  payload: Partial<TAnnouncement>,
): Promise<TAnnouncement> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid user ID");
  }

  if (
    !payload.property ||
    !mongoose.Types.ObjectId.isValid(payload.property.toString())
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Valid property ID is required",
    );
  }

  const propertyDoc = await Property.findById(payload.property);
  if (!propertyDoc || (propertyDoc as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  // Check landlord ownership (if landlord)
  if (propertyDoc.landlord && propertyDoc.landlord.toString() !== userId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to create an announcement for this property",
    );
  }

  // Validate flats if selected_flats
  if (payload.visibilityScope === VISIBILITY_SCOPE.SELECTED_FLATS) {
    if (!payload.flats || payload.flats.length === 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Please select at least one flat for this announcement",
      );
    }

    const flatsInProperty = await Flat.find({
      _id: { $in: payload.flats },
      property: payload.property,
      isDeleted: false,
    });

    if (flatsInProperty.length !== payload.flats.length) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Some selected flats do not belong to the chosen property",
      );
    }
  }

  // Resolve target tenants
  const recipientIds = await resolveTargetTenants(
    payload.property,
    payload.visibilityScope || VISIBILITY_SCOPE.ENTIRE_PROPERTY,
    payload.flats,
    userId,
  );

  payload.landlord = new Types.ObjectId(userId);
  payload.recipients = recipientIds;

  const result = await Announcement.create(payload);

  if (!result) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to create announcement",
    );
  }

  // Send push notification & in-app notification if recipients exist
  if (recipientIds.length > 0) {
    try {
      const notificationPayload = {
        title: result.title,
        body: result.message,
        type: NOTIFICATION_TYPE.ANNOUNCEMENT,
        data: {
          type: "announcement",
          referenceId: result._id.toString(),
          referenceModel: "Announcement",
          propertyId: payload.property.toString(),
          sender: userId,
        },
      };

      await notificationHelper.sendToBatch(recipientIds, notificationPayload);

      // Socket.io real-time broadcast
      //@ts-ignore
      const socketIo = global.io;
      if (socketIo) {
        recipientIds.forEach((recipientId) => {
          socketIo.emit(`send-notification::${recipientId.toString()}`, {
            title: result.title,
            text: result.message,
            referenceId: result._id,
            referenceModel: "Announcement",
            type: NOTIFICATION_TYPE.ANNOUNCEMENT,
            createdAt: (result as any).createdAt,
          });
          socketIo.emit(`new-announcement::${recipientId.toString()}`, result);
        });
      }
    } catch (notificationError) {
      // Log notification failure but do not break announcement creation
      console.error("Announcement push notification error:", notificationError);
    }
  }

  return await result.populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode propertyPhotos landlord",
    },
    { path: "flats", select: "unitName floor rentPerMonth" },
    {
      path: "landlord",
      select: "name email role profileImage phone companyName",
    },
    { path: "recipients", select: "name email role profileImage" },
  ]);
};

// 2. Get All Announcements (SaaS for Landlord / Admin, with automatic tenant handling)
const getAllAnnouncementsFromDB = async (
  user: JwtPayload,
  query: Record<string, unknown>,
) => {
  let filter: Record<string, any> = {};

  if (user.role === USER_ROLES.LANDLORD) {
    filter = { landlord: new Types.ObjectId(user.id) };
  } else if (user.role === USER_ROLES.TENANT) {
    return await getMyAnnouncementsForTenantFromDB(user, query);
  }

  const baseQuery = Announcement.find(filter).populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode propertyPhotos landlord",
    },
    { path: "flats", select: "unitName floor rentPerMonth" },
    {
      path: "landlord",
      select: "name email role profileImage phone companyName",
    },
    { path: "recipients", select: "name email role profileImage" },
  ]);

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(announcementSearchableFields)
    .filter()
    .sort()
    .paginate();

  const data = await queryBuilder.modelQuery;
  const meta = await queryBuilder.countTotal();

  return { data, meta };
};

// 3. Get Announcements for Tenant (Recipients)
const getMyAnnouncementsForTenantFromDB = async (
  user: JwtPayload,
  query: Record<string, unknown>,
) => {
  const tenantUser = await User.findById(user.id).select("property flat");

  const flats = await Flat.find({
    $or: [
      { tenant: new Types.ObjectId(user.id) },
      { tenants: new Types.ObjectId(user.id) },
    ],
    isDeleted: false,
  }).select("_id property");

  const tenantFlatIds: Types.ObjectId[] = flats.map(
    (f) => f._id as Types.ObjectId,
  );
  if (tenantUser?.flat) {
    tenantFlatIds.push(tenantUser.flat as Types.ObjectId);
  }

  const tenantPropertyIds: Types.ObjectId[] = flats
    .map((f) => f.property as Types.ObjectId)
    .filter(Boolean);
  if (tenantUser?.property) {
    tenantPropertyIds.push(tenantUser.property as Types.ObjectId);
  }

  const orConditions: Record<string, any>[] = [
    { recipients: new Types.ObjectId(user.id) },
  ];

  if (tenantPropertyIds.length > 0) {
    orConditions.push({
      property: { $in: tenantPropertyIds },
      visibilityScope: VISIBILITY_SCOPE.ENTIRE_PROPERTY,
    });
  }

  if (tenantFlatIds.length > 0) {
    orConditions.push({
      flats: { $in: tenantFlatIds },
      visibilityScope: VISIBILITY_SCOPE.SELECTED_FLATS,
    });
  }

  const filter = { $or: orConditions };

  const baseQuery = Announcement.find(filter).populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode propertyPhotos landlord",
    },
    { path: "flats", select: "unitName floor rentPerMonth" },
    {
      path: "landlord",
      select: "name email role profileImage phone companyName",
    },
  ]);

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(announcementSearchableFields)
    .filter()
    .sort()
    .paginate();

  const data = await queryBuilder.modelQuery;
  const meta = await queryBuilder.countTotal();

  return { data, meta };
};

// 4. Get Single Announcement
const getSingleAnnouncementFromDB = async (
  user: JwtPayload,
  id: string,
): Promise<TAnnouncement | null> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid announcement ID");
  }

  const announcement = await Announcement.findById(id).populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode propertyPhotos landlord",
    },
    { path: "flats", select: "unitName floor rentPerMonth" },
    {
      path: "landlord",
      select: "name email role profileImage phone companyName",
    },
    { path: "recipients", select: "name email role profileImage" },
  ]);

  if (!announcement || (announcement as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Announcement not found");
  }

  // Authorization checks
  if (user.role === USER_ROLES.LANDLORD) {
    if (
      announcement.landlord &&
      (announcement.landlord as any)._id?.toString() !== user.id &&
      announcement.landlord.toString() !== user.id
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to view this announcement",
      );
    }
  } else if (user.role === USER_ROLES.TENANT) {
    const isExplicitRecipient = announcement.recipients?.some(
      (r: any) => (r._id ? r._id.toString() : r.toString()) === user.id,
    );

    if (!isExplicitRecipient) {
      // Check if tenant is attached to property or flat
      const tenantUser = await User.findById(user.id).select("property flat");
      const flatDocs = await Flat.find({
        $or: [
          { tenant: new Types.ObjectId(user.id) },
          { tenants: new Types.ObjectId(user.id) },
        ],
        isDeleted: false,
      }).select("_id property");

      const propertyMatch =
        (tenantUser?.property &&
          tenantUser.property.toString() ===
            announcement.property.toString()) ||
        flatDocs.some(
          (f) =>
            f.property &&
            f.property.toString() === announcement.property.toString(),
        );

      const flatMatch =
        announcement.flats &&
        announcement.flats.some((f: any) => {
          const fId = f._id ? f._id.toString() : f.toString();
          return (
            (tenantUser?.flat && tenantUser.flat.toString() === fId) ||
            flatDocs.some((fd) => fd._id.toString() === fId)
          );
        });

      const hasScopeAccess =
        (announcement.visibilityScope === VISIBILITY_SCOPE.ENTIRE_PROPERTY &&
          propertyMatch) ||
        (announcement.visibilityScope === VISIBILITY_SCOPE.SELECTED_FLATS &&
          flatMatch);

      if (!hasScopeAccess) {
        throw new ApiError(
          StatusCodes.FORBIDDEN,
          "You do not have permission to view this announcement",
        );
      }
    }
  }

  return announcement;
};

// 5. Update Announcement
const updateAnnouncementToDB = async (
  user: JwtPayload,
  id: string,
  payload: Partial<TAnnouncement>,
): Promise<TAnnouncement | null> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid announcement ID");
  }

  const existingAnnouncement = await Announcement.findById(id);
  if (!existingAnnouncement || (existingAnnouncement as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Announcement not found");
  }

  // Only landlord who created it or admin can update
  if (
    user.role === USER_ROLES.LANDLORD &&
    existingAnnouncement.landlord.toString() !== user.id
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to update this announcement",
    );
  }

  // If a new image is provided and old image exists, clean up old image
  if (
    payload.image &&
    existingAnnouncement.image &&
    existingAnnouncement.image !== payload.image
  ) {
    unlinkFile(existingAnnouncement.image);
  }

  // If property or flats are updated, re-validate
  const propertyId = payload.property || existingAnnouncement.property;
  const visibilityScope =
    payload.visibilityScope || existingAnnouncement.visibilityScope;
  const flats =
    payload.flats !== undefined ? payload.flats : existingAnnouncement.flats;

  if (
    visibilityScope === VISIBILITY_SCOPE.SELECTED_FLATS &&
    (!flats || flats.length === 0)
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Please select at least one flat for this announcement",
    );
  }

  if (payload.property || payload.flats || payload.visibilityScope) {
    const recipientIds = await resolveTargetTenants(
      propertyId,
      visibilityScope,
      flats,
      user.id,
    );
    payload.recipients = recipientIds;
  }

  const result = await Announcement.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  }).populate([
    {
      path: "property",
      select: "propertyName streetAddress postCode propertyPhotos landlord",
    },
    { path: "flats", select: "unitName floor rentPerMonth" },
    {
      path: "landlord",
      select: "name email role profileImage phone companyName",
    },
    { path: "recipients", select: "name email role profileImage" },
  ]);

  return result;
};

// 6. Delete Announcement
const deleteAnnouncementFromDB = async (
  user: JwtPayload,
  id: string,
): Promise<TAnnouncement | null> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid announcement ID");
  }

  const existingAnnouncement = await Announcement.findById(id);
  if (!existingAnnouncement || (existingAnnouncement as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Announcement not found");
  }

  // Only landlord who created it or admin can delete
  if (
    user.role === USER_ROLES.LANDLORD &&
    existingAnnouncement.landlord.toString() !== user.id
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to delete this announcement",
    );
  }

  const result = await Announcement.softDeleteById(id);

  if (existingAnnouncement.image) {
    unlinkFile(existingAnnouncement.image);
  }

  return result;
};

// 7. Get Flats of a Property with Tenant vacancy/count status (Helper for Create Announcement screen)
const getPropertyFlatsForAnnouncementFromDB = async (
  userId: string,
  propertyId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }

  const property = await Property.findById(propertyId);
  if (!property || (property as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  const flats = await Flat.find({
    property: propertyId,
    isDeleted: false,
  }).select("unitName floor flatPhotos tenant tenants rentPerMonth");

  const flatListWithStatus = await Promise.all(
    flats.map(async (flat) => {
      const activeTenantIds = new Set<string>();

      if (flat.tenant) {
        activeTenantIds.add(flat.tenant.toString());
      }
      if (Array.isArray(flat.tenants)) {
        flat.tenants.forEach((t) => {
          if (t) activeTenantIds.add(t.toString());
        });
      }

      // Check users who have this flat assigned
      const assignedUsers = await User.find({
        role: USER_ROLES.TENANT,
        flat: flat._id,
        status: STATUS.ACTIVE,
        isDeleted: false,
      }).select("_id");

      assignedUsers.forEach((u) => activeTenantIds.add(u._id.toString()));

      const count = activeTenantIds.size;
      return {
        _id: flat._id,
        unitName: flat.unitName,
        floor: flat.floor,
        rentPerMonth: flat.rentPerMonth,
        flatPhotos: flat.flatPhotos,
        activeTenantCount: count,
        status:
          count > 0
            ? `${count} active tenant${count > 1 ? "s" : ""}`
            : "Vacant - no tenants notified",
      };
    }),
  );

  return flatListWithStatus;
};

export const AnnouncementService = {
  createAnnouncementToDB,
  getAllAnnouncementsFromDB,
  getMyAnnouncementsForTenantFromDB,
  getSingleAnnouncementFromDB,
  updateAnnouncementToDB,
  deleteAnnouncementFromDB,
  getPropertyFlatsForAnnouncementFromDB,
};
