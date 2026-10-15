import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { FURNISHED_TYPE } from "./flat.constant";

// services & meters
export type TGas = {
  supplier?: string;
  mprn?: number | string;
  location?: string;
  shutOff?: string;
  helpline?: number | string;
  notes?: string;
  meterPhoto?: string;
};

export type TElectricity = {
  supplier?: string;
  mprn?: number | string;
  location?: string;
  consumerUnit?: string;
  helpline?: number | string;
  notes?: string;
  meterPhoto?: string;
};

export type TWater = {
  supplier?: string;
  meterNumber?: number | string;
  stopcock?: string;
  streetValve?: string;
  helpline?: number | string;
  notes?: string;
  meterPhoto?: string;
};

export type TWifi = {
  provider?: string;
  network?: string;
  password?: string;
  router?: string;
  supportNumber?: number | string;
  notes?: string;
  routerPhoto?: string;
};

export type TKey = {
  _id?: Types.ObjectId | string;
  keyType: string;
  quantity: number;
  location: string;
  heldBy: string;
};

export type TSafetyAlarm = {
  _id?: Types.ObjectId | string;
  alarmPhoto?: string;
  alarmName?: string;
  locationInProperty?: string;
  expiry?: string | Date;
};

export type TAppliance = {
  _id?: Types.ObjectId | string;
  appliancePhoto?: string;
  applianceName: string;
  brand?: string;
  modelNote?: string;
  warranty?: string;
};

export type TFlat = {
  landlord?: Types.ObjectId;
  unitName: string;
  rentPerMonth: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  floor: number;
  floorNote?: string;
  unitType?: string;
  furnished?: FURNISHED_TYPE;
  property: Types.ObjectId;
  flatPhotos?: string[];
  key?: TKey[];
  gas?: TGas;
  electricity?: TElectricity;
  water?: TWater;
  wifi?: TWifi;
  safetyAlarms?: TSafetyAlarm[];
  appliances?: TAppliance[];
  tenant?: Types.ObjectId;
  tenants?: Types.ObjectId[];
  isDeleted?: boolean;
  deletedAt?: Date | null;
};

export type TFalt = TFlat;

export type FlatModel = ISoftDeleteModel<TFlat>;
