import { Schema, model } from "mongoose";
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
      default: "",
    },
    monthlyPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    yearlyPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    stripeProductId: {
      type: String,
      trim: true,
    },
    stripeMonthlyPriceId: {
      type: String,
      trim: true,
    },
    stripeYearlyPriceId: {
      type: String,
      trim: true,
    },
    maxProperties: {
      type: Number,
      required: true,
      default: 1, // -1 means unlimited
    },
    maxFlats: {
      type: Number,
      required: true,
      default: 5, // -1 means unlimited
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
      min: 0,
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

packageSchema.pre("find", function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

packageSchema.pre("findOne", function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

export const Package = model<IPackage, PackageModel>("Package", packageSchema);
