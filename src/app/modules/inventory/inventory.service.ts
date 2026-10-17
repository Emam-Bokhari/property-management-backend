import mongoose, { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { USER_ROLES } from "../../../enums/user";
import { Flat } from "../flat/flat.model";
import { Property } from "../property/property.model";
import { InventoryItem, InventoryRoom } from "./inventory.model";
import { TInventoryItem, TInventoryRoom } from "./inventory.interface";
import {
  inventoryItemSearchableFields,
  inventoryRoomSearchableFields,
} from "./inventory.constant";
import unlinkFile from "../../../shared/unlinkFile";

// Helper: verify if authenticated user has permission to manage room/item
const verifyLandlordOrAdmin = (user: JwtPayload, ownerLandlordId: any) => {
  if (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN) {
    return true;
  }
  const landlordStr = ownerLandlordId?._id
    ? ownerLandlordId._id.toString()
    : ownerLandlordId?.toString();
  if (landlordStr !== user.id) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to perform this action",
    );
  }
  return true;
};

// Helper: check if a tenant belongs to a given flat
const verifyTenantBelongsToFlat = async (
  tenantUserId: string,
  flatId: string | Types.ObjectId,
) => {
  const flatDoc = await Flat.findOne({
    _id: flatId,
    $or: [
      { tenant: new Types.ObjectId(tenantUserId) },
      { tenants: new Types.ObjectId(tenantUserId) },
    ],
    isDeleted: { $ne: true },
  });

  if (!flatDoc) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have access to this flat's inventory",
    );
  }

  return flatDoc;
};

// ======================== ROOM SERVICES ========================

// 1. Create Room (Landlord / Admin)
const createRoomToDB = async (
  user: JwtPayload,
  payload: TInventoryRoom,
): Promise<TInventoryRoom> => {
  if (!mongoose.Types.ObjectId.isValid(payload.flat.toString())) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }
  if (!mongoose.Types.ObjectId.isValid(payload.property.toString())) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }

  const [flatDoc, propertyDoc] = await Promise.all([
    Flat.findById(payload.flat),
    Property.findById(payload.property),
  ]);

  if (!flatDoc || (flatDoc as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }
  if (!propertyDoc || (propertyDoc as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  // Ensure flat belongs to property
  if (flatDoc.property.toString() !== payload.property.toString()) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "The specified flat does not belong to this property",
    );
  }

  // Ownership check
  verifyLandlordOrAdmin(user, propertyDoc.landlord);

  payload.landlord = propertyDoc.landlord || new Types.ObjectId(user.id);

  const room = await InventoryRoom.create(payload);
  return room;
};

// 2. Get All Rooms of a Flat (Landlord / Tenant / Admin)
const getAllRoomsFromDB = async (
  user: JwtPayload,
  query: Record<string, unknown>,
) => {
  const filter: Record<string, any> = { isDeleted: { $ne: true } };

  if (user.role === USER_ROLES.TENANT) {
    // If tenant, get their assigned flat
    const tenantFlat = await Flat.findOne({
      $or: [
        { tenant: new Types.ObjectId(user.id) },
        { tenants: new Types.ObjectId(user.id) },
      ],
      isDeleted: { $ne: true },
    });

    if (!tenantFlat) {
      return {
        meta: { page: 1, limit: 10, total: 0, totalPage: 0 },
        data: [],
      };
    }

    // If query.flat passed, ensure it is their flat
    if (
      query.flat &&
      query.flat.toString() !== (tenantFlat._id as any).toString()
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have access to this flat's rooms",
      );
    }

    filter.flat = tenantFlat._id;
  } else if (user.role === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(user.id);
    if (query.flat && mongoose.Types.ObjectId.isValid(query.flat as string)) {
      filter.flat = new Types.ObjectId(query.flat as string);
    }
    if (
      query.property &&
      mongoose.Types.ObjectId.isValid(query.property as string)
    ) {
      filter.property = new Types.ObjectId(query.property as string);
    }
  } else {
    // Admin / Super Admin
    if (query.flat && mongoose.Types.ObjectId.isValid(query.flat as string)) {
      filter.flat = new Types.ObjectId(query.flat as string);
    }
    if (
      query.property &&
      mongoose.Types.ObjectId.isValid(query.property as string)
    ) {
      filter.property = new Types.ObjectId(query.property as string);
    }
  }

  // Clean query object so it doesn't duplicate filter
  delete query.flat;
  delete query.property;

  const baseQuery = InventoryRoom.find(filter)
    .populate("flat", "unitName floor rentPerMonth")
    .populate("property", "propertyName streetAddress postCode");

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(inventoryRoomSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [rooms, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  // Compute items count for each room
  const roomsWithItemCount = await Promise.all(
    rooms.map(async (room: any) => {
      const itemsCount = await InventoryItem.countDocuments({
        room: room._id,
        isDeleted: { $ne: true },
      });
      return {
        ...room,
        itemsCount,
      };
    }),
  );

  return {
    meta,
    data: roomsWithItemCount,
  };
};

// 3. Get Single Room By ID (Landlord / Tenant / Admin)
const getSingleRoomFromDB = async (user: JwtPayload, roomId: string) => {
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid room ID");
  }

  const room = await InventoryRoom.findOne({
    _id: roomId,
    isDeleted: { $ne: true },
  })
    .populate("flat", "unitName floor rentPerMonth tenant tenants")
    .populate("property", "propertyName streetAddress postCode")
    .lean();

  if (!room) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Room not found");
  }

  if (user.role === USER_ROLES.TENANT) {
    await verifyTenantBelongsToFlat(user.id, (room.flat as any)._id);
  } else if (user.role === USER_ROLES.LANDLORD) {
    verifyLandlordOrAdmin(user, room.landlord);
  }

  const itemsCount = await InventoryItem.countDocuments({
    room: room._id,
    isDeleted: { $ne: true },
  });

  return {
    ...room,
    itemsCount,
  };
};

