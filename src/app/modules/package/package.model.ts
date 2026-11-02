import { model, Schema, Query } from "mongoose";
import { IPackage, PackageModel } from "./package.interface";

const packageSchema = new Schema<IPackage, PackageModel>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    monthlyPrice: {
      type: Number,
      required: true,
    },
    yearlyPrice: {
      type: Number,
      required: true,
    },
    stripeProductId: {
      type: String,
    },
    stripeMonthlyPriceId: {
      type: String,
      required: true,
    },
    stripeYearlyPriceId: {
      type: String,
      required: true,
    },
    maxProperties: {
      type: Number,
      required: true,
      default: 1,
    },
    maxFlats: {
      type: Number,
      required: true,
      default: 5,
    },
    features: {
      type: [String],
      default: [],
    },
    hasTrial: {
      type: Boolean,
      default: false,
    },
    trialDays: {
      type: Number,
      default: 0,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

packageSchema.pre("find", function (this: Query<any, any>, next) {
  this.find({ isDeleted: { $ne: true } } as any);
  next();
});

packageSchema.pre("findOne", function (this: Query<any, any>, next) {
  this.find({ isDeleted: { $ne: true } } as any);
  next();
});

export const Package = model<IPackage, PackageModel>("Package", packageSchema);
