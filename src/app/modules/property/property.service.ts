import mongoose, { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { Property } from "./property.model";
import {
  TProperty,
  TCouncil,
  TParking,
  TCompliance,
  IPropertyStats,
} from "./property.interface";
import { propertySearchableFields, COMPLIANCE_TYPE } from "./property.constant";
import { User } from "../user/user.model";
import { Flat } from "../flat/flat.model";
import { Tenancy } from "../tenant/tenant.model";
import { TENANCY_STATUS } from "../tenant/tenant.constant";
import { USER_ROLES } from "../../../enums/user";
import { formatCurrency } from "../../../helpers/currencyHelper";

const complianceKeyMap: Record<string, keyof TCompliance> = {
  [COMPLIANCE_TYPE.GAS_SAFETY]: "gasSafety",
  gasSafety: "gasSafety",
  [COMPLIANCE_TYPE.ELECTRICAL]: "electrical",
  [COMPLIANCE_TYPE.ENERGY_PERFORMANCE]: "energyPerformance",
  energyPerformance: "energyPerformance",
  [COMPLIANCE_TYPE.LANDLORD_INSURANCE]: "landlordInsurance",
  landlordInsurance: "landlordInsurance",
  [COMPLIANCE_TYPE.DEPOSIT_PROTECTION]: "depositProtection",
  depositProtection: "depositProtection",
  [COMPLIANCE_TYPE.PROPERTY_LICENCE]: "propertyLicense",
  propertyLicense: "propertyLicense",
  [COMPLIANCE_TYPE.OTHER_DOCUMENTS]: "otherDocuments",
  otherDocuments: "otherDocuments",
};

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

// Get all properties (SaaS: strictly for the authenticated landlord/tenant/admin)
const getAllPropertiesFromDB = async (
  user: any,
  query: Record<string, unknown>,
) => {
  const userId = typeof user === "string" ? user : user.id;
  const userRole = typeof user === "string" ? USER_ROLES.LANDLORD : user.role;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid user ID");
  }

  // Base scope filter strictly isolating data by SaaS role
  const scopeFilter: Record<string, any> = {
    isDeleted: { $ne: true },
  };

  if (userRole === USER_ROLES.LANDLORD) {
    scopeFilter.landlord = new Types.ObjectId(userId);
  } else if (userRole === USER_ROLES.TENANT) {
    const tenantUser = await User.findById(userId);
    const tenantPropertyIds: Types.ObjectId[] = [];
    if (tenantUser?.property) {
      tenantPropertyIds.push(new Types.ObjectId(tenantUser.property));
    }
    const assignedFlats = await Flat.find({
      $or: [
        { tenant: new Types.ObjectId(userId) },
        { tenants: new Types.ObjectId(userId) },
      ],
      isDeleted: { $ne: true },
    }).select("property");
    for (const f of assignedFlats) {
      if (
        f.property &&
        !tenantPropertyIds.some((p) => p.toString() === f.property.toString())
      ) {
        tenantPropertyIds.push(f.property);
      }
    }
    scopeFilter._id = { $in: tenantPropertyIds };
  } else if (
    (userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.SUPER_ADMIN) &&
    query.landlord &&
    mongoose.Types.ObjectId.isValid(query.landlord as string)
  ) {
    scopeFilter.landlord = new Types.ObjectId(query.landlord as string);
  }

  // 1. Fetch all properties belonging to the scoped user to calculate portfolio stats
  const scopedProperties = await Property.find(scopeFilter)
    .select("_id")
    .lean();
  const allPropertyIds = scopedProperties.map((p) => p._id);
  const totalProperties = allPropertyIds.length;

  // 2. Fetch all flats and active tenancies belonging to these properties
  const [allFlats, activeTenancies] = await Promise.all([
    Flat.find({
      property: { $in: allPropertyIds },
      isDeleted: { $ne: true },
    })
      .select("_id property unitName rentPerMonth tenant tenants")
      .lean(),
    Tenancy.find({
      property: { $in: allPropertyIds },
      status: TENANCY_STATUS.ACTIVE,
      isDeleted: { $ne: true },
    })
      .select("flat property tenant")
      .lean(),
  ]);

  const totalUnits = allFlats.length;

  const activeTenancyFlatIds = new Set(
    activeTenancies.map((t) => t.flat?.toString()).filter(Boolean),
  );

  const isFlatOccupied = (flat: any): boolean =>
    Boolean(
      flat.tenant ||
        (Array.isArray(flat.tenants) && flat.tenants.length > 0) ||
        activeTenancyFlatIds.has(flat._id.toString()),
    );

  // Group flats by property ID
  const flatsByProperty: Record<string, any[]> = {};
  for (const flat of allFlats) {
    const propId = flat.property.toString();
    if (!flatsByProperty[propId]) {
      flatsByProperty[propId] = [];
    }
    flatsByProperty[propId].push(flat);
  }

  let totalOccupiedUnits = 0;
  const occupiedPropertyIdSet = new Set<string>();
  const vacantPropertyIdSet = new Set<string>();

  for (const pId of allPropertyIds.map((id) => id.toString())) {
    const propFlats = flatsByProperty[pId] || [];
    const pOccupiedCount = propFlats.filter(isFlatOccupied).length;
    if (pOccupiedCount > 0) {
      occupiedPropertyIdSet.add(pId);
    } else {
      vacantPropertyIdSet.add(pId);
    }
  }

  for (const flat of allFlats) {
    if (isFlatOccupied(flat)) {
      totalOccupiedUnits++;
    }
  }

  const overallOccupancyRate =
    totalUnits > 0 ? Math.round((totalOccupiedUnits / totalUnits) * 100) : 0;
  const overallOccupancy = `${overallOccupancyRate}%`;

  const stats: IPropertyStats = {
    totalProperties,
    totalUnits,
    overallOccupancy,
  };

  // 3. Prepare filtered query for pagination & listing
  const filter: Record<string, any> = { ...scopeFilter };

  // Handle optional status filter from frontend tabs: "occupied", "vacant", "all"
  const rawStatus = (query.status || query.occupancyStatus) as
    | string
    | undefined;
  if (rawStatus) {
    const normalizedStatus = rawStatus.toLowerCase().trim();
    if (normalizedStatus === "occupied") {
      filter._id = {
        $in: Array.from(occupiedPropertyIdSet).map(
          (id) => new Types.ObjectId(id),
        ),
      };
    } else if (normalizedStatus === "vacant") {
      filter._id = {
        $in: Array.from(vacantPropertyIdSet).map(
          (id) => new Types.ObjectId(id),
        ),
      };
    }
    delete query.status;
    delete query.occupancyStatus;
  }

  const baseQuery = Property.find(filter).populate("propertyType").populate({
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

  // Enrich each property with units, rent, and occupancy breakdown
  const enhancedProperties = properties.map((prop: any) => {
    const pId = prop._id.toString();
    const propFlats = flatsByProperty[pId] || [];
    const propTotalUnits = propFlats.length;
    let propOccupiedUnits = 0;
    let propMonthlyRent = 0;

    for (const flat of propFlats) {
      propMonthlyRent += Number(flat.rentPerMonth) || 0;
      if (isFlatOccupied(flat)) {
        propOccupiedUnits++;
      }
    }

    const propOccupancyRate =
      propTotalUnits > 0
        ? Math.round((propOccupiedUnits / propTotalUnits) * 100)
        : 0;

    const occupancyBadge =
      propTotalUnits === 0
        ? "No Units"
        : propOccupiedUnits === 0
        ? "Vacant"
        : `${propOccupiedUnits}/${propTotalUnits} occupied`;

    return {
      ...prop,
      totalUnits: propTotalUnits,
      occupiedUnits: propOccupiedUnits,
      occupancyRate: propOccupancyRate,
      formattedOccupancyRate: `${propOccupancyRate}%`,
      occupancyPercentage: propOccupancyRate,
      occupancyStatus: occupancyBadge,
      occupancyBadge,
      monthlyRent: propMonthlyRent,
      formattedMonthlyRent: formatCurrency(propMonthlyRent),
    };
  });

  return {
    meta,
    stats,
    data: enhancedProperties,
  };
};

// Get single property by ID (SaaS: landlord or assigned tenant only)
const getSinglePropertyFromDB = async (user: any, id: string) => {
  const userId = typeof user === "string" ? user : user.id;
  const userRole = typeof user === "string" ? USER_ROLES.LANDLORD : user.role;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }

  const property = await Property.findById(id)
    .populate("propertyType")
    .populate({
      path: "landlord",
      select: "firstName lastName email role profileImage",
    });

  if (!property || (property as any).isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  if (userRole === USER_ROLES.LANDLORD) {
    const landlordId = (property.landlord as any)?._id
      ? (property.landlord as any)._id.toString()
      : property.landlord?.toString();

    if (landlordId !== userId.toString()) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have permission to access this property",
      );
    }
  } else if (userRole === USER_ROLES.TENANT) {
    const tenantUser = await User.findById(userId);
    const isDirectProperty = tenantUser?.property?.toString() === id.toString();
    const hasFlatInProperty = await Flat.exists({
      property: new Types.ObjectId(id),
      $or: [
        { tenant: new Types.ObjectId(userId) },
        { tenants: new Types.ObjectId(userId) },
      ],
      isDeleted: { $ne: true },
    });

    if (!isDirectProperty && !hasFlatInProperty) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "You do not have access to this property",
      );
    }
  }

  const [propFlats, tenancies] = await Promise.all([
    Flat.find({
      property: new Types.ObjectId(id),
      isDeleted: { $ne: true },
    })
      .populate({
        path: "tenant",
        select:
          "name email phone profileImage dateOfBirth nidNumber nidPhoto emergencyPhone emergencyContact address status role verified",
      })
      .sort({ floor: 1, unitName: 1 })
      .lean(),
    Tenancy.find({
      property: new Types.ObjectId(id),
      isDeleted: { $ne: true },
    })
      .populate({
        path: "tenant",
        select:
          "name email phone profileImage dateOfBirth nidNumber nidPhoto emergencyPhone emergencyContact address homeAddress status role verified",
      })
      .populate({
        path: "flat",
        select:
          "unitName floor rentPerMonth unitType beds baths flatPhotos key appliances",
      })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const activeTenancyFlatIds = new Set(
    tenancies
      .filter((t) => t.status === TENANCY_STATUS.ACTIVE)
      .map(
        (t) =>
          (t.flat as any)?._id?.toString() || (t.flat as any)?.toString(),
      )
      .filter(Boolean),
  );

  const isOcc = (flat: any): boolean =>
    Boolean(
      flat.tenant ||
        (Array.isArray(flat.tenants) && flat.tenants.length > 0) ||
        activeTenancyFlatIds.has(flat._id.toString()),
    );

  const totalUnits = propFlats.length;
  let occupiedUnits = 0;
  let monthlyRent = 0;

  const enhancedFlats = propFlats.map((flat: any) => {
    monthlyRent += Number(flat.rentPerMonth) || 0;
    const isOccupied = isOcc(flat);
    if (isOccupied) {
      occupiedUnits++;
    }

    const { tenants, ...flatData } = flat;

    return {
      ...flatData,
      isOccupied,
      status: isOccupied ? "Occupied" : "Vacant",
      formattedRent: `${formatCurrency(Number(flat.rentPerMonth) || 0)}/mo`,
      formattedRentPerMonth: `${formatCurrency(Number(flat.rentPerMonth) || 0)}/mo`,
    };
  });

  const vacantUnits = Math.max(0, totalUnits - occupiedUnits);

  const stats = {
    totalUnits,
    occupied: occupiedUnits,
    vacant: vacantUnits,
    totalRent: monthlyRent,
    formattedTotalRent: `${formatCurrency(monthlyRent)}/mo`,
  };

  const propObj = (property as any).toObject
    ? (property as any).toObject()
    : property;

  const enhancedTenants: any[] = [];
  const handledTenantUserIds = new Set<string>();

  for (const t of tenancies) {
    const tenantUser = t.tenant as any;
    const flatDoc = t.flat as any;
    const effectiveRent = t.rentAmount || flatDoc?.rentPerMonth || 0;
    const tUserId = tenantUser?._id
      ? tenantUser._id.toString()
      : tenantUser?.toString();

    if (tUserId) {
      handledTenantUserIds.add(tUserId);
    }

    enhancedTenants.push({
      _id: tenantUser?._id || t._id,
      name: tenantUser?.name || t.email,
      email: tenantUser?.email || t.email,
      phone: tenantUser?.phone || "",
      emergencyContact: tenantUser?.emergencyContact || tenantUser?.emergencyPhone || "",
      profileImage: tenantUser?.profileImage || "",
      dateOfBirth: tenantUser?.dateOfBirth,
      nidNumber: tenantUser?.nidNumber,
      nidPhoto: tenantUser?.nidPhoto,
      address:
        tenantUser?.address ||
        (flatDoc?.unitName
          ? `${flatDoc.unitName}, ${propObj.streetAddress || ""}`
          : propObj.streetAddress || ""),
      status: t.status || TENANCY_STATUS.ACTIVE,
      rentAmount: effectiveRent,
      formattedRent: `${formatCurrency(effectiveRent)}/mo`,
      leaseStartDate: t.leaseStartDate,
      leaseEndDate: t.leaseEndDate,
      securityDeposit: t.securityDeposit || 0,
      advanceRent: t.advanceRent || 0,
      depositProtectionScheme: t.depositProtectionScheme,
      personalMessage: t.personalMessage || "",
      flat: flatDoc
        ? {
            _id: flatDoc._id,
            unitName: flatDoc.unitName,
            floor: flatDoc.floor,
            rentPerMonth: flatDoc.rentPerMonth,
          }
        : null,
      createdAt: (t as any).createdAt,
    });
  }

  for (const flat of propFlats) {
    if (flat.tenant) {
      const userObj = flat.tenant as any;
      const uId = userObj?._id ? userObj._id.toString() : userObj?.toString();
      if (!uId || handledTenantUserIds.has(uId)) continue;
      handledTenantUserIds.add(uId);

      const effectiveRent = flat.rentPerMonth || 0;
      enhancedTenants.push({
        _id: uId,
        name: userObj?.name || "",
        email: userObj?.email || "",
        phone: userObj?.phone || "",
        emergencyContact: userObj?.emergencyContact || userObj?.emergencyPhone || "",
        profileImage: userObj?.profileImage || "",
        dateOfBirth: userObj?.dateOfBirth,
        nidNumber: userObj?.nidNumber,
        nidPhoto: userObj?.nidPhoto,
        address:
          userObj?.address ||
          `${flat.unitName || ""}, ${propObj.streetAddress || ""}`,
        status: TENANCY_STATUS.ACTIVE,
        rentAmount: effectiveRent,
        formattedRent: `${formatCurrency(effectiveRent)}/mo`,
        flat: {
          _id: flat._id,
          unitName: flat.unitName,
          floor: flat.floor,
          rentPerMonth: flat.rentPerMonth,
        },
        createdAt: (flat as any).createdAt,
      });
    }
  }

  return {
    ...propObj,
    flats: enhancedFlats,
    tenants: enhancedTenants,
    stats,
  };
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

  const updatedProperty = await Property.findByIdAndUpdate(
    id,
    { $set: updatePayload },
    {
      new: true,
      runValidators: true,
    },
  )
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

// Update Council by Property ID
const updateCouncilToDB = async (
  userId: string,
  id: string,
  payload: Partial<TCouncil>,
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

  const updateFields: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      updateFields[`council.${key}`] = value;
    }
  }

  const updatedProperty = await Property.findByIdAndUpdate(
    id,
    { $set: updateFields },
    { new: true, runValidators: true },
  )
    .populate("propertyType")
    .populate({
      path: "landlord",
      select: "firstName lastName email role profileImage",
    });

  if (!updatedProperty) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to update council details",
    );
  }

  return updatedProperty;
};