// 4. Update Room (Landlord / Admin)
const updateRoomInDB = async (
  user: JwtPayload,
  roomId: string,
  payload: Partial<TInventoryRoom>,
) => {
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid room ID");
  }

  const room = await InventoryRoom.findOne({
    _id: roomId,
    isDeleted: { $ne: true },
  });

  if (!room) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Room not found");
  }

  verifyLandlordOrAdmin(user, room.landlord);

  const updatedRoom = await InventoryRoom.findByIdAndUpdate(roomId, payload, {
    new: true,
    runValidators: true,
  });

  // If roomName changed, update cached roomName in InventoryItem
  if (payload.roomName) {
    await InventoryItem.updateMany(
      { room: roomId },
      { roomName: payload.roomName },
    );
  }

  return updatedRoom;
};

// 5. Delete Room (Landlord / Admin)
const deleteRoomFromDB = async (user: JwtPayload, roomId: string) => {
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid room ID");
  }

  const room = await InventoryRoom.findOne({
    _id: roomId,
    isDeleted: { $ne: true },
  });

  if (!room) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Room not found");
  }

  verifyLandlordOrAdmin(user, room.landlord);

  // Soft delete room
  const deletedRoom = await (room as any).softDelete();

  // Cascade soft delete all items inside this room
  await InventoryItem.updateMany(
    { room: roomId },
    { isDeleted: true, deletedAt: new Date() },
  );

  return deletedRoom;
};

// ======================== ITEM SERVICES ========================

// 6. Create Item (Landlord / Admin)
const createItemToDB = async (
  user: JwtPayload,
  payload: TInventoryItem,
): Promise<TInventoryItem> => {
  if (!mongoose.Types.ObjectId.isValid(payload.room.toString())) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid room ID");
  }

  const roomDoc = await InventoryRoom.findOne({
    _id: payload.room,
    isDeleted: { $ne: true },
  });

  if (!roomDoc) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Room not found");
  }

  verifyLandlordOrAdmin(user, roomDoc.landlord);

  payload.flat = roomDoc.flat;
  payload.property = roomDoc.property;
  payload.landlord = roomDoc.landlord;
  payload.roomName = roomDoc.roomName;
  payload.roomSize = roomDoc.roomSize;

  const item = await InventoryItem.create(payload);
  return item;
};

