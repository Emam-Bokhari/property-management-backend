import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { CONTRACTOR_RELATION_STATUS } from "./contractor.constant";
import { ContractorModel, IContractor } from "./contractor.interface";

const contractorSchema = new Schema<IContractor, ContractorModel>(
  {
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    contractor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    companyName: {
      type: String,
      trim: true,
      default: "",
    },
    trades: [
      {
        type: Schema.Types.ObjectId,
        ref: "AppOption",
      },
    ],
    personalMessage: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: Object.values(CONTRACTOR_RELATION_STATUS),
      default: CONTRACTOR_RELATION_STATUS.ACTIVE,
      index: true,
    },
    invitedAt: {
      type: Date,
      default: Date.now,
    },
    rating: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

contractorSchema.index({ landlord: 1, contractor: 1 });
contractorSchema.index({ landlord: 1, email: 1 });
contractorSchema.index({ trades: 1 });

contractorSchema.plugin(softDeletePlugin);

export const Contractor = model<IContractor, ContractorModel>(
  "Contractor",
  contractorSchema,
);
