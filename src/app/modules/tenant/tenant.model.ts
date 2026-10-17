import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { DEPOSIT_PROTECTION_SCHEME, TENANCY_STATUS } from "./tenant.constant";
import { ITenancy, TenancyModel } from "./tenant.interface";

const tenancySchema = new Schema<ITenancy, TenancyModel>(
  {
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    flat: {
      type: Schema.Types.ObjectId,
      ref: "Flat",
      required: true,
      index: true,
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    rentAmount: {
      type: Number,
      required: true,
    },
    leaseStartDate: {
      type: Date,
      required: true,
    },
    leaseEndDate: {
      type: Date,
      required: true,
    },
    securityDeposit: {
      type: Number,
      default: 0,
    },
    advanceRent: {
      type: Number,
      default: 0,
    },
    depositProtectionScheme: {
      type: String,
      trim: true,
      enum: Object.values(DEPOSIT_PROTECTION_SCHEME),
      default: DEPOSIT_PROTECTION_SCHEME.MY_DEPOSITS,
    },
    personalMessage: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: Object.values(TENANCY_STATUS),
      default: TENANCY_STATUS.ACTIVE,
      index: true,
    },
    invitedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

tenancySchema.plugin(softDeletePlugin);

export const Tenancy = model<ITenancy, TenancyModel>("Tenancy", tenancySchema);
