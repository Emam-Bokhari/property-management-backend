import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { FURNISHED_TYPE } from "./flat.constant";

// services & meters
export type TGas = {
  supplier: string;
  mprn: number;
  location: string;
  shutOff: string;
  helpline: number;
  notes?: string;
  meterPhoto?: string;
};

export type TElectricity = {
  supplier: string;
  mprn: number;
  location: string;
  consumerUnit: string;
  helpline: number;
  notes?: string;
  meterPhoto?: string;
};

export type TWater = {
  supplier: string;
  meterNumber: number;
  stopcock: string;
  streetValve: string;
  helpline: number;
  notes?: string;
  meterPhoto?: string;
};

export type TWifi = {
  provider: string;
  network: string;
  password: string;
  router: string;
  supportNumber: number;
  notes?: string;
  routerPhoto?: string;
};

export type TKey = {
  keyType: string;
  quantity: number;
  location: string;
  heldBy: string;
};

export type TSafetyAlarm = {
  alarmPhoto?: string;
  alarmName?: string;
  locationInProperty?: string;
  expiry?: string | Date;
};

export type TAppliance = {
  appliancePhoto?: string;
  applianceName: string;
  brand?: string;
  modelNote?: string;
  warranty?: string;
};

export type TFlat = {
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
};

export type TFalt = TFlat;

export type FlatModel = ISoftDeleteModel<TFlat>;
