import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { FURNISHED_TYPE } from "./flat.constant";
import {
  FlatModel,
  TAppliance,
  TElectricity,
  TFlat,
  TGas,
  TKey,
  TSafetyAlarm,
  TWater,
  TWifi,
} from "./flat.interface";

const gasSchema = new Schema<TGas>(
  {
    supplier: { type: String, trim: true },
    mprn: { type: Schema.Types.Mixed },
    location: { type: String, trim: true },
    shutOff: { type: String, trim: true },
    helpline: { type: Schema.Types.Mixed },
    notes: { type: String },
    meterPhoto: { type: String },
  },
  { _id: false },
);

const electricitySchema = new Schema<TElectricity>(
  {
    supplier: { type: String, trim: true },
    mprn: { type: Schema.Types.Mixed },
    location: { type: String, trim: true },
    consumerUnit: { type: String, trim: true },
    helpline: { type: Schema.Types.Mixed },
    notes: { type: String },
    meterPhoto: { type: String },
  },
  { _id: false },
);

const waterSchema = new Schema<TWater>(
  {
    supplier: { type: String, trim: true },
    meterNumber: { type: Schema.Types.Mixed },
    stopcock: { type: String, trim: true },
    streetValve: { type: String, trim: true },
    helpline: { type: Schema.Types.Mixed },
    notes: { type: String },
    meterPhoto: { type: String },
  },
  { _id: false },
);

const wifiSchema = new Schema<TWifi>(
  {
    provider: { type: String, trim: true },
    network: { type: String, trim: true },
    password: { type: String },
    router: { type: String, trim: true },
    supportNumber: { type: Schema.Types.Mixed },
    notes: { type: String },
    routerPhoto: { type: String },
  },
  { _id: false },
);

const keySchema = new Schema<TKey>(
  {
    keyType: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 1 },
    location: { type: String, required: true, trim: true },
    heldBy: { type: String, required: true, trim: true },
  },
  { _id: true, timestamps: true },
);

const safetyAlarmSchema = new Schema<TSafetyAlarm>(
  {
    alarmPhoto: { type: String },
    alarmName: { type: String, trim: true },
    locationInProperty: { type: String, trim: true },
    expiry: { type: Date },
  },
  { _id: true, timestamps: true },
);

const applianceSchema = new Schema<TAppliance>(
  {
    appliancePhoto: { type: String },
    applianceName: { type: String, required: true, trim: true },
    brand: { type: String, trim: true },
    modelNote: { type: String },
    warranty: { type: String },
  },
  { _id: true, timestamps: true },
);

const flatSchema = new Schema<TFlat, FlatModel>(
  {
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    unitName: {
      type: String,
      required: true,
      trim: true,
    },
    rentPerMonth: {
      type: Number,
      required: true,
    },
    beds: {
      type: Number,
      default: 0,
    },
    baths: {
      type: Number,
      default: 0,
    },
    sqft: {
      type: Number,
    },
    floor: {
      type: Number,
      required: true,
    },
    floorNote: {
      type: String,
      trim: true,
    },
    unitType: {
      type: String,
      trim: true,
    },
    furnished: {
      type: String,
      enum: Object.values(FURNISHED_TYPE),
      default: FURNISHED_TYPE.NOT_SET,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    flatPhotos: [
      {
        type: String,
      },
    ],
    key: [keySchema],
    gas: gasSchema,
    electricity: electricitySchema,
    water: waterSchema,
    wifi: wifiSchema,
    safetyAlarms: [safetyAlarmSchema],
    appliances: [applianceSchema],
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    tenants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

flatSchema.plugin(softDeletePlugin);

export const Flat = model<TFlat, FlatModel>("Flat", flatSchema);
