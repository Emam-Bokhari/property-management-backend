import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { COUNCIL_TAX, EPC_RATING } from "./property.constant";
import {
  PropertyModel,
  TCompliance,
  TComplianceItem,
  TCouncil,
  TParking,
  TProperty,
} from "./property.interface";
import "../appOption/appOption.model";

const councilSchema = new Schema<TCouncil>(
  {
    authority: { type: String, trim: true },
    taxBand: { type: String, enum: Object.values(COUNCIL_TAX) },
    reference: { type: String, trim: true },
    contact: { type: Number },
    bins: { type: String },
    councilPhoto: { type: String },
  },
  { _id: false },
);

const parkingSchema = new Schema<TParking>(
  {
    parkingType: { type: String, trim: true },
    space: { type: String, trim: true },
    permit: { type: String, trim: true },
    allocatedCount: { type: Number, default: 0 },
    notes: { type: String },
    parkingPhoto: { type: String },
  },
  { _id: false },
);

const complianceItemSchema = new Schema<TComplianceItem>(
  {
    current: { type: String },
    history: [{ type: String }],
  },
  { _id: false },
);

const complianceSchema = new Schema<TCompliance>(
  {
    gasSafety: complianceItemSchema,
    electrical: complianceItemSchema,
    energyPerformance: complianceItemSchema,
    landlordInsurance: complianceItemSchema,
    depositProtection: complianceItemSchema,
    propertyLicense: complianceItemSchema,
    otherDocuments: {
      type: [String],
      default: [],
      set: (val: any) => {
        if (!val) return [];
        if (typeof val === "string") {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              return parsed.map((item) =>
                typeof item === "string"
                  ? item
                  : item?.current || item?.documentUrl || String(item),
              );
            }
            if (typeof parsed === "object" && parsed !== null) {
              return parsed.current ? [parsed.current] : [];
            }
          } catch {
            return [val];
          }
          return [val];
        }
        if (Array.isArray(val)) {
          return val.map((item) =>
            typeof item === "string"
              ? item
              : item?.current || item?.documentUrl || String(item),
          );
        }
        if (typeof val === "object" && val !== null) {
          return val.current ? [val.current] : [];
        }
        return [String(val)];
      },
    },
  },
  { _id: false },
);

const propertySchema = new Schema<TProperty, PropertyModel>(
  {
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    propertyName: {
      type: String,
      required: true,
      trim: true,
    },
    propertyPhotos: [
      {
        type: String,
      },
    ],
    floorPlanPhotos: [
      {
        type: String,
      },
    ],
    streetAddress: {
      type: String,
      required: true,
      trim: true,
    },
    postCode: {
      type: String,
      required: true,
      trim: true,
    },
    floorsInBuilding: {
      type: String,
      required: true,
    },
    propertyType: {
      type: Schema.Types.ObjectId,
      ref: "AppOption",
      required: true,
    },
    isHmo: {
      type: Boolean,
      default: false,
    },
    yearBuilt: {
      type: String,
      required: true,
    },
    datePurchased: {
      type: Date,
      required: true,
    },
    valuation: {
      type: Number,
      required: true,
    },
    valuationDate: {
      type: Date,
      required: true,
    },
    epcRating: {
      type: String,
      enum: Object.values(EPC_RATING),
      required: true,
    },
    epcExpireDate: {
      type: Date,
      required: true,
    },
    insuranceRenewal: {
      type: Date,
      required: true,
    },
    councilTax: {
      type: String,
      enum: Object.values(COUNCIL_TAX),
      required: true,
    },
    buildingNotes: {
      type: String,
    },
    council: councilSchema,
    parking: parkingSchema,
    houseRules: {
      type: String,
    },
    compliance: complianceSchema,
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

propertySchema.plugin(softDeletePlugin);

export const Property = model<TProperty, PropertyModel>(
  "Property",
  propertySchema,
);
