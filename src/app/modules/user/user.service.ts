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

  const updateDoc = await User.findOneAndUpdate({ _id: id }, payload, {
    new: true,
  }).select("-password -authentication");

  return updateDoc;
};

const getUsersFromDB = async (query: Record<string, unknown>) => {
  const roleFilter = query.role
    ? { role: query.role }
    : {
        role: {
          $in: [USER_ROLES.LANDLORD, USER_ROLES.TENANT, USER_ROLES.CONTRACTOR],
        },
      };

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

  return {
    data: users,
    meta,
  };
};

const getUserByIdFromDB = async (id: string) => {
  const result = await User.findOne({
    _id: id,
    role: {
      $in: [USER_ROLES.LANDLORD, USER_ROLES.TENANT, USER_ROLES.CONTRACTOR],
    },
  }).select("-password -authentication -deviceToken");

  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "No user is found by this ID");
  }

  return result;
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