// Update Parking by Property ID
const updateParkingToDB = async (
  userId: string,
  id: string,
  payload: Partial<TParking>,
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

  const updateFields: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      updateFields[`parking.${key}`] = value;
    }
  }

  const updatedProperty = await Property.findByIdAndUpdate(
    id,
    { $set: updateFields },
    { new: true, runValidators: true },
  )
    .populate("propertyType")
    .populate({
      path: "landlord",
      select: "firstName lastName email role profileImage",
    });

  if (!updatedProperty) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to update parking details",
    );
  }

  return updatedProperty;
};

// Update/Upload Compliance Document by Property ID
const updateComplianceToDB = async (
  userId: string,
  id: string,
  payload: {
    complianceType: string;
    certificateUrl: string | string[];
    oldCertificateUrl?: string;
  },
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }

  const property = await Property.findById(id);
  if (!property) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  const landlordId = property.landlord?.toString();
  if (landlordId !== userId.toString()) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to update this property",
    );
  }

  const categoryKey = complianceKeyMap[payload.complianceType];
  if (!categoryKey) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid compliance type");
  }

  if (!property.compliance) {
    property.compliance = {};
  }

  // Handle otherDocuments (Array of string URLs)
  if (categoryKey === "otherDocuments") {
    if (!Array.isArray(property.compliance.otherDocuments)) {
      property.compliance.otherDocuments = [];
    }

    const newUrls = Array.isArray(payload.certificateUrl)
      ? payload.certificateUrl
      : [payload.certificateUrl];

    // If updating a specific document by old URL
    if (payload.oldCertificateUrl) {
      const index = property.compliance.otherDocuments.indexOf(
        payload.oldCertificateUrl,
      );
      if (index !== -1) {
        property.compliance.otherDocuments[index] = newUrls[0];
      } else {
        property.compliance.otherDocuments.push(...newUrls);
      }
    } else {
      property.compliance.otherDocuments.push(...newUrls);
    }

    property.markModified("compliance");
    await property.save();

    return await Property.findById(id).populate("propertyType").populate({
      path: "landlord",
      select: "firstName lastName email role profileImage",
    });
  }

  // Handle single certificate compliance (gasSafety, electrical, etc.)
  const singleUrl = Array.isArray(payload.certificateUrl)
    ? payload.certificateUrl[0]
    : payload.certificateUrl;

  const currentItem = (property.compliance[categoryKey] as any) || {
    history: [],
  };
  const existingCurrent = currentItem.current;

  const history = Array.isArray(currentItem.history)
    ? [...currentItem.history]
    : [];

  if (existingCurrent && existingCurrent !== singleUrl) {
    if (!history.includes(existingCurrent)) {
      history.push(existingCurrent);
    }
  }

  (property.compliance as any)[categoryKey] = {
    current: singleUrl,
    history,
  };

  property.markModified("compliance");
  await property.save();

  return await Property.findById(id).populate("propertyType").populate({
    path: "landlord",
    select: "firstName lastName email role profileImage",
  });
};

