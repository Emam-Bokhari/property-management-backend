import bcrypt from "bcrypt";
import { StatusCodes } from "http-status-codes";
import { JwtPayload, Secret } from "jsonwebtoken";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { jwtHelper } from "../../../helpers/jwtHelper";
import {
  IAuthResetPassword,
  IChangePassword,
  ILoginData,
  ISignUpData,
  IVerifyEmail,
} from "../../../types/auth";
import { User } from "../user/user.model";
import cryptoToken from "../../../util/cryptoToken";
import { ResetToken } from "../resetToken/resetToken.model";
import { emailHelper } from "../../../helpers/emailHelper";
import generateOTP from "../../../util/generateOTP";
import { emailTemplate } from "../../../shared/emailTemplate";
import { STATUS, USER_ROLES } from "../../../enums/user";
import { firebaseAdmin } from "../../../config/firebase";
import { FcmTokenService } from "../fcmToken/fcmService";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";

// ========================== Sign Up via Email (Landlord) ===========================
const signUpUserToDB = async (payload: ISignUpData) => {
  const { email, password, name, fcmToken, deviceId, deviceType } = payload;

  if (!email) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Email is required!");
  }
  if (!password) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Password is required!");
  }
  if (!name) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Name is required!");
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if user already exists
  const isExistUser = await User.findOne({ email: normalizedEmail });
  if (isExistUser) {
    if (isExistUser.verified) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        "This email is already registered!",
      );
    }
    // If not verified, remove stale unverified user to register afresh
    await User.deleteOne({ _id: isExistUser._id });
  }

  // Generate 6-digit OTP
  const otp = generateOTP();
  const authentication = {
    oneTimeCode: Number(otp),
    expireAt: new Date(Date.now() + 3 * 60000), // 3 minutes validity
    isResetPassword: false,
  };

  const newUser = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password,
    role: USER_ROLES.LANDLORD,
    verified: false,
    status: STATUS.ACTIVE,
    authentication,
  });

  if (!newUser) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to create user account!",
    );
  }

  // Save device token if provided
  if (fcmToken && deviceId && deviceType) {
    await FcmTokenService.saveDeviceToken(newUser._id, {
      fcmToken,
      deviceId,
      deviceType,
    });
  }

  // Send verification email
  const emailValues = {
    name: newUser.name,
    otp: Number(otp),
    email: newUser.email,
  };
  const accountEmailTemplate = emailTemplate.createAccount(emailValues);
  emailHelper.sendEmail(accountEmailTemplate);

  // Generate token
  const token = jwtHelper.createToken(
    {
      id: newUser._id,
      email: newUser.email,
      role: newUser.role,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.jwt_expire_in as string,
  );

  // Notify admin
  const admin = await User.findOne({ role: USER_ROLES.SUPER_ADMIN }).select(
    "_id",
  );
  if (admin) {
    await sendNotifications({
      title: "New User Signup",
      text: `${newUser.name} has registered as a ${newUser.role}.`,
      receiver: admin._id.toString(),
      type: NOTIFICATION_TYPE.ADMIN,
      referenceId: newUser._id.toString(),
      referenceModel: "User",
    });
  }

  // Convert user to object and strip sensitive fields
  const userResult = newUser.toObject();
  delete (userResult as any).password;
  delete (userResult as any).authentication;

  return {
    message:
      "Your account has been successfully created. Please verify your email with the OTP sent to your inbox.",
    token,
    user: userResult,
  };
};

// ========================== Login ===========================
const loginUserFromDB = async (payload: ILoginData) => {
  const { email, password, fcmToken, deviceId, deviceType } = payload;
  const cleanInput = email ? email.trim() : "";
  const normalizedEmail = cleanInput.toLowerCase();

  const isExistUser = await User.findOne({
    $or: [
      { email: normalizedEmail },
      { userName: cleanInput },
      { userName: normalizedEmail },
    ],
  }).select("+password");

  if (!isExistUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  // check verification status
  if (!isExistUser.verified) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Please verify your account before logging in.",
    );
  }

  // check active status
  if (isExistUser.status === STATUS.INACTIVE) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Your account has been deactivated. Please contact support.",
    );
  }

  // check password
  if (
    password &&
    !(await User.isMatchPassword(password, isExistUser.password!))
  ) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Password is incorrect!");
  }

  // Save device token if provided
  if (fcmToken && deviceId && deviceType) {
    await FcmTokenService.saveDeviceToken(isExistUser._id, {
      fcmToken,
      deviceId,
      deviceType,
    });
  }

  // create access token
  const createToken = jwtHelper.createToken(
    {
      id: isExistUser._id,
      role: isExistUser.role,
      email: isExistUser.email,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.jwt_expire_in as string,
  );

  // create refresh token
  const refreshToken = jwtHelper.createToken(
    {
      id: isExistUser._id,
      role: isExistUser.role,
      email: isExistUser.email,
    },
    config.jwt.jwtRefreshSecret as Secret,
    config.jwt.jwtRefreshExpiresIn || "30d",
  );

  return {
    token: createToken,
    refreshToken,
    data: isExistUser,
  };
};

