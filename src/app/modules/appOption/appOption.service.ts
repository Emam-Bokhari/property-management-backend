import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { AppOption } from "./appOption.model";
import { TAppOption } from "./appOption.interface";
import { AppOptionType, appOptionSearchableFields } from "./appOption.constant";

// Create App Option
const createAppOptionToDB = async (
  payload: TAppOption,
): Promise<TAppOption> => {
  const existingOption = await AppOption.findOne({
    name: { $regex: new RegExp(`^${payload.name.trim()}$`, "i") },
    type: payload.type,
  });

  if (existingOption) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      `App option '${payload.name}' already exists for type '${payload.type}'`,
    );
  }

  const result = await AppOption.create(payload);
  if (!result) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to create app option");
  }

  return result;
};

// Get All App Options (with search, filter, pagination, sort)
const getAllAppOptionsFromDB = async (query: Record<string, unknown>) => {
  const queryObj = { ...query };

  // Normalize boolean filter for isActive
  if (queryObj.isActive !== undefined) {
    if (queryObj.isActive === "true" || queryObj.isActive === true) {
      queryObj.isActive = true;
    } else if (queryObj.isActive === "false" || queryObj.isActive === false) {
      queryObj.isActive = false;
    }
  }

  const appOptionQuery = new QueryBuilder(AppOption.find(), queryObj)
    .search(appOptionSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [options, meta] = await Promise.all([
    appOptionQuery.modelQuery.lean(),
    appOptionQuery.countTotal(),
  ]);

  return {
    meta,
    data: options,
  };
};

// Get Single App Option by ID
const getSingleAppOptionFromDB = async (
  id: string,
): Promise<TAppOption | null> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid App Option ID");
  }

  const result = await AppOption.findById(id);
  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "App option not found");
  }

  return result;
};

// Update App Option
const updateAppOptionToDB = async (
  id: string,
  payload: Partial<TAppOption>,
): Promise<TAppOption | null> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid App Option ID");
  }

  const existingOption = await AppOption.findById(id);
  if (!existingOption) {
    throw new ApiError(StatusCodes.NOT_FOUND, "App option not found");
  }

  // Check for uniqueness conflict if name or type is changed
  if (payload.name || payload.type) {
    const targetName = payload.name ? payload.name.trim() : existingOption.name;
    const targetType = payload.type || existingOption.type;

    const conflict = await AppOption.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${targetName}$`, "i") },
      type: targetType,
    });

    if (conflict) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        `An option with name '${targetName}' already exists for type '${targetType}'`,
      );
    }
  }

  const result = await AppOption.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });

  return result;
};

// Delete App Option (Soft Delete)
const deleteAppOptionFromDB = async (
  id: string,
): Promise<TAppOption | null> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid App Option ID");
  }

  const existingOption = await AppOption.findById(id);
  if (!existingOption) {
    throw new ApiError(StatusCodes.NOT_FOUND, "App option not found");
  }

  const result = await AppOption.softDeleteById(id);
  return result;
};

export const AppOptionService = {
  createAppOptionToDB,
  getAllAppOptionsFromDB,
  getSingleAppOptionFromDB,
  updateAppOptionToDB,
  deleteAppOptionFromDB,
};
