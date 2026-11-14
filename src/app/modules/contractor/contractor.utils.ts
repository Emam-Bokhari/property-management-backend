import mongoose, { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { USER_ROLES } from "../../../enums/user";
import { Contractor } from "./contractor.model";
import { Maintenance } from "../maintenance/maintenance.model";
import { Property } from "../property/property.model";
import { User } from "../user/user.model";
import { Flat } from "../flat/flat.model";
import { CONTRACTOR_RELATION_STATUS } from "./contractor.constant";

/**
 * Resolves the target Contractor ObjectId.
 * For contractor, defaults to authUser's id.
 * For admin/super_admin, accepts query.contractorId override.
 */
export const resolveTargetContractorObjectId = (
  authUser: JwtPayload,
  query?: Record<string, unknown>,
): Types.ObjectId => {
  let targetContractorId = authUser.userId || authUser.id;

  if (
    (authUser.role === USER_ROLES.ADMIN ||
      authUser.role === USER_ROLES.SUPER_ADMIN) &&
    query?.contractorId &&
    typeof query.contractorId === "string"
  ) {
    targetContractorId = query.contractorId;
  }

  if (
    !targetContractorId ||
    !mongoose.Types.ObjectId.isValid(targetContractorId)
  ) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid contractor ID");
  }

  return new Types.ObjectId(targetContractorId);
};

/**
 * Fetches all Property ObjectIds accessible to a contractor:
 * 1. Properties owned by landlords who actively invited/assigned this contractor.
 * 2. Properties where this contractor has been directly assigned maintenance jobs.
 * 3. Property assigned directly on the contractor's User model (if any).
 * 4. Property associated with any Flat assigned directly to the contractor (if any).
 */
export const getContractorAccessiblePropertyIds = async (
  contractorUserId: string | Types.ObjectId,
): Promise<Types.ObjectId[]> => {
  const contractorObjectId =
    typeof contractorUserId === "string"
      ? new Types.ObjectId(contractorUserId)
      : contractorUserId;

  const [contractorUser, relations, maintenanceJobs] = await Promise.all([
    User.findById(contractorObjectId).select("property flat").lean(),
    Contractor.find({
      contractor: contractorObjectId,
      isDeleted: { $ne: true },
    })
      .select("landlord status")
      .lean(),
    Maintenance.find({
      contractor: contractorObjectId,
      isDeleted: { $ne: true },
    })
      .select("property landlord")
      .lean(),
  ]);

  const activeLandlordIds: Types.ObjectId[] = [];
  const suspendedLandlordIds = new Set<string>();

  for (const rel of relations) {
    if (!rel.landlord) continue;
    const lidStr = rel.landlord.toString();
    if (rel.status === CONTRACTOR_RELATION_STATUS.ACTIVE) {
      if (!activeLandlordIds.some((id) => id.toString() === lidStr)) {
        activeLandlordIds.push(new Types.ObjectId(lidStr));
      }
    } else {
      suspendedLandlordIds.add(lidStr);
    }
  }

  const directJobPropertyIds: Types.ObjectId[] = [];
  for (const job of maintenanceJobs) {
    if (!job.property) continue;
    const jobLandlordStr = job.landlord?.toString();
    if (jobLandlordStr && suspendedLandlordIds.has(jobLandlordStr)) {
      continue;
    }
    const pidStr = job.property.toString();
    if (!directJobPropertyIds.some((id) => id.toString() === pidStr)) {
      directJobPropertyIds.push(new Types.ObjectId(pidStr));
    }
  }

  // Include property from contractor's user document if assigned
  if (contractorUser?.property) {
    const userPropStr = contractorUser.property.toString();
    if (!directJobPropertyIds.some((id) => id.toString() === userPropStr)) {
      directJobPropertyIds.push(new Types.ObjectId(userPropStr));
    }
  }

  // Include property from contractor's flat document if assigned
  if (contractorUser?.flat) {
    const flatDoc = await Flat.findById(contractorUser.flat)
      .select("property")
      .lean();
    if (flatDoc?.property) {
      const flatPropStr = flatDoc.property.toString();
      if (!directJobPropertyIds.some((id) => id.toString() === flatPropStr)) {
        directJobPropertyIds.push(new Types.ObjectId(flatPropStr));
      }
    }
  }

  const orScope: Record<string, unknown>[] = [];
  if (activeLandlordIds.length > 0) {
    orScope.push({ landlord: { $in: activeLandlordIds } });
  }
  if (directJobPropertyIds.length > 0) {
    orScope.push({ _id: { $in: directJobPropertyIds } });
  }

  if (orScope.length === 0) {
    return [];
  }

  const properties = await Property.find({
    $or: orScope,
    isDeleted: { $ne: true },
  })
    .select("_id")
    .lean();

  return properties.map((p) => p._id as Types.ObjectId);
};

