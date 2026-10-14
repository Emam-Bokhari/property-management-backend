import mongoose, { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { Property } from "./property.model";
import { TProperty } from "./property.interface";
import { propertySearchableFields } from "./property.constant";

// Create property (SaaS: sets landlord to the authenticated user)
const createPropertyToDB = async (
  userId: string,
  payload: TProperty,
): Promise<TProperty> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid user ID");
  }

  payload.landlord = new Types.ObjectId(userId);

  const result = await Property.create(payload);
  if (!result) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to create property");
  }

  return await result.populate([
    "propertyType",
    { path: "landlord", select: "firstName lastName email role profileImage" },
  ]);
};

// Get all properties (SaaS: strictly for the authenticated landlord/user)
const getAllPropertiesFromDB = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid user ID");
  }

  const baseQuery = Property.find({
    landlord: new Types.ObjectId(userId),
  })
    .populate("propertyType")
    .populate({
      path: "landlord",
      select: "firstName lastName email role profileImage",
    });

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(propertySearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [properties, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  return {
    meta,
    data: properties,
  };
};

// Get single property by ID (SaaS: owner only)
const getSinglePropertyFromDB = async (userId: string, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }

  const property = await Property.findById(id)
    .populate("propertyType")
    .populate({
      path: "landlord",
      select: "firstName lastName email role profileImage",
    });

  if (!property) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  const landlordId = (property.landlord as any)?._id
    ? (property.landlord as any)._id.toString()
    : property.landlord?.toString();

  if (landlordId !== userId.toString()) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to access this property",
    );
  }

  return property;
};

// Update property by ID (SaaS: owner only)
const updatePropertyToDB = async (
  userId: string,
  id: string,
  payload: Partial<TProperty>,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }

  const isExistProperty = await Property.findById(id);
  if (!isExistProperty) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  const landlordId = isExistProperty.landlord?.toString();
  if (landlordId !== userId.toString()) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to update this property",
    );
  }

  // Prevent changing ownership via update payload
  delete (payload as any).landlord;

  const updatedProperty = await Property.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  })
    .populate("propertyType")
    .populate({
      path: "landlord",
      select: "firstName lastName email role profileImage",
    });

  if (!updatedProperty) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to update property");
  }

  return updatedProperty;
};

// Delete property by ID (SaaS: owner only)
const deletePropertyFromDB = async (userId: string, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }

  const isExistProperty = await Property.findById(id);
  if (!isExistProperty) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  const landlordId = isExistProperty.landlord?.toString();
  if (landlordId !== userId.toString()) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to delete this property",
    );
  }

  const result = await Property.softDeleteById(id);
  if (!result) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to delete property");
  }

  return result;
};

export const PropertyService = {
  createPropertyToDB,
  getAllPropertiesFromDB,
  getSinglePropertyFromDB,
  updatePropertyToDB,
  deletePropertyFromDB,
};