// Delete Compliance Document by Property ID
const deleteComplianceFromDB = async (
  userId: string,
  id: string,
  payload: { complianceType: string; certificateUrl: string },
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid property ID");
  }

  const property = await Property.findById(id);
  if (!property) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Property not found");
  }

  const landlordId = property.landlord?.toString();
  if (landlordId !== userId.toString()) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to update this property",
    );
  }

  const categoryKey = complianceKeyMap[payload.complianceType];
  if (!categoryKey) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid compliance type");
  }

  if (!property.compliance) {
    throw new ApiError(StatusCodes.NOT_FOUND, "No compliance records found");
  }

  if (categoryKey === "otherDocuments") {
    if (
      !Array.isArray(property.compliance.otherDocuments) ||
      !property.compliance.otherDocuments.includes(payload.certificateUrl)
    ) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Document not found in other documents",
      );
    }
    property.compliance.otherDocuments =
      property.compliance.otherDocuments.filter(
        (url) => url !== payload.certificateUrl,
      );
  } else {
    const currentItem = property.compliance[categoryKey] as any;
    if (currentItem?.current === payload.certificateUrl) {
      currentItem.current = undefined;
    } else if (Array.isArray(currentItem?.history)) {
      currentItem.history = currentItem.history.filter(
        (url: string) => url !== payload.certificateUrl,
      );
    }
  }

  property.markModified("compliance");
  await property.save();

  return await Property.findById(id).populate("propertyType").populate({
    path: "landlord",
    select: "firstName lastName email role profileImage",
  });
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