// ========================== Forget Password ===========================
const forgetPasswordToDB = async (email: string) => {
  const normalizedEmail = email?.trim().toLowerCase();
  const isExistUser = await User.findOne({
    $or: [{ email: normalizedEmail }, { userName: email?.trim() }],
  });
  if (!isExistUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  const otp = generateOTP();
  const value = {
    otp: Number(otp),
    email: isExistUser.email,
  };

  const forgetPassword = emailTemplate.resetPassword(value);
  emailHelper.sendEmail(forgetPassword);

  const authentication = {
    oneTimeCode: Number(otp),
    expireAt: new Date(Date.now() + 3 * 60000),
    isResetPassword: false,
  };

  await User.findOneAndUpdate(
    { _id: isExistUser._id },
    { $set: { authentication } },
  );

  return { message: "A password reset OTP has been sent to your email." };
};

// ========================== Verify Email / OTP ===========================
const verifyEmailToDB = async (payload: IVerifyEmail) => {
  const { email, oneTimeCode } = payload;
  const normalizedEmail = email?.trim().toLowerCase();
  const isExistUser = await User.findOne({
    $or: [{ email: normalizedEmail }, { userName: email?.trim() }],
  }).select("+authentication");

  if (!isExistUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  if (!oneTimeCode) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Please provide the OTP code sent to your email.",
    );
  }

  if (isExistUser.authentication?.oneTimeCode !== oneTimeCode) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid OTP code!");
  }

  const date = new Date();
  if (
    isExistUser.authentication?.expireAt &&
    date > isExistUser.authentication.expireAt
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "OTP code has expired. Please request a new one.",
    );
  }

  let message;
  let data;

  if (!isExistUser.verified) {
    // Signup verification flow
    const updatedUser = await User.findOneAndUpdate(
      { _id: isExistUser._id },
      {
        verified: true,
        authentication: {
          oneTimeCode: null,
          expireAt: null,
          isResetPassword: false,
        },
      },
      { new: true },
    );

    const token = jwtHelper.createToken(
      {
        id: isExistUser._id,
        role: isExistUser.role,
        email: isExistUser.email,
      },
      config.jwt.jwt_secret as Secret,
      config.jwt.jwt_expire_in as string,
    );

    const refreshToken = jwtHelper.createToken(
      {
        id: isExistUser._id,
        role: isExistUser.role,
        email: isExistUser.email,
      },
      config.jwt.jwtRefreshSecret as Secret,
      config.jwt.jwtRefreshExpiresIn || "30d",
    );

    message = "Email verified successfully.";
    data = {
      token,
      refreshToken,
      user: updatedUser,
    };
  } else {
    // Forgot password flow
    await User.findOneAndUpdate(
      { _id: isExistUser._id },
      {
        authentication: {
          isResetPassword: true,
          oneTimeCode: null,
          expireAt: null,
        },
      },
    );

    const createToken = cryptoToken();
    await ResetToken.create({
      user: isExistUser._id,
      token: createToken,
      expireAt: new Date(Date.now() + 5 * 60000),
    });

    message =
      "Verification successful. Please securely use this token to reset your password.";
    data = createToken;
  }

  return { data, message };
};

// ========================== Reset Password ===========================
const resetPasswordToDB = async (
  token: string,
  payload: IAuthResetPassword,
) => {
  const { newPassword, confirmPassword } = payload;

  if (!token) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Reset token is required!");
  }

  const isExistToken = await ResetToken.isExistToken(token);
  if (!isExistToken) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "You are not authorized!");
  }

  const isExistUser = await User.findById(isExistToken.user).select(
    "+authentication",
  );
  if (!isExistUser?.authentication?.isResetPassword) {
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      "You don't have permission to change the password. Please initiate 'Forgot Password' again.",
    );
  }

  const isValid = await ResetToken.isExpireToken(token);
  if (!isValid) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Reset token expired. Please initiate 'Forgot Password' again.",
    );
  }

  if (newPassword !== confirmPassword) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "New password and confirm password do not match!",
    );
  }

  const hashPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  await User.findOneAndUpdate(
    { _id: isExistToken.user },
    {
      password: hashPassword,
      authentication: {
        isResetPassword: false,
        oneTimeCode: null,
        expireAt: null,
      },
    },
    { new: true },
  );

  // Clean up used token
  await ResetToken.deleteOne({ token });

  return { message: "Password reset successfully." };
};

// ========================== Change Password ===========================
const changePasswordToDB = async (
  user: JwtPayload,
  payload: IChangePassword,
) => {
  const { currentPassword, newPassword, confirmPassword } = payload;
  const isExistUser = await User.findById(user.id).select("+password");
  if (!isExistUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  if (
    currentPassword &&
    !(await User.isMatchPassword(currentPassword, isExistUser.password!))
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Current password is incorrect!",
    );
  }

  if (currentPassword === newPassword) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "New password must be different from current password!",
    );
  }

  if (newPassword !== confirmPassword) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "New password and confirm password do not match!",
    );
  }

  const hashPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  await User.findOneAndUpdate(
    { _id: user.id },
    { password: hashPassword },
    { new: true },
  );
};

