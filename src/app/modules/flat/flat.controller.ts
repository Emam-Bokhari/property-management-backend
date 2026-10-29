import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { FlatService } from "./flat.service";

// 1. Create Flat
const createFlat = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.createFlatToDB(user.id, user.role, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Flat created successfully",
    data: result,
  });
});

// 2. Get All Flats
const getAllFlats = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.getAllFlatsFromDB(user, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flats retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// 3. Get Single Flat
const getSingleFlat = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.getSingleFlatFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat retrieved successfully",
    data: result,
  });
});

// 4. Update Flat
const updateFlat = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.updateFlatToDB(user, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat updated successfully",
    data: result,
  });
});

// 5. Delete Flat
const deleteFlat = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.deleteFlatFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat deleted successfully",
    data: result,
  });
});

// ------------------- KEY REGISTER CONTROLLERS -------------------
// 6. Add Key Set
const addKey = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.addKeyToFlatToDB(user, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Key set added to flat successfully",
    data: result,
  });
});

// 7. Update Key Set
const updateKey = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id, keyId } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.updateKeyInFlatToDB(
    user,
    id,
    keyId,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Key set updated successfully",
    data: result,
  });
});

// 8. Delete Key Set
const deleteKey = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id, keyId } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.deleteKeyFromFlatToDB(user, id, keyId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Key set deleted successfully",
    data: result,
  });
});

// ------------------- UTILITIES CONTROLLERS -------------------
// 9. Upsert Gas
const upsertGas = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.upsertGasToDB(user, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat gas details saved successfully",
    data: result,
  });
});

// 10. Upsert Electricity
const upsertElectricity = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.upsertElectricityToDB(user, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat electricity details saved successfully",
    data: result,
  });
});

// 11. Upsert Water
const upsertWater = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.upsertWaterToDB(user, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat water details saved successfully",
    data: result,
  });
});

// 12. Upsert Wifi
const upsertWifi = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.upsertWifiToDB(user, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat WiFi details saved successfully",
    data: result,
  });
});

// ------------------- SAFETY ALARMS CONTROLLERS -------------------
// 13. Add Safety Alarm
const addSafetyAlarm = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.addSafetyAlarmToDB(user, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Safety alarm added to flat successfully",
    data: result,
  });
});

// 14. Update Safety Alarm
const updateSafetyAlarm = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id, alarmId } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.updateSafetyAlarmToDB(
    user,
    id,
    alarmId,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Safety alarm updated successfully",
    data: result,
  });
});

// 15. Delete Safety Alarm
const deleteSafetyAlarm = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id, alarmId } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.deleteSafetyAlarmFromDB(user, id, alarmId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Safety alarm deleted successfully",
    data: result,
  });
});

// ------------------- APPLIANCES CONTROLLERS -------------------
// 16. Add Appliance
const addAppliance = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.addApplianceToDB(user, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Appliance added to flat successfully",
    data: result,
  });
});

// 17. Update Appliance
const updateAppliance = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id, applianceId } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.updateApplianceToDB(
    user,
    id,
    applianceId,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appliance updated successfully",
    data: result,
  });
});

// 18. Delete Appliance
const deleteAppliance = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id, applianceId } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.deleteApplianceFromDB(user, id, applianceId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appliance deleted successfully",
    data: result,
  });
});

// 19. Get Keys By Flat ID
const getKeysByFlatId = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.getKeysByFlatIdFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat keys retrieved successfully",
    data: result,
  });
});

// 20. Get Safety Alarms By Flat ID
const getSafetyAlarmsByFlatId = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const { id } = req.params;
    if (!user?.id) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await FlatService.getSafetyAlarmsByFlatIdFromDB(user, id);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Flat safety alarms retrieved successfully",
      data: result,
    });
  },
);

// 21. Get Appliances By Flat ID
const getAppliancesByFlatId = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.getAppliancesByFlatIdFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat appliances retrieved successfully",
    data: result,
  });
});

// 22. Get Combined Utilities By Flat ID (WiFi, Water, Electricity, Gas)
const getUtilitiesByFlatId = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.getUtilitiesByFlatIdFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat utilities retrieved successfully",
    data: result,
  });
});

// 23. Get Gas By Flat ID
const getGas = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.getGasByFlatIdFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat gas details retrieved successfully",
    data: result,
  });
});

// 24. Get Electricity By Flat ID
const getElectricity = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.getElectricityByFlatIdFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat electricity details retrieved successfully",
    data: result,
  });
});

// 25. Get Water By Flat ID
const getWater = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.getWaterByFlatIdFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat water details retrieved successfully",
    data: result,
  });
});

// 26. Get Wifi By Flat ID
const getWifi = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.getWifiByFlatIdFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat WiFi details retrieved successfully",
    data: result,
  });
});

// 27. Get Tenants By Flat ID
const getTenantsByFlatId = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?.id) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await FlatService.getTenantsByFlatIdFromDB(user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Flat tenant details retrieved successfully",
    data: result,
  });
});

export const FlatController = {
  createFlat,
  getAllFlats,
  getSingleFlat,
  updateFlat,
  deleteFlat,
  addKey,
  updateKey,
  deleteKey,
  upsertGas,
  upsertElectricity,
  upsertWater,
  upsertWifi,
  addSafetyAlarm,
  updateSafetyAlarm,
  deleteSafetyAlarm,
  addAppliance,
  updateAppliance,
  deleteAppliance,
  getKeysByFlatId,
  getSafetyAlarmsByFlatId,
  getAppliancesByFlatId,
  getUtilitiesByFlatId,
  getGas,
  getElectricity,
  getWater,
  getWifi,
  getTenantsByFlatId,
};
