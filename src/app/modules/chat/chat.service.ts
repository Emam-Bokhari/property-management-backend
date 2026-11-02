import { Chat } from "./chat.model";
import mongoose from "mongoose";
import { User } from "../user/user.model";
import { Message } from "../message/message.model";
import ApiError from "../../../errors/ApiErrors";
import { CHAT_COMMUNICATION_TYPE } from "../../../enums/chat";
import { MESSAGE_TYPE } from "../../../enums/message";
import { STATUS, USER_ROLES } from "../../../enums/user";
import { chatSocketHelper } from "./socket/chat.socket";

const createChatIntoDB = async (
  participants: string[],
  communicationType?: CHAT_COMMUNICATION_TYPE,
  referenceId?: string,
) => {
  const commType = communicationType || CHAT_COMMUNICATION_TYPE.OTHER;

  // If support chat requested and no distinct second participant provided, resolve an admin automatically
  if (
    commType === CHAT_COMMUNICATION_TYPE.SUPPORT &&
    (!participants[1] || participants[0] === participants[1])
  ) {
    const adminUser = await User.findOne({
      role: { $in: [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN] },
      status: STATUS.ACTIVE,
    });
    if (!adminUser) {
      throw new ApiError(404, "No support admin available at the moment.");
    }
    participants = [participants[0], adminUser._id.toString()];
  }

  // Deduplicate participants to avoid duplicate entries in the array and duplicate socket emissions
  const uniqueParticipants = [
    ...new Set(participants.map((p) => p.toString())),
  ];

  if (
    uniqueParticipants.length < 2 &&
    commType !== CHAT_COMMUNICATION_TYPE.SUPPORT
  ) {
    throw new ApiError(
      400,
      "Chat requires at least two distinct participants.",
    );
  }

  const query: any = {
    participants: {
      $size: uniqueParticipants.length,
      $all: uniqueParticipants,
    },
    communicationType: commType,
    isDeleted: { $ne: true },
  };

  if (referenceId) {
    query.referenceId = new mongoose.Types.ObjectId(referenceId);
  } else {
    query.$or = [{ referenceId: { $exists: false } }, { referenceId: null }];
  }

  const isExistChat = await Chat.findOne(query);

  if (isExistChat) {
    // If the chat was previously soft-deleted by this user, restore it
    if (isExistChat.deletedBy && isExistChat.deletedBy.length > 0) {
      await Chat.findByIdAndUpdate(isExistChat._id, {
        $pull: { deletedBy: { $in: uniqueParticipants } },
        isDeleted: false,
      });
    }
    return isExistChat;
  }

  const newChat = await Chat.create({
    participants: uniqueParticipants,
    lastMessage: null,
    communicationType: commType,
    referenceId: referenceId
      ? new mongoose.Types.ObjectId(referenceId)
      : undefined,
  });
  if (!newChat) {
    throw new ApiError(500, "Failed to create chat");
  }

  uniqueParticipants.forEach((participant) => {
    chatSocketHelper.emitNewChat(participant, newChat);
  });
  return newChat;
};

const markChatAsRead = async (userId: string, chatId: string) => {
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new ApiError(404, "Chat not found");
  }

  const isParticipant = chat.participants.some(
    (p: any) => p.toString() === userId.toString(),
  );
  if (!isParticipant) {
    throw new ApiError(403, "You are not a participant in this chat");
  }

  const result = await Chat.findByIdAndUpdate(
    chatId,
    { $addToSet: { readBy: userId } },
    { new: true },
  ).lean();

  // Mark all messages in this chat from other participants as read
  await Message.updateMany(
    {
      chatId,
      sender: { $ne: userId },
      read: false,
    },
    {
      $set: { read: true, readAt: new Date() },
    },
  );

  // Emit socket notification to update the unread count/state
  chatSocketHelper.emitUnreadCountUpdate(userId, {
    chatId,
    action: "read",
  });

  if (result) {
    return {
      ...result,
      read: true,
      isRead: true,
      unreadCount: 0,
    };
  }

  return result;
};

