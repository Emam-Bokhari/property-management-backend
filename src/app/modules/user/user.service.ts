import { STATUS, USER_ROLES } from "../../../enums/user";
import { IUser } from "./user.interface";
import { JwtPayload, Secret } from "jsonwebtoken";
import { User } from "./user.model";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import unlinkFile from "../../../shared/unlinkFile";
import { jwtHelper } from "../../../helpers/jwtHelper";
import config from "../../../config";
import QueryBuilder from "../../builder/queryBuilder";
import generateOTP from "../../../util/generateOTP";
import { emailTemplate } from "../../../shared/emailTemplate";
import { emailHelper } from "../../../helpers/emailHelper";
import bcrypt from "bcrypt";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import { USER_SEARCHABLE_FIELDS } from "./user.constant";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { Subscription } from "../subscription/subscription.model";
import { IPackage } from "../package/package.interface";
import { AdminService } from "../admin/admin.service";
import { formatMonthlyPrice } from "../../../helpers/currencyHelper";

// --- ADMIN SERVICES ---
const createAdminToDB = async (payload: Partial<IUser>): Promise<IUser> => {
  const normalizedEmail = payload.email?.trim().toLowerCase();
  const isExistAdmin = await User.findOne({ email: normalizedEmail });
  if (isExistAdmin) {
    throw new ApiError(StatusCodes.CONFLICT, "This email is already taken");
  }

  const adminPayload = {
    ...payload,
    email: normalizedEmail,
    verified: true,
    status: STATUS.ACTIVE,
    role: payload.role || USER_ROLES.ADMIN,
  };

  const createAdmin = await User.create(adminPayload);
  return createAdmin;
};

const getAdminFromDB = async (query: any) => {
  const baseQuery = User.find({
    role: { $in: [USER_ROLES.ADMIN] },
  }).select(
    "name email role profileImage phone countryCode status createdAt updatedAt",
  );

  const queryBuilder = new QueryBuilder<IUser>(baseQuery, query)
    .search(["name", "email", "phone"])
    .filter()
    .sort()
    .fields()
    .paginate();

  const [admins, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  return {
    data: admins,
    meta,
  };
};

const getSuperAdminFromDB = async () => {
  const result = await User.findOne({
    role: USER_ROLES.SUPER_ADMIN,
  }).select("-password -authentication -deviceToken");

  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Super admin not found");
  }

  return result;
};

const updateAdminStatusByIdToDB = async (
  id: string,
  status: STATUS.ACTIVE | STATUS.INACTIVE,
) => {
  if (![STATUS.ACTIVE, STATUS.INACTIVE].includes(status)) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Status must be either 'active' or 'inactive'",
    );
  }

  const user = await User.findOne({
    _id: id,
    role: USER_ROLES.ADMIN,
  });
  if (!user) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No admin is found by this user ID",
    );
  }

  const result = await User.findByIdAndUpdate(id, { status }, { new: true });
  if (!result) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to change status by this user ID",
    );
  }

  return result;
};

const deleteAdminFromDB = async (id: any) => {
  const isExistAdmin = await User.softDeleteById(id);

  if (!isExistAdmin) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to delete Admin");
  }

  return isExistAdmin;
};

// --- USER SERVICES ---
const createUserToDB = async (payload: Partial<IUser>) => {
  if (!payload.email) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Email is required");
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  const isExistUser = await User.findOne({ email: normalizedEmail });

  if (isExistUser) {
    if (isExistUser.verified) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        "This email is already registered",
      );
    }
    // Delete unverified user to allow clean re-registration
    await User.deleteOne({ _id: isExistUser._id });
  }

  const validRoles = [
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.CONTRACTOR,
  ];

  const role =
    payload.role && validRoles.includes(payload.role)
      ? payload.role
      : USER_ROLES.LANDLORD;

  if (payload.emergencyContact && !payload.emergencyPhone) {
    payload.emergencyPhone = payload.emergencyContact;
  } else if (payload.emergencyPhone && !payload.emergencyContact) {
    payload.emergencyContact = payload.emergencyPhone;
  }

  // Generate OTP
  const otp = generateOTP();
  const authentication = {
    oneTimeCode: Number(otp),
    expireAt: new Date(Date.now() + 3 * 60000), // 3 minutes validity
    isResetPassword: false,
  };

  const userData: Partial<IUser> = {
    ...payload,
    email: normalizedEmail,
    role,
    verified: false,
    status: STATUS.ACTIVE,
    authentication,
  };

  const createUser = await User.create(userData);

  if (!createUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to create user");
  }

  // Send email with OTP
  const emailValues = {
    name: createUser.name,
    otp: Number(otp),
    email: createUser.email,
  };

  const createAccountEmail = emailTemplate.createAccount(emailValues);
  emailHelper.sendEmail(createAccountEmail);

  // Create JWT token
  const token = jwtHelper.createToken(
    {
      id: createUser._id,
      email: createUser.email,
      role: createUser.role,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.jwt_expire_in as string,
  );

  const result = {
    token,
    user: createUser,
  };

  // Notify super admin
  const admin = await User.findOne({ role: USER_ROLES.SUPER_ADMIN }).select(
    "_id name",
  );

  if (admin) {
    await sendNotifications({
      title: "New User Signup",
      text: `${createUser.name} has signed up as a ${createUser.role}.`,
      receiver: admin._id.toString(),
      type: NOTIFICATION_TYPE.ADMIN,
      referenceId: createUser._id.toString(),
      referenceModel: "User",
    });
  }

  return result;
};