// ========================== Refresh Access Token ===========================
const newAccessTokenToUser = async (token: string) => {
  if (!token) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Refresh token is required!");
  }

  const verifyUser = jwtHelper.verifyToken(
    token,
    config.jwt.jwtRefreshSecret as Secret,
  );

  const isExistUser = await User.findById(verifyUser?.id);
  if (!isExistUser) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized access!");
  }

  const accessToken = jwtHelper.createToken(
    {
      id: isExistUser._id,
      role: isExistUser.role,
      email: isExistUser.email,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.jwt_expire_in as string,
  );

  return { accessToken };
};

// ========================== Resend Verification OTP ===========================
const resendVerificationEmailToDB = async (email: string) => {
  const normalizedEmail = email?.trim().toLowerCase();
  const existingUser = await User.findOne({
    $or: [{ email: normalizedEmail }, { userName: email?.trim() }],
  });

  if (!existingUser) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "User with this email does not exist!",
    );
  }

  if (existingUser.verified) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "User account is already verified!",
    );
  }

  const otp = generateOTP();
  const emailValues = {
    name: existingUser.name,
    otp: Number(otp),
    email: existingUser.email,
  };

  const accountEmailTemplate = emailTemplate.createAccount(emailValues);
  emailHelper.sendEmail(accountEmailTemplate);

  const authentication = {
    oneTimeCode: Number(otp),
    expireAt: new Date(Date.now() + 3 * 60000),
    isResetPassword: false,
  };

  await User.findOneAndUpdate(
    { _id: existingUser._id },
    { $set: { authentication } },
    { new: true },
  );

  return {
    message: "A new OTP verification code has been sent to your email.",
  };
};

// ========================== Delete User Account ===========================
const deleteUserFromDB = async (user: JwtPayload, password?: string) => {
  const isExistUser = await User.findById(user.id).select("+password");
  if (!isExistUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  if (
    isExistUser.password &&
    password &&
    !(await User.isMatchPassword(password, isExistUser.password))
  ) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Password is incorrect!");
  }

  await User.softDeleteById(user.id);
  return;
};

// ========================== Google Social Login ===========================
const googleLoginService = async (payload: {
  token: string;
  fcmToken?: string;
  deviceId?: string;
  deviceType?: "ios" | "android" | "web";
  role?: USER_ROLES;
}) => {
  const { token, fcmToken, deviceId, deviceType, role } = payload;

  if (!token) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Firebase ID token is required!",
    );
  }

  let decoded;
  try {
    decoded = await firebaseAdmin.auth().verifyIdToken(token);
  } catch (error) {
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      "Invalid or expired Firebase token!",
    );
  }

  const { uid: firebaseUid, email, name, picture, email_verified } = decoded;

  if (!email) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Email not found in Google account!",
    );
  }

  let user = await User.findOne({
    $or: [{ firebaseUid }, { email: email.toLowerCase() }],
  });

  const validRoles = [
    USER_ROLES.LANDLORD,
    USER_ROLES.TENANT,
    USER_ROLES.CONTRACTOR,
  ];
  const assignedRole =
    role && validRoles.includes(role) ? role : USER_ROLES.LANDLORD;

  if (user) {
    if (user.status === STATUS.INACTIVE) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "Your account has been blocked. Please contact support.",
      );
    }

    if (!user.firebaseUid) {
      user.firebaseUid = firebaseUid;
    }
    user.verified = true;
    if (picture && !user.profileImage) {
      user.profileImage = picture;
    }
    await user.save();
  } else {
    const baseUsername = email.split("@")[0];
    let userName = baseUsername;
    let counter = 1;

    while (await User.findOne({ userName })) {
      userName = `${baseUsername}${counter}`;
      counter++;
    }

    user = await User.create({
      firebaseUid,
      email: email.toLowerCase(),
      userName,
      name: name || baseUsername,
      profileImage: picture || "",
      verified: true,
      status: STATUS.ACTIVE,
      role: assignedRole,
    });
  }

  // Save device token if provided
  if (fcmToken && deviceId && deviceType) {
    await FcmTokenService.saveDeviceToken(user._id, {
      fcmToken,
      deviceId,
      deviceType,
    });
  }

  const createToken = jwtHelper.createToken(
    {
      id: user._id,
      role: user.role,
      email: user.email,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.jwt_expire_in as string,
  );

  const refreshToken = jwtHelper.createToken(
    {
      id: user._id,
      role: user.role,
      email: user.email,
    },
    config.jwt.jwtRefreshSecret as Secret,
    config.jwt.jwtRefreshExpiresIn || "30d",
  );

  return {
    token: createToken,
    refreshToken,
    user,
  };
};

export const AuthService = {
  signUpUserToDB,
  loginUserFromDB,
  forgetPasswordToDB,
  resetPasswordToDB,
  verifyEmailToDB,
  changePasswordToDB,
  newAccessTokenToUser,
  resendVerificationEmailToDB,
  deleteUserFromDB,
  googleLoginService,
};
