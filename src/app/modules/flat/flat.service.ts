import mongoose, { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { Flat } from "./flat.model";
import { Property } from "../property/property.model";
import {
  TFlat,
  TKey,
  TGas,
  TElectricity,
  TWater,
  TWifi,
  TSafetyAlarm,
  TAppliance,
} from "./flat.interface";
import { flatSearchableFields } from "./flat.constant";
import { USER_ROLES } from "../../../enums/user";
import unlinkFile from "../../../shared/unlinkFile";

// Common populate options
const flatPopulateOptions = [
  {
    path: "property",
    select: "propertyName streetAddress postCode propertyPhotos landlord propertyType",
  },
  {
    path: "landlord",
    select: "firstName lastName email role profileImage phone companyName",
  },
  {
    path: "tenant",
    select: "firstName lastName email role profileImage phone",
  },
  {
    path: "tenants",
    select: "firstName lastName email role profileImage phone",
  },
];

// Helper: check if authenticated user is the landlord or admin of this flat
const checkFlatOwnership = (user: JwtPayload, flat: any) => {
  if (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN) {
    return true;
  }

  const landlordId = flat.landlord?._id
    ? flat.landlord._id.toString()
    : flat.landlord?.toString();

  if (landlordId !== user.id) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to manage this flat",
    );
  }

  return true;
};

// 1. Create Flat
const createFlatToDB = async (
  userId: string,
  userRole: string,
  payload: TFlat,
): Promise<TFlat> => {
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

  if (
    userRole === USER_ROLES.LANDLORD &&
    propertyDoc.landlord &&
    propertyDoc.landlord.toString() !== userId
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to create a flat for this property",
    );
  }

  payload.landlord = propertyDoc.landlord || new Types.ObjectId(userId);

  const result = await Flat.create(payload);
  if (!result) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to create flat");
  }

  return (await Flat.findById(result._id).populate(flatPopulateOptions)) as any;
};

// 2. Get All Flats
const getAllFlatsFromDB = async (
  user: JwtPayload,
  query: Record<string, unknown>,
) => {
  const filter: Record<string, any> = {};

  if (user.role === USER_ROLES.LANDLORD) {
    filter.landlord = new Types.ObjectId(user.id);
  } else if (user.role === USER_ROLES.TENANT) {
    filter.$or = [
      { tenant: new Types.ObjectId(user.id) },
      { tenants: new Types.ObjectId(user.id) },
    ];
  }

  // Filter by property if passed in query
  if (query.property) {
    if (mongoose.Types.ObjectId.isValid(query.property as string)) {
      filter.property = new Types.ObjectId(query.property as string);
      delete query.property;
    }
  }

  const baseQuery = Flat.find(filter).populate(flatPopulateOptions);

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(flatSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [flats, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  return {
    meta,
    data: flats,
  };
};

// 3. Get Single Flat
const getSingleFlatFromDB = async (user: JwtPayload, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const flat = await Flat.findById(id).populate(flatPopulateOptions);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  if (user.role === USER_ROLES.LANDLORD) {
    checkFlatOwnership(user, flat);
  } else if (user.role === USER_ROLES.TENANT) {
    const isTenant =
      (flat.tenant && flat.tenant.toString() === user.id) ||
      (Array.isArray(flat.tenants) &&
        flat.tenants.some((t: any) =>
          (t._id ? t._id.toString() : t.toString()) === user.id,
        ));

    if (!isTenant) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to view this flat",
      );
    }
  }

  return flat;
};

// 4. Update Flat
const updateFlatToDB = async (
  user: JwtPayload,
  id: string,
  payload: Partial<TFlat>,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const isExistFlat = await Flat.findById(id);
  if (!isExistFlat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, isExistFlat);

  delete (payload as any).landlord;

  if (payload.property) {
    const prop = await Property.findById(payload.property);
    if (!prop || (prop as any).isDeleted) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
    }
    if (
      user.role === USER_ROLES.LANDLORD &&
      prop.landlord?.toString() !== user.id
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You are not authorized to assign this property",
      );
    }
  }

  const updatePayload: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      for (const [subKey, subVal] of Object.entries(value)) {
        if (subVal !== undefined) {
          updatePayload[`${key}.${subKey}`] = subVal;
        }
      }
    } else if (value !== undefined) {
      updatePayload[key] = value;
    }
  }

  const updatedFlat = await Flat.findByIdAndUpdate(
    id,
    { $set: updatePayload },
    { new: true, runValidators: true },
  ).populate(flatPopulateOptions);

  if (!updatedFlat) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to update flat");
  }

  return updatedFlat;
};

