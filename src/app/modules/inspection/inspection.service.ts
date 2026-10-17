import mongoose, { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { USER_ROLES } from "../../../enums/user";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { InventoryRoom } from "../inventory/inventory.model";
import { Inspection } from "./inspection.model";
import { TInspection } from "./inspection.interface";
import { inspectionSearchableFields } from "./inspection.constant";
import unlinkFile from "../../../shared/unlinkFile";

// Helper: verify landlord ownership
const verifyLandlordOrAdmin = (user: JwtPayload, landlordId: any) => {
  if (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN) {
    return true;
  }
  const ownerStr = landlordId?._id
    ? landlordId._id.toString()
    : landlordId?.toString();
  if (ownerStr !== user.id) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to perform this inspection action",
    );
  }
  return true;
};

// 1. Create Inspection (Landlord / Admin)
const createInspectionToDB = async (
  user: JwtPayload,
  payload: TInspection,
): Promise<TInspection> => {
  if (!mongoose.Types.ObjectId.isValid(payload.property.toString())) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }

  const propertyDoc = await Property.findById(payload.property);
  if (!propertyDoc || (propertyDoc as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  verifyLandlordOrAdmin(user, propertyDoc.landlord);

  if (payload.flat) {
    if (!mongoose.Types.ObjectId.isValid(payload.flat.toString())) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
    }
    const flatDoc = await Flat.findById(payload.flat);
    if (!flatDoc || (flatDoc as any).isDeleted) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
    }
    if (flatDoc.property.toString() !== payload.property.toString()) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "The flat does not belong to the specified property",
      );
    }
  }

  payload.inspector = new Types.ObjectId(user.id);

  const result = await Inspection.create(payload);
  return (await Inspection.findById(result._id)
    .populate(
      "property",
      "propertyName streetAddress postCode propertyPhotos landlord",
    )
    .populate("flat", "unitName floor")
    .populate(
      "inspector",
      "firstName lastName email role profileImage",
    )) as any;
};

// 2. Get All Inspections (Landlord / Tenant / Admin)
const getAllInspectionsFromDB = async (
  user: JwtPayload,
  query: Record<string, unknown>,
) => {
  const filter: Record<string, any> = { isDeleted: { $ne: true } };

  if (user.role === USER_ROLES.TENANT) {
    // Tenant only sees inspections for their assigned flat and communal areas of their property
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

    filter.$or = [
      { flat: tenantFlat._id },
      { property: tenantFlat.property, isCommunalArea: true },
    ];
  } else if (user.role === USER_ROLES.LANDLORD) {
    // Get all properties belonging to this landlord
    const properties = await Property.find({
      landlord: new Types.ObjectId(user.id),
      isDeleted: { $ne: true },
    }).select("_id");

    const propertyIds = properties.map((p) => p._id);

    filter.property = { $in: propertyIds };

    if (
      query.property &&
      mongoose.Types.ObjectId.isValid(query.property as string)
    ) {
      filter.property = new Types.ObjectId(query.property as string);
    }
    if (query.flat && mongoose.Types.ObjectId.isValid(query.flat as string)) {
      filter.flat = new Types.ObjectId(query.flat as string);
    }
    if (query.isCommunalArea !== undefined) {
      filter.isCommunalArea = query.isCommunalArea === "true";
    }
  } else {
    // Admin
    if (
      query.property &&
      mongoose.Types.ObjectId.isValid(query.property as string)
    ) {
      filter.property = new Types.ObjectId(query.property as string);
    }
    if (query.flat && mongoose.Types.ObjectId.isValid(query.flat as string)) {
      filter.flat = new Types.ObjectId(query.flat as string);
    }
    if (query.isCommunalArea !== undefined) {
      filter.isCommunalArea = query.isCommunalArea === "true";
    }
  }

  delete query.property;
  delete query.flat;
  delete query.isCommunalArea;

  const baseQuery = Inspection.find(filter)
    .populate("property", "propertyName streetAddress postCode propertyPhotos")
    .populate("flat", "unitName floor")
    .populate("inspector", "firstName lastName email role profileImage");

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(inspectionSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [inspections, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  return {
    meta,
    data: inspections,
  };
};

// 3. Get Single Inspection Details (Landlord / Tenant / Admin)
const getSingleInspectionFromDB = async (user: JwtPayload, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid inspection ID");
  }

  const inspection = await Inspection.findOne({
    _id: id,
    isDeleted: { $ne: true },
  })
    .populate(
      "property",
      "propertyName streetAddress postCode propertyPhotos landlord",
    )
    .populate("flat", "unitName floor tenant tenants")
    .populate("inspector", "firstName lastName email role profileImage")
    .populate("roomChecklist.maintenanceJob");

  if (!inspection) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Inspection report not found");
  }

  // Access validation for Tenant
  if (user.role === USER_ROLES.TENANT) {
    const propertyDoc = inspection.property as any;
    const flatDoc = inspection.flat as any;

    const isTenantOfFlat =
      flatDoc &&
      (flatDoc.tenant?.toString() === user.id ||
        (flatDoc.tenants &&
          flatDoc.tenants.some((t: any) => t.toString() === user.id)));

    const isCommunalOfTenantProperty =
      inspection.isCommunalArea &&
      (await Flat.exists({
        property: propertyDoc._id,
        $or: [
          { tenant: new Types.ObjectId(user.id) },
          { tenants: new Types.ObjectId(user.id) },
        ],
        isDeleted: { $ne: true },
      }));

    if (!isTenantOfFlat && !isCommunalOfTenantProperty) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to view this inspection report",
      );
    }
  } else if (user.role === USER_ROLES.LANDLORD) {
    const propertyDoc = inspection.property as any;
    verifyLandlordOrAdmin(user, propertyDoc.landlord);
  }

  return inspection;
};