// 5. Updated getAllChatsFromDB with better unread count calculation and filters
const getAllChatsFromDB = async (
  userId: string,
  query: Record<string, any>,
) => {
  const searchTerm = query.searchTerm?.toLowerCase();
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const skip = (page - 1) * limit;

  const chatQuery: any = {
    participants: { $in: [userId] },
    deletedBy: { $ne: userId },
    isDeleted: { $ne: true },
  };

  if (query.communicationType) {
    chatQuery.communicationType = query.communicationType;
  }
  if (query.referenceId) {
    chatQuery.referenceId = query.referenceId;
  }

  let chats;
  let totalChats;

  if (searchTerm) {
    const allChats = await Chat.find(chatQuery)
      .populate({
        path: "lastMessage",
        populate: {
          path: "sender",
          select: "_id name profileImage email role primaryTrade companyName",
        },
      })
      .lean()
      .sort({ updatedAt: -1 });

    const allChatLists = await Promise.all(
      allChats.map(async (chat) => {
        const otherParticipantIds = chat.participants.filter(
          (participantId) =>
            participantId && participantId.toString() !== userId,
        );

        const otherParticipants = await User.find({
          _id: { $in: otherParticipantIds },
        })
          .select(
            "_id name profileImage email role primaryTrade companyName phone",
          )
          .lean();

        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          sender: { $ne: userId },
          read: false,
          isDeleted: false,
        });

        return {
          ...chat,
          participants: otherParticipants,
          read: unreadCount === 0,
          isRead: unreadCount === 0, // Chat is read if no unread messages
          unreadCount,
        };
      }),
    );

    const filteredChats = allChatLists.filter((chat) => {
      return chat.participants.some(
        (participant: any) =>
          participant.name &&
          participant.name.toLowerCase().includes(searchTerm),
      );
    });

    totalChats = filteredChats.length;
    chats = filteredChats.slice(skip, skip + limit);
  } else {
    totalChats = await Chat.countDocuments(chatQuery);

    const rawChats = await Chat.find(chatQuery)
      .populate({
        path: "lastMessage",
        populate: {
          path: "sender",
          select: "_id name profileImage email role primaryTrade companyName",
        },
      })
      .lean()
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    chats = await Promise.all(
      rawChats.map(async (chat) => {
        const otherParticipantIds = chat.participants.filter(
          (participantId) =>
            participantId && participantId.toString() !== userId,
        );

        const otherParticipants = await User.find({
          _id: { $in: otherParticipantIds },
        })
          .select(
            "_id name profileImage email role primaryTrade companyName phone",
          )
          .lean();

        // FIXED: Same unread count calculation
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          sender: { $ne: userId },
          read: false,
          isDeleted: false,
        });

        return {
          ...chat,
          participants: otherParticipants,
          read: unreadCount === 0,
          isRead: unreadCount === 0,
          unreadCount,
        };
      }),
    );
  }

  const unreadChatsCount = chats.filter((chat) => chat.unreadCount > 0).length;
  const totalUnreadMessages = chats.reduce(
    (total, chat) => total + chat.unreadCount,
    0,
  );

  const totalPage = Math.ceil(totalChats / limit);

  return {
    data: chats,
    unreadChatsCount,
    totalUnreadMessages,
    meta: {
      limit,
      page,
      total: totalChats,
      totalPage,
    },
  };
};

const getChatImagesFromDB = async (chatId: string, userId: string) => {
  // check chat existence
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new ApiError(404, "Chat not found");
  }

  // verify user is participant
  const isParticipant = chat.participants.some(
    (p: any) => p.toString() === userId.toString(),
  );
  if (!isParticipant) {
    throw new ApiError(403, "You are not a participant in this chat");
  }

  // ========================GET IMAGES DATA=======================
  // Return all images in this chat sent by any participant
  const images = await Message.find({
    chatId,
    isDeleted: { $ne: true },
    $or: [{ type: MESSAGE_TYPE.IMAGE }, { type: MESSAGE_TYPE.BOTH }],
  })
    .sort({ createdAt: -1 })
    .select("image -_id")
    .lean();

  // return only image URLs as array
  return images.map((msg) => msg.image).filter(Boolean);
};

const softDeleteChatForUser = async (chatId: string, id: string) => {
  const userId = new mongoose.Types.ObjectId(id);
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new ApiError(404, "Chat not found");
  }

  if (!chat.participants.some((id) => id.toString() === userId.toString())) {
    throw new ApiError(401, "User is not authorized");
  }

  // If already deleted by this user, just return
  if (chat.deletedBy.some((id) => id.toString() === userId.toString())) {
    return chat;
  }

  // Add userId to deletedBy array
  chat.deletedBy.push(userId);

  // If all participants deleted, mark status deleted (soft delete for everyone)
  if (chat.deletedBy.length === chat.participants.length) {
    chat.isDeleted = true;
  }

  await chat.save();

  chat.participants.forEach((participant) => {
    chatSocketHelper.emitChatDeleted(participant.toString(), {
      chatId,
      userId,
    });
  });

  return chat;
};

export const ChatService = {
  createChatIntoDB,
  getAllChatsFromDB,
  markChatAsRead,
  softDeleteChatForUser,
  getChatImagesFromDB,
};