const getMyProfileFromDB = async (userId: string) => {
  const result = await User.findById(userId).select(
    "-password -authentication",
  );

  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User not found");
  }

  return result;
};

const updateProfileToDB = async (
  user: JwtPayload,
  payload: Partial<IUser>,
): Promise<Partial<IUser | null>> => {
  const { id } = user;
  const isExistUser = await User.isExistUserById(id);
  if (!isExistUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  // Unlink file if changed
  if (payload.profileImage && isExistUser.profileImage) {
    unlinkFile(isExistUser.profileImage);
  }
  if (payload.nidPhoto && isExistUser.nidPhoto) {
    unlinkFile(isExistUser.nidPhoto);
  }

  if (payload.emergencyContact && !payload.emergencyPhone) {
    payload.emergencyPhone = payload.emergencyContact;
  } else if (payload.emergencyPhone && !payload.emergencyContact) {
    payload.emergencyContact = payload.emergencyPhone;
  }


  const updateDoc = await User.findOneAndUpdate({ _id: id }, payload, {
    new: true,
  }).select("-password -authentication");

  return updateDoc;
};

const getUsersFromDB = async (query: Record<string, unknown>) => {
  // If role is explicitly provided, filter by that; otherwise ONLY return Landlords (Admin Dashboard requirement)
  const roleFilter = query.role
    ? { role: query.role }
    : { role: USER_ROLES.LANDLORD };

  const baseQuery = User.find(roleFilter).select(
    "-password -authentication -deviceToken",
  );

  const queryBuilder = new QueryBuilder<IUser>(baseQuery, query)
    .search(USER_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .fields()
    .paginate();

  const [users, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  // Enrich landlords with portfolio, plan, and statusBadge
  if (!query.role || query.role === USER_ROLES.LANDLORD) {
    const landlordIds = users.map((u) => u._id);

    const [propertiesCounts, flatsCounts, subscriptions] = await Promise.all([
      Property.aggregate([
        {
          $match: { landlord: { $in: landlordIds }, isDeleted: { $ne: true } },
        },
        { $group: { _id: "$landlord", count: { $sum: 1 } } },
      ]),
      Flat.aggregate([
        {
          $match: { landlord: { $in: landlordIds }, isDeleted: { $ne: true } },
        },
        { $group: { _id: "$landlord", count: { $sum: 1 } } },
      ]),
      Subscription.find({
        userId: { $in: landlordIds },
        isDeleted: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .populate<{ packageId: IPackage }>("packageId")
        .lean(),
    ]);

    const propCountMap: Record<string, number> = {};
    for (const item of propertiesCounts) {
      propCountMap[item._id.toString()] = item.count;
    }

    const flatCountMap: Record<string, number> = {};
    for (const item of flatsCounts) {
      flatCountMap[item._id.toString()] = item.count;
    }

    const subMap: Record<string, any> = {};
    for (const sub of subscriptions) {
      const uId = sub.userId.toString();
      if (!subMap[uId]) {
        subMap[uId] = sub;
      }
    }

    const enrichedUsers = users.map((user: any) => {
      const uId = user._id.toString();
      const propCount = propCountMap[uId] || 0;
      const unitCount = flatCountMap[uId] || 0;
      const sub = subMap[uId];
      const pkg = sub ? (sub.packageId as unknown as IPackage) : null;
      const maxUnits =
        pkg && typeof pkg.maxFlats === "number" && pkg.maxFlats > 0
          ? pkg.maxFlats
          : null;
      const isNearLimit =
        maxUnits !== null && maxUnits > 0 && unitCount >= maxUnits;

      const isTrial = Boolean(sub?.isTrial || sub?.status === "trialing");
      const isPastDue = Boolean(
        sub?.status === "past_due" || sub?.status === "unpaid",
      );
      const isSuspended = user.status === STATUS.INACTIVE;

      let displayStatus: "active" | "trial" | "past_due" | "suspended" =
        "active";
      let statusBadge: {
        label: string;
        variant: "success" | "warning" | "danger" | "neutral";
      } = {
        label: "Active",
        variant: "success",
      };

      if (isSuspended) {
        displayStatus = "suspended";
        statusBadge = { label: "Suspended", variant: "danger" };
      } else if (isTrial) {
        displayStatus = "trial";
        statusBadge = { label: "Trial", variant: "warning" };
      } else if (isPastDue) {
        displayStatus = "past_due";
        statusBadge = { label: "Past Due", variant: "danger" };
      }

      const planData = pkg
        ? {
            packageName: pkg.name,
            price: pkg.monthlyPrice || 0,
            formattedPrice: formatMonthlyPrice(pkg.monthlyPrice),
            billingCadence:
              sub?.planType === "yearly"
                ? "yearly"
                : (pkg.monthlyPrice || 0) > 0
                  ? "monthly"
                  : "free",
            isTrial,
            status: sub?.status || "active",
          }
        : null;

      return {
        ...user,
        portfolio: {
          propertiesCount: propCount,
          unitsCount: unitCount,
          maxUnits,
          formattedPortfolio: `${propCount} ${propCount === 1 ? "Property" : "Properties"}`,
          formattedUnits:
            maxUnits !== null
              ? `${unitCount} / ${maxUnits} units`
              : `${unitCount} ${unitCount === 1 ? "unit" : "units"}`,
          isNearLimit,
        },
        plan: planData,
        displayStatus,
        statusBadge,
      };
    });

    return {
      data: enrichedUsers,
      meta,
    };
  }

  return {
    data: users,
    meta,
  };
};

const getUserByIdFromDB = async (id: string) => {
  const user = await User.findById(id).select(
    "-password -authentication -deviceToken",
  );

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, "No user is found by this ID");
  }

  // If landlord, return full rich landlord detail with stats and plan
  if (user.role === USER_ROLES.LANDLORD) {
    return await AdminService.getLandlordByIdFromDB(id);
  }

  return user;
};

const updateUserStatusByIdToDB = async (
  id: string,
  status: STATUS.ACTIVE | STATUS.INACTIVE,
) => {
  if (![STATUS.ACTIVE, STATUS.INACTIVE].includes(status)) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Status must be either 'active' or 'inactive'",
    );
  }

  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, "No user is found by this ID");
  }

  // If landlord, cascade suspend/reactivate tenants and contractors!
  if (user.role === USER_ROLES.LANDLORD) {
    return await AdminService.updateLandlordStatusToDB(id, status);
  }

  const result = await User.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  ).select("-password -authentication");

  if (!result) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to update status");
  }

  return result;
};

const deleteUserByIdFromD = async (id: string) => {
  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User does not exist");
  }

  // If landlord, cascade soft-delete properties, flats, tenants, contractors!
  if (user.role === USER_ROLES.LANDLORD) {
    return await AdminService.deleteLandlordFromDB(id);
  }

  const result = await User.softDeleteById(id);
  if (!result) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to delete user");
  }

  return result;
};

const deleteProfileFromDB = async (id: string, password?: string) => {
  const user = await User.findById(id).select("+password");
  if (!user) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  // If password is set on user account, check password match
  if (user.password && password) {
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "Password is incorrect!");
    }
  }

  const result = await User.softDeleteById(id);
  if (!result) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to delete profile");
  }

  return result;
};

export const UserService = {
  createUserToDB,
  getUsersFromDB,
  getAdminFromDB,
  getSuperAdminFromDB,
  deleteAdminFromDB,
  getUserByIdFromDB,
  getMyProfileFromDB,
  updateProfileToDB,
  createAdminToDB,
  updateUserStatusByIdToDB,
  updateAdminStatusByIdToDB,
  deleteUserByIdFromD,
  deleteProfileFromDB,
};