// 5. Delete Flat (soft delete)
const deleteFlatFromDB = async (user: JwtPayload, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const isExistFlat = await Flat.findById(id);
  if (!isExistFlat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, isExistFlat);

  const result = await Flat.softDeleteById(id);
  if (!result) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to delete flat");
  }

  return result;
};

// ------------------- KEY REGISTER -------------------
// 6. Add Key Set
const addKeyToFlatToDB = async (
  user: JwtPayload,
  flatId: string,
  payload: TKey,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  flat.key = flat.key || [];
  flat.key.push(payload as any);
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// 7. Update Specific Key Set
const updateKeyInFlatToDB = async (
  user: JwtPayload,
  flatId: string,
  keyId: string,
  payload: Partial<TKey>,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }
  if (!mongoose.Types.ObjectId.isValid(keyId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid key ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  const keyItem = (flat.key as any)?.id(keyId);
  if (!keyItem) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Key set not found");
  }

  Object.assign(keyItem, payload);
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// 8. Delete Specific Key Set
const deleteKeyFromFlatToDB = async (
  user: JwtPayload,
  flatId: string,
  keyId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }
  if (!mongoose.Types.ObjectId.isValid(keyId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid key ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  const keyItem = (flat.key as any)?.id(keyId);
  if (!keyItem) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Key set not found");
  }

  keyItem.deleteOne();
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// ------------------- UTILITIES (wifi, water, electricity, gas) -------------------
// 9. Upsert Gas (Create or Update/Replace)
const upsertGasToDB = async (
  user: JwtPayload,
  flatId: string,
  payload: Partial<TGas>,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  if (
    payload.meterPhoto &&
    flat.gas?.meterPhoto &&
    flat.gas.meterPhoto !== payload.meterPhoto
  ) {
    unlinkFile(flat.gas.meterPhoto);
  }

  const existingGas = flat.gas
    ? (flat.gas as any).toObject?.() || flat.gas
    : {};
  flat.gas = { ...existingGas, ...payload };
  flat.markModified("gas");
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// 10. Upsert Electricity (Create or Update/Replace)
const upsertElectricityToDB = async (
  user: JwtPayload,
  flatId: string,
  payload: Partial<TElectricity>,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  if (
    payload.meterPhoto &&
    flat.electricity?.meterPhoto &&
    flat.electricity.meterPhoto !== payload.meterPhoto
  ) {
    unlinkFile(flat.electricity.meterPhoto);
  }

  const existing = flat.electricity
    ? (flat.electricity as any).toObject?.() || flat.electricity
    : {};
  flat.electricity = { ...existing, ...payload };
  flat.markModified("electricity");
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// 11. Upsert Water (Create or Update/Replace)
const upsertWaterToDB = async (
  user: JwtPayload,
  flatId: string,
  payload: Partial<TWater>,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  if (
    payload.meterPhoto &&
    flat.water?.meterPhoto &&
    flat.water.meterPhoto !== payload.meterPhoto
  ) {
    unlinkFile(flat.water.meterPhoto);
  }

  const existing = flat.water
    ? (flat.water as any).toObject?.() || flat.water
    : {};
  flat.water = { ...existing, ...payload };
  flat.markModified("water");
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// 12. Upsert Wifi (Create or Update/Replace)
const upsertWifiToDB = async (
  user: JwtPayload,
  flatId: string,
  payload: Partial<TWifi>,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  if (
    payload.routerPhoto &&
    flat.wifi?.routerPhoto &&
    flat.wifi.routerPhoto !== payload.routerPhoto
  ) {
    unlinkFile(flat.wifi.routerPhoto);
  }

  const existing = flat.wifi
    ? (flat.wifi as any).toObject?.() || flat.wifi
    : {};
  flat.wifi = { ...existing, ...payload };
  flat.markModified("wifi");
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// ------------------- SAFETY ALARMS (Multiple, add, update, delete) -------------------
// 13. Add Safety Alarm
const addSafetyAlarmToDB = async (
  user: JwtPayload,
  flatId: string,
  payload: TSafetyAlarm,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  flat.safetyAlarms = flat.safetyAlarms || [];
  flat.safetyAlarms.push(payload as any);
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// 14. Update Specific Safety Alarm
const updateSafetyAlarmToDB = async (
  user: JwtPayload,
  flatId: string,
  alarmId: string,
  payload: Partial<TSafetyAlarm>,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }
  if (!mongoose.Types.ObjectId.isValid(alarmId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid alarm ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  const alarmItem = (flat.safetyAlarms as any)?.id(alarmId);
  if (!alarmItem) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Safety alarm not found");
  }

  if (
    payload.alarmPhoto &&
    alarmItem.alarmPhoto &&
    alarmItem.alarmPhoto !== payload.alarmPhoto
  ) {
    unlinkFile(alarmItem.alarmPhoto);
  }

  Object.assign(alarmItem, payload);
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// 15. Delete Specific Safety Alarm
const deleteSafetyAlarmFromDB = async (
  user: JwtPayload,
  flatId: string,
  alarmId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }
  if (!mongoose.Types.ObjectId.isValid(alarmId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid alarm ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  const alarmItem = (flat.safetyAlarms as any)?.id(alarmId);
  if (!alarmItem) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Safety alarm not found");
  }

  if (alarmItem.alarmPhoto) {
    unlinkFile(alarmItem.alarmPhoto);
  }

  alarmItem.deleteOne();
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// ------------------- APPLIANCES (Multiple, add, update, delete) -------------------
// 16. Add Appliance
const addApplianceToDB = async (
  user: JwtPayload,
  flatId: string,
  payload: TAppliance,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  flat.appliances = flat.appliances || [];
  flat.appliances.push(payload as any);
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// 17. Update Specific Appliance
const updateApplianceToDB = async (
  user: JwtPayload,
  flatId: string,
  applianceId: string,
  payload: Partial<TAppliance>,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }
  if (!mongoose.Types.ObjectId.isValid(applianceId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid appliance ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  const applianceItem = (flat.appliances as any)?.id(applianceId);
  if (!applianceItem) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Appliance not found");
  }

  if (
    payload.appliancePhoto &&
    applianceItem.appliancePhoto &&
    applianceItem.appliancePhoto !== payload.appliancePhoto
  ) {
    unlinkFile(applianceItem.appliancePhoto);
  }

  Object.assign(applianceItem, payload);
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

// 18. Delete Specific Appliance
const deleteApplianceFromDB = async (
  user: JwtPayload,
  flatId: string,
  applianceId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }
  if (!mongoose.Types.ObjectId.isValid(applianceId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid appliance ID");
  }

  const flat = await Flat.findById(flatId);
  if (!flat) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  checkFlatOwnership(user, flat);

  const applianceItem = (flat.appliances as any)?.id(applianceId);
  if (!applianceItem) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Appliance not found");
  }

  if (applianceItem.appliancePhoto) {
    unlinkFile(applianceItem.appliancePhoto);
  }

  applianceItem.deleteOne();
  await flat.save();

  return await Flat.findById(flatId).populate(flatPopulateOptions);
};

export const FlatService = {
  createFlatToDB,
  getAllFlatsFromDB,
  getSingleFlatFromDB,
  updateFlatToDB,
  deleteFlatFromDB,
  addKeyToFlatToDB,
  updateKeyInFlatToDB,
  deleteKeyFromFlatToDB,
  upsertGasToDB,
  upsertElectricityToDB,
  upsertWaterToDB,
  upsertWifiToDB,
  addSafetyAlarmToDB,
  updateSafetyAlarmToDB,
  deleteSafetyAlarmFromDB,
  addApplianceToDB,
  updateApplianceToDB,
  deleteApplianceFromDB,
};
