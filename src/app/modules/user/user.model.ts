import { model, Schema } from "mongoose";
import { GENDER, STATUS, USER_ROLES } from "../../../enums/user";
import { IUser, IUserModel } from "./user.interface";
import { PRIMARY_TRADE } from "./user.constant";
import bcrypt from "bcrypt";
import config from "../../../config";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";

const userSchema = new Schema<IUser, IUserModel>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.LANDLORD,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    profileImage: {
      type: String,
      required: false,
      default: "",
    },
    dateOfBirth: {
      type: Date,
      required: false,
    },
    gender: {
      type: String,
      enum: Object.values(GENDER),
      default: GENDER.MALE,
    },
    password: {
      type: String,
      required: false,
      select: 0,
      minlength: 8,
    },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.ACTIVE,
    },
    phone: {
      type: String,
      required: false,
    },
    countryCode: {
      type: String,
      required: false,
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
    },
    userName: {
      type: String,
      unique: true,
      sparse: true,
    },
    deviceToken: {
      type: String,
      required: false,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    address: {
      type: String,
      required: false,
    },
    homeAddress: {
      type: String,
      required: false,
    },
    emergencyPhone: {
      type: String,
      required: false,
    },
    emergencyContact: {
      type: String,
      required: false,
    },
    nidNumber: {
      type: Schema.Types.Mixed,
      required: false,
    },
    nidPhoto: {
      type: String,
      required: false,
      default: "",
    },
    companyName: {
      type: String,
      required: false,
    },
    primaryTrade: {
      type: String,
      enum: Object.values(PRIMARY_TRADE),
      required: false,
    },
    certificates: [
      {
        certificateName: { type: String },
        certificateAttachment: { type: String },
      },
    ],
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      default: null,
    },
    flat: {
      type: Schema.Types.ObjectId,
      ref: "Flat",
      default: null,
    },
    authentication: {
      type: {
        isResetPassword: {
          type: Boolean,
          default: false,
        },
        oneTimeCode: {
          type: Number,
          default: null,
        },
        expireAt: {
          type: Date,
          default: null,
        },
        authType: {
          type: String,
          default: null,
        },
      },
      select: 0,
    },
    timezone: {
      type: String,
      default: "Asia/Dhaka",
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        delete ret.id;
        delete ret.password;
        delete ret.authentication;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        delete ret.id;
        delete ret.password;
        delete ret.authentication;
        return ret;
      },
    },
  },
);

/* ================= PLUGIN ================= */
userSchema.plugin(softDeletePlugin);

// exist user check
userSchema.statics.isExistUserById = async (id: string) => {
  return await User.findById(id);
};

userSchema.statics.isExistUserByEmail = async (email: string) => {
  return await User.findOne({ email });
};

// is match password
userSchema.statics.isMatchPassword = async (
  password: string,
  hashPassword: string,
): Promise<boolean> => {
  return await bcrypt.compare(password, hashPassword);
};

// hash password pre-save
userSchema.pre("save", async function (next) {
  if (this.emergencyContact && !this.emergencyPhone) {
    this.emergencyPhone = this.emergencyContact;
  } else if (this.emergencyPhone && !this.emergencyContact) {
    this.emergencyContact = this.emergencyPhone;
  }

  if (this.isModified("password") && this.password) {
    this.password = await bcrypt.hash(
      this.password,
      Number(config.bcrypt_salt_rounds),
    );
  }
  next();
});

userSchema.index({ role: 1 });
userSchema.index({ role: 1, status: 1 });

export const User = model<IUser, IUserModel>("User", userSchema);
