import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { InventoryService } from "./inventory.service";

// ======================== ROOM CONTROLLERS ========================

const createRoom = catchAsync(async (req: Request, res: Response) => {
  const result = await InventoryService.createRoomToDB(req.user, req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Room created successfully",
    data: result,
  });
});

const getAllRooms = catchAsync(async (req: Request, res: Response) => {
  const result = await InventoryService.getAllRoomsFromDB(req.user, req.query);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Rooms retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getSingleRoom = catchAsync(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const result = await InventoryService.getSingleRoomFromDB(req.user, roomId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Room retrieved successfully",
    data: result,
  });
});

const updateRoom = catchAsync(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const result = await InventoryService.updateRoomInDB(
    req.user,
    roomId,
    req.body,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Room updated successfully",
    data: result,
  });
});

const deleteRoom = catchAsync(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const result = await InventoryService.deleteRoomFromDB(req.user, roomId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Room deleted successfully",
    data: result,
  });
});

// ======================== ITEM CONTROLLERS ========================

const createItem = catchAsync(async (req: Request, res: Response) => {
  const result = await InventoryService.createItemToDB(req.user, req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Item created successfully",
    data: result,
  });
});

const getItemsByRoom = catchAsync(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const result = await InventoryService.getItemsByRoomFromDB(
    req.user,
    roomId,
    req.query,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Items retrieved successfully",
    meta: result.meta,
    data: result,
  });
});

const getSingleItem = catchAsync(async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const result = await InventoryService.getSingleItemFromDB(req.user, itemId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Item retrieved successfully",
    data: result,
  });
});

const updateItem = catchAsync(async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const result = await InventoryService.updateItemInDB(
    req.user,
    itemId,
    req.body,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Item updated successfully",
    data: result,
  });
});

const deleteItem = catchAsync(async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const result = await InventoryService.deleteItemFromDB(req.user, itemId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Item deleted successfully",
    data: result,
  });
});

// ======================== TENANT CONTROLLERS ========================

const getTenantInventory = catchAsync(async (req: Request, res: Response) => {
  const result = await InventoryService.getTenantInventoryFromDB(req.user);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Tenant inventory retrieved successfully",
    data: result,
  });
});

export const InventoryController = {
  createRoom,
  getAllRooms,
  getSingleRoom,
  updateRoom,
  deleteRoom,
  createItem,
  getItemsByRoom,
  getSingleItem,
  updateItem,
  deleteItem,
  getTenantInventory,
};