// 7. Get Items by Room (Landlord / Tenant / Admin)
const getItemsByRoomFromDB = async (
  user: JwtPayload,
  roomId: string,
  query: Record<string, unknown>,
) => {
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid room ID");
  }

  const room = await InventoryRoom.findOne({
    _id: roomId,
    isDeleted: { $ne: true },
  });

  if (!room) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Room not found");
  }

  if (user.role === USER_ROLES.TENANT) {
    await verifyTenantBelongsToFlat(user.id, room.flat);
  } else if (user.role === USER_ROLES.LANDLORD) {
    verifyLandlordOrAdmin(user, room.landlord);
  }

  const filter: Record<string, any> = {
    room: new Types.ObjectId(roomId),
    isDeleted: { $ne: true },
  };

  const baseQuery = InventoryItem.find(filter);

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(inventoryItemSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [items, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  return {
    room: {
      _id: room._id,
      roomName: room.roomName,
      roomSize: room.roomSize,
      flat: room.flat,
      property: room.property,
    },
    meta,
    items,
  };
};

// 8. Get Single Item By ID (Landlord / Tenant / Admin)
const getSingleItemFromDB = async (user: JwtPayload, itemId: string) => {
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid item ID");
  }

  const item = await InventoryItem.findOne({
    _id: itemId,
    isDeleted: { $ne: true },
  })
    .populate("room", "roomName roomSize")
    .populate("flat", "unitName floor")
    .populate("property", "propertyName streetAddress postCode");

  if (!item) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Item not found");
  }

  if (user.role === USER_ROLES.TENANT) {
    await verifyTenantBelongsToFlat(user.id, item.flat);
  } else if (user.role === USER_ROLES.LANDLORD) {
    verifyLandlordOrAdmin(user, item.landlord);
  }

  return item;
};

// 9. Update Item (Landlord / Admin)
const updateItemInDB = async (
  user: JwtPayload,
  itemId: string,
  payload: Partial<TInventoryItem>,
) => {
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid item ID");
  }

  const item = await InventoryItem.findOne({
    _id: itemId,
    isDeleted: { $ne: true },
  });

  if (!item) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Item not found");
  }

  verifyLandlordOrAdmin(user, item.landlord);

  // If new photo was uploaded and replaced old photo
  if (
    payload.itemPhotos &&
    payload.itemPhotos.length > 0 &&
    item.itemPhotos &&
    item.itemPhotos.length > 0
  ) {
    // Unlink old photo if not included in the new list
    for (const oldPhoto of item.itemPhotos) {
      if (!payload.itemPhotos.includes(oldPhoto)) {
        unlinkFile(oldPhoto);
      }
    }
  }

  const updatedItem = await InventoryItem.findByIdAndUpdate(itemId, payload, {
    new: true,
    runValidators: true,
  });

  return updatedItem;
};

// 10. Delete Item (Landlord / Admin)
const deleteItemFromDB = async (user: JwtPayload, itemId: string) => {
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid item ID");
  }

  const item = await InventoryItem.findOne({
    _id: itemId,
    isDeleted: { $ne: true },
  });

  if (!item) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Item not found");
  }

  verifyLandlordOrAdmin(user, item.landlord);

  if (item.itemPhotos && item.itemPhotos.length > 0) {
    for (const p of item.itemPhotos) {
      unlinkFile(p);
    }
  }

  const deletedItem = await (item as any).softDelete();
  return deletedItem;
};

// ======================== TENANT DEDICATED INVENTORY ========================

// 11. Get Tenant's Own Flat Inventory (Tenant Role Only)
const getTenantInventoryFromDB = async (user: JwtPayload) => {
  const flatDoc = await Flat.findOne({
    $or: [
      { tenant: new Types.ObjectId(user.id) },
      { tenants: new Types.ObjectId(user.id) },
    ],
    isDeleted: { $ne: true },
  })
    .populate("property", "propertyName streetAddress postCode propertyPhotos")
    .populate("landlord", "firstName lastName email phone");

  if (!flatDoc) {
    return {
      flat: null,
      rooms: [],
    };
  }

  const rooms = await InventoryRoom.find({
    flat: flatDoc._id,
    isDeleted: { $ne: true },
  }).lean();

  const roomsWithItems = await Promise.all(
    rooms.map(async (r: any) => {
      const items = await InventoryItem.find({
        room: r._id,
        isDeleted: { $ne: true },
      }).lean();

      return {
        ...r,
        itemsCount: items.length,
        items,
      };
    }),
  );

  return {
    flat: {
      _id: flatDoc._id,
      unitName: flatDoc.unitName,
      floor: flatDoc.floor,
      rentPerMonth: flatDoc.rentPerMonth,
      property: flatDoc.property,
      landlord: flatDoc.landlord,
    },
    rooms: roomsWithItems,
  };
};

export const InventoryService = {
  createRoomToDB,
  getAllRoomsFromDB,
  getSingleRoomFromDB,
  updateRoomInDB,
  deleteRoomFromDB,
  createItemToDB,
  getItemsByRoomFromDB,
  getSingleItemFromDB,
  updateItemInDB,
  deleteItemFromDB,
  getTenantInventoryFromDB,
};
