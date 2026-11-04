import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { PropertyService } from "./property.service";

const createProperty = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await PropertyService.createPropertyToDB(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Property created successfully",
    data: result,
  });
});

const getAllProperties = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await PropertyService.getAllPropertiesFromDB(
    req.user,
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Properties retrieved successfully",
    meta: result.meta,
    stats: result.stats,
    data: result.data,
  });
});

const getSingleProperty = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await PropertyService.getSinglePropertyFromDB(req.user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property retrieved successfully",
    data: result,
  });
});

const updateProperty = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await PropertyService.updatePropertyToDB(userId, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property updated successfully",
    data: result,
  });
});

const updateCouncil = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await PropertyService.updateCouncilToDB(userId, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property council details updated successfully",
    data: result,
  });
});

const updateParking = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await PropertyService.updateParkingToDB(userId, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property parking details updated successfully",
    data: result,
  });
});

const updateCompliance = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await PropertyService.updateComplianceToDB(
    userId,
    id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property compliance certificate updated successfully",
    data: result,
  });
});

const deleteProperty = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await PropertyService.deletePropertyFromDB(userId, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property deleted successfully",
    data: result,
  });
});

const updateFloorPlans = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const { floorPlanPhotos } = req.body;

  const result = await PropertyService.updateFloorPlansToDB(userId, id, {
    floorPlanPhotos,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property floor plans updated successfully",
    data: result,
  });
});

const deleteFloorPlans = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const photoUrl =
    req.body?.photoUrl ||
    req.body?.floorPlanUrl ||
    req.query?.photoUrl ||
    req.query?.floorPlanUrl;

  const result = await PropertyService.deleteFloorPlanFromDB(userId, id, {
    photoUrl: photoUrl as string,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: photoUrl
      ? "Property floor plan deleted successfully"
      : "Property floor plans deleted successfully",
    data: result,
  });
});

const getHouseRules = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await PropertyService.getHouseRulesFromDB(req.user, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property house rules retrieved successfully",
    data: result,
  });
});

const updateHouseRules = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const { houseRules } = req.body;

  const result = await PropertyService.updateHouseRulesToDB(userId, id, {
    houseRules,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property house rules updated successfully",
    data: result,
  });
});

const deleteCompliance = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const complianceType = req.body.complianceType || req.query.complianceType;
  const certificateUrl = req.body.certificateUrl || req.query.certificateUrl;

  const result = await PropertyService.deleteComplianceFromDB(userId, id, {
    complianceType,
    certificateUrl,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property compliance certificate deleted successfully",
    data: result,
  });
});

const getCompliance = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const result = await PropertyService.getComplianceFromDB(
    req.user,
    id,
    req.query as { complianceType?: string },
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property compliance retrieved successfully",
    data: result,
  });
});

const updatePropertyPhotos = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const { propertyPhotos } = req.body;

  const result = await PropertyService.updatePropertyPhotosToDB(userId, id, {
    propertyPhotos,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Property photos added successfully",
    data: result,
  });
});

const deletePropertyPhoto = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  }

  const photoUrl = req.body?.photoUrl || req.query?.photoUrl;

  const result = await PropertyService.deletePropertyPhotoFromDB(userId, id, {
    photoUrl: photoUrl as string,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: photoUrl
      ? "Property photo deleted successfully"
      : "Property photos deleted successfully",
    data: result,
  });
});

export const PropertyController = {
  createProperty,
  getAllProperties,
  getSingleProperty,
  updateProperty,
  updateCouncil,
  updateParking,
  updateCompliance,
  getCompliance,
  deleteCompliance,
  updateFloorPlans,
  deleteFloorPlans,
  updatePropertyPhotos,
  deletePropertyPhoto,
  getHouseRules,
  updateHouseRules,
  deleteProperty,
};