// 4. Get Checklist Template for Flat (Landlord / Admin)
const getChecklistTemplateByFlatFromDB = async (
  user: JwtPayload,
  flatId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(flatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid flat ID");
  }

  const flatDoc = await Flat.findOne({
    _id: flatId,
    isDeleted: { $ne: true },
  })
    .populate("property", "propertyName streetAddress postCode landlord")
    .populate("tenant", "firstName lastName email phone");

  if (!flatDoc) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Flat not found");
  }

  verifyLandlordOrAdmin(user, flatDoc.landlord);

  // Fetch rooms configured for this flat
  const rooms = await InventoryRoom.find({
    flat: flatId,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: 1 })
    .lean();

  // If rooms exist, map them. Otherwise, default standard rooms can be suggested
  const template = rooms.map((r) => ({
    room: r._id,
    roomName: r.roomName,
    roomSize: r.roomSize,
    status: "pass",
    defectNotes: "",
    repairLogged: false,
  }));

  return {
    flat: {
      _id: flatDoc._id,
      unitName: flatDoc.unitName,
      floor: flatDoc.floor,
      property: flatDoc.property,
      tenant: flatDoc.tenant,
    },
    roomsCount: rooms.length,
    checklistTemplate: template,
  };
};

// 5. Update Inspection Report (Landlord / Admin)
const updateInspectionInDB = async (
  user: JwtPayload,
  id: string,
  payload: Partial<TInspection>,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid inspection ID");
  }

  const inspection = await Inspection.findOne({
    _id: id,
    isDeleted: { $ne: true },
  }).populate("property", "landlord");

  if (!inspection) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Inspection report not found");
  }

  const propertyDoc = inspection.property as any;
  verifyLandlordOrAdmin(user, propertyDoc?.landlord);

  const updatedInspection = await Inspection.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  })
    .populate("property", "propertyName streetAddress postCode propertyPhotos")
    .populate("flat", "unitName floor")
    .populate("inspector", "firstName lastName email role profileImage");

  return updatedInspection;
};

// 6. Delete Inspection Report (Landlord / Admin)
const deleteInspectionFromDB = async (user: JwtPayload, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid inspection ID");
  }

  const inspection = await Inspection.findOne({
    _id: id,
    isDeleted: { $ne: true },
  }).populate("property", "landlord");

  if (!inspection) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Inspection report not found");
  }

  const propertyDoc = inspection.property as any;
  verifyLandlordOrAdmin(user, propertyDoc?.landlord);

  if (inspection.inspectionPhotos && inspection.inspectionPhotos.length > 0) {
    for (const photo of inspection.inspectionPhotos) {
      unlinkFile(photo);
    }
  }

  const deletedInspection = await (inspection as any).softDelete();
  return deletedInspection;
};

// 7. Log Repair from Inspection (Landlord / Admin)
const logRepairFromInspectionInDB = async (
  user: JwtPayload,
  inspectionId: string,
  payload: {
    checklistItemId: string;
    issueTitle?: string;
    priority?: string;
    description?: string;
  },
) => {
  if (!mongoose.Types.ObjectId.isValid(inspectionId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid inspection ID");
  }

  const inspection = await Inspection.findOne({
    _id: inspectionId,
    isDeleted: { $ne: true },
  }).populate("property", "landlord");

  if (!inspection) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Inspection report not found");
  }

  const propertyDoc = inspection.property as any;
  verifyLandlordOrAdmin(user, propertyDoc?.landlord);

  const itemIndex = inspection.roomChecklist.findIndex(
    (item: any) => item._id?.toString() === payload.checklistItemId,
  );

  if (itemIndex === -1) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Checklist item not found in this inspection",
    );
  }

  inspection.roomChecklist[itemIndex].repairLogged = true;
  if (payload.description) {
    inspection.roomChecklist[itemIndex].defectNotes = payload.description;
  }

  await inspection.save();

  return {
    inspectionId: inspection._id,
    checklistItem: inspection.roomChecklist[itemIndex],
    message: "Repair logged successfully for this defect",
  };
};

export const InspectionService = {
  createInspectionToDB,
  getAllInspectionsFromDB,
  getSingleInspectionFromDB,
  getChecklistTemplateByFlatFromDB,
  updateInspectionInDB,
  deleteInspectionFromDB,
  logRepairFromInspectionInDB,
};
