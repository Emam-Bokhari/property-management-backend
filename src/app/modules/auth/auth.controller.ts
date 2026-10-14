import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AuthService } from "./auth.service";
import { JwtPayload } from "jsonwebtoken";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";

const signUp = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.signUpUserToDB(req.body);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.CREATED,
    message: result.message,
    data: result,
  });
});

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const { ...verifyData } = req.body;
  const result = await AuthService.verifyEmailToDB(verifyData);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: result.message,
    data: result.data,
  });
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const { ...loginData } = req.body;
  const result = await AuthService.loginUserFromDB(loginData);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "User login successfully",
    data: result,
  });
});

const forgetPassword = catchAsync(async (req: Request, res: Response) => {
  const email = req.body.email;
  const result = await AuthService.forgetPasswordToDB(email);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: result.message || "Please check your email, we send an OTP!",
    data: result,
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const token: any = req.headers.resettoken;
  const { ...resetData } = req.body;
  const result = await AuthService.resetPasswordToDB(token!, resetData);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: result.message || "Your password has been successfully reset.",
    data: result,
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { ...passwordData } = req.body;
  await AuthService.changePasswordToDB(user as JwtPayload, passwordData);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Password changed successfully",
  });
});

const newAccessToken = catchAsync(async (req: Request, res: Response) => {
  const { token } = req.body;
  const result = await AuthService.newAccessTokenToUser(token);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Generate Access Token successfully",
    data: result,
  });
});

const resendVerificationEmail = catchAsync(
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const result = await AuthService.resendVerificationEmailToDB(email);

    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: result.message || "OTP sent successfully",
      data: result,
    });
  },
);

// delete user
const deleteUser = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.deleteUserFromDB(
    req.user as JwtPayload,
    req.body.password,
  );

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Account deleted successfully",
    data: result,
  });
});

// google login
const googleLogin = catchAsync(async (req: Request, res: Response) => {
  const { token, deviceToken } = req.body;

  const data = {
    token,
    deviceToken,
  };
  const result = await AuthService.googleLoginService(data);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "User login successfully",
    data: result,
  });
});

export const AuthController = {
  signUp,
  verifyEmail,
  loginUser,
  forgetPassword,
  resetPassword,
  changePassword,
  newAccessToken,
  resendVerificationEmail,
  deleteUser,
  googleLogin,
};