// Update Floor Plans by Property ID
const updateFloorPlansToDB = async (
  userId: string,
  id: string,
  payload: { floorPlanPhotos: string[] },
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

  const updatedProperty = await Property.findByIdAndUpdate(
    id,
    { $set: { floorPlanPhotos: payload.floorPlanPhotos } },
    { new: true, runValidators: true },
  )
    .populate("propertyType")
    .populate({
      path: "landlord",
      select: "firstName lastName email role profileImage",
    });

  if (!updatedProperty) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to update floor plans");
  }

  return updatedProperty;
};

// Update House Rules by Property ID (Replaces existing house rules)
const updateHouseRulesToDB = async (
  userId: string,
  id: string,
  payload: { houseRules: string },
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

  const updatedProperty = await Property.findByIdAndUpdate(
    id,
    { $set: { houseRules: payload.houseRules } },
    { new: true, runValidators: true },
  )
    .populate("propertyType")
    .populate({
      path: "landlord",
      select: "firstName lastName email role profileImage",
    });

  if (!updatedProperty) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to update house rules");
  }

  return updatedProperty;
};

export const PropertyService = {
  createPropertyToDB,
  getAllPropertiesFromDB,
  getSinglePropertyFromDB,
  updatePropertyToDB,
  updateCouncilToDB,
  updateParkingToDB,
  updateComplianceToDB,
  deleteComplianceFromDB,
  updateFloorPlansToDB,
  updateHouseRulesToDB,
  deletePropertyFromDB,
};
