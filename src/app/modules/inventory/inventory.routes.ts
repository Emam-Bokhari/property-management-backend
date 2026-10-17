import express, { NextFunction, Request, Response } from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import { InventoryValidation } from "./inventory.validation";
import { InventoryController } from "./inventory.controller";

const router = express.Router();

// Helper middleware to normalize item photo fields
const normalizeItemPhotoInput = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.body.itemPhoto && !req.body.itemPhotos) {
    req.body.itemPhotos = [req.body.itemPhoto];
  }
  if (req.body.image && !req.body.itemPhotos) {
    req.body.itemPhotos = Array.isArray(req.body.image)
      ? req.body.image
      : [req.body.image];
  }
  next();
};

// ======================== TENANT DEDICATED ROUTE ========================
router.get(
  "/tenant/my-inventory",
  auth(USER_ROLES.TENANT),
  InventoryController.getTenantInventory,
);

// ======================== ROOM ROUTES ========================
router
  .route("/rooms")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(InventoryValidation.createRoomZodSchema),
    InventoryController.createRoom,
  )
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    InventoryController.getAllRooms,
  );

router
  .route("/rooms/:roomId")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    InventoryController.getSingleRoom,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    validateRequest(InventoryValidation.updateRoomZodSchema),
    InventoryController.updateRoom,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    InventoryController.deleteRoom,
  );

// Get items for a specific room
router.get(
  "/rooms/:roomId/items",
  auth(
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  InventoryController.getItemsByRoom,
);

// ======================== ITEM ROUTES ========================
router
  .route("/items")
  .post(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "itemPhotos", mode: "multiple" },
      { fieldName: "itemPhoto", mode: "single" },
      { fieldName: "image", mode: "single" },
    ),
    normalizeItemPhotoInput,
    validateRequest(InventoryValidation.createItemZodSchema),
    InventoryController.createItem,
  );

router
  .route("/items/:itemId")
  .get(
    auth(
      USER_ROLES.LANDLORD,
      USER_ROLES.TENANT,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    InventoryController.getSingleItem,
  )
  .patch(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    fileUploadHandler(),
    parseFileData(
      { fieldName: "itemPhotos", mode: "multiple" },
      { fieldName: "itemPhoto", mode: "single" },
      { fieldName: "image", mode: "single" },
    ),
    normalizeItemPhotoInput,
    validateRequest(InventoryValidation.updateItemZodSchema),
    InventoryController.updateItem,
  )
  .delete(
    auth(USER_ROLES.LANDLORD, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    InventoryController.deleteItem,
  );

export const InventoryRoutes = router;
