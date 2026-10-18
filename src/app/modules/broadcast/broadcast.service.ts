import { JwtPayload } from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { STATUS, USER_ROLES } from "../../../enums/user";
import { User } from "../user/user.model";
import { IUser } from "../user/user.interface";
import { Broadcast } from "./broadcast.model";
import { IBroadcast } from "./broadcast.interface";
import {
  BROADCAST_AUDIENCE,
  BROADCAST_CHANNEL,
  BROADCAST_SEARCHABLE_FIELDS,
  BROADCAST_STATUS,
} from "./broadcast.constant";
import { notificationHelper } from "../../builder/pushNotification";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import QueryBuilder from "../../builder/queryBuilder";
import { logger } from "../../../shared/logger";
import colors from "colors";

export type ISendBroadcastPayload = {
  title: string;
  message?: string;
  body?: string;
  audience?: BROADCAST_AUDIENCE | string;
  landlordIds?: string[];
  landlords?: string[];
  landlordId?: string;
};

// 1. Send push broadcast to all landlords or selected landlords
const sendBroadcastToLandlords = async (
  user: JwtPayload,
  payload: ISendBroadcastPayload,
) => {
  const title = payload.title?.trim();
  const rawMessage = (payload.message || payload.body || "").trim();

  if (!title) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Title is required");
  }
  if (!rawMessage) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Message body is required");
  }

  // Normalize IDs if provided
  let inputIds: string[] = [];
  if (Array.isArray(payload.landlordIds) && payload.landlordIds.length > 0) {
    inputIds = payload.landlordIds;
  } else if (Array.isArray(payload.landlords) && payload.landlords.length > 0) {
    inputIds = payload.landlords;
  } else if (payload.landlordId) {
    inputIds = [payload.landlordId];
  }

  // Determine whether this is ALL landlords or SELECTED landlords
  const isSelectedAudience =
    payload.audience === BROADCAST_AUDIENCE.SELECTED_LANDLORDS ||
    payload.audience === "selected" ||
    payload.audience === "specific" ||
    inputIds.length > 0;

  let targetUserIds: Types.ObjectId[] = [];
  let finalAudience: BROADCAST_AUDIENCE = BROADCAST_AUDIENCE.ALL_LANDLORDS;

  if (isSelectedAudience) {
    // If client specified selected audience but gave no IDs
    if (inputIds.length === 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Please select at least one landlord to send the notification",
      );
    }

    const validObjectIds = inputIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (validObjectIds.length === 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Invalid landlord ID(s) provided",
      );
    }

    const landlords = await User.find({
      _id: { $in: validObjectIds },
      role: USER_ROLES.LANDLORD,
      status: STATUS.ACTIVE,
    })
      .select("_id name email")
      .lean();

    if (landlords.length === 0) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "No active landlords found matching the provided IDs",
      );
    }

    targetUserIds = landlords.map((l) => l._id as Types.ObjectId);
    finalAudience = BROADCAST_AUDIENCE.SELECTED_LANDLORDS;
  } else {
    // Audience is ALL LANDLORDS
    const landlords = await User.find({
      role: USER_ROLES.LANDLORD,
      status: STATUS.ACTIVE,
    })
      .select("_id name email")
      .lean();

    if (landlords.length === 0) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "No active landlords currently found in the system",
      );
    }

    targetUserIds = landlords.map((l) => l._id as Types.ObjectId);
    finalAudience = BROADCAST_AUDIENCE.ALL_LANDLORDS;
  }

  // 1. Create Broadcast document as PENDING
  const broadcast = await Broadcast.create({
    title,
    message: rawMessage,
    audience: finalAudience,
    selectedLandlords:
      finalAudience === BROADCAST_AUDIENCE.SELECTED_LANDLORDS
        ? targetUserIds
        : [],
    recipientCount: targetUserIds.length,
    channel: BROADCAST_CHANNEL.PUSH_NOTIFICATION,
    status: BROADCAST_STATUS.PENDING,
    createdBy: new Types.ObjectId(user.id),
  });

  // Plain text body for FCM lockscreen push (strip any HTML tags)
  const plainBody = rawMessage.replace(/<[^>]*>/g, "").trim();

  // 2. Dispatch FCM Push Notifications & DB Notifications via notificationHelper
  try {
    await notificationHelper.sendToBatch(targetUserIds, {
      title,
      body: plainBody,
      type: NOTIFICATION_TYPE.BROADCAST,
      data: {
        type: NOTIFICATION_TYPE.BROADCAST,
        referenceId: broadcast._id.toString(),
        referenceModel: "Broadcast",
        sender: user.id,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
    });
  } catch (pushError) {
    logger.error(
      colors.red("❌ FCM push notification dispatch failed:"),
      pushError,
    );
  }

  // 3. Socket.io real-time notification broadcast
  try {
    //@ts-ignore
    const socketIo = global.io;
    if (socketIo) {
      targetUserIds.forEach((recipientId) => {
        socketIo.emit(`send-notification::${recipientId.toString()}`, {
          title,
          text: plainBody,
          referenceId: broadcast._id,
          referenceModel: "Broadcast",
          type: NOTIFICATION_TYPE.BROADCAST,
          createdAt: new Date(),
        });
      });
    }
  } catch (socketError) {
    logger.error(colors.red("❌ Socket broadcast failed:"), socketError);
  }

  // 4. Update Broadcast document status to SENT
  const updatedBroadcast = await Broadcast.findByIdAndUpdate(
    broadcast._id,
    {
      $set: {
        status: BROADCAST_STATUS.SENT,
        sentAt: new Date(),
      },
    },
    { new: true },
  ).populate([
    { path: "createdBy", select: "name email role profileImage" },
    { path: "selectedLandlords", select: "name email phone profileImage" },
  ]);

  return updatedBroadcast;
};

// 2. Get broadcast history for admin
const getBroadcastsFromDB = async (query: Record<string, unknown>) => {
  const baseQuery = Broadcast.find().populate([
    { path: "createdBy", select: "name email role profileImage" },
    { path: "selectedLandlords", select: "name email phone profileImage" },
  ]);

  const queryBuilder = new QueryBuilder<IBroadcast>(baseQuery, query)
    .search(BROADCAST_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate();

  const [data, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  return { data, meta };
};

// 3. Get single broadcast details
const getSingleBroadcastFromDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid broadcast ID");
  }

  const result = await Broadcast.findById(id).populate([
    { path: "createdBy", select: "name email role profileImage" },
    { path: "selectedLandlords", select: "name email phone profileImage" },
  ]);

  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Broadcast record not found");
  }

  return result;
};

// 4. Delete single broadcast (soft delete)
const deleteBroadcastFromDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid broadcast ID");
  }

  const broadcast = await Broadcast.findById(id);
  if (!broadcast) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Broadcast record not found");
  }

  const result = await Broadcast.softDeleteById(id);
  return result;
};

// 5. Helper service: Get landlords list with search & pagination for frontend audience selector dropdown
const getLandlordsListForSelect = async (query: Record<string, unknown>) => {
  const baseQuery = User.find({
    role: USER_ROLES.LANDLORD,
    status: STATUS.ACTIVE,
  }).select("name email phone profileImage status createdAt");

  const queryBuilder = new QueryBuilder<IUser>(baseQuery, query)
    .search(["name", "email", "phone"])
    .filter()
    .sort()
    .paginate();

  const [landlords, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  return {
    data: landlords,
    meta,
  };
};

export const BroadcastServices = {
  sendBroadcastToLandlords,
  getBroadcastsFromDB,
  getSingleBroadcastFromDB,
  deleteBroadcastFromDB,
  getLandlordsListForSelect,
};
