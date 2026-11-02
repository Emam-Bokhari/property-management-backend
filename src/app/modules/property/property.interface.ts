import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { COUNCIL_TAX, EPC_RATING } from "./property.constant";

export type TCouncil = {
  authority: string;
  taxBand: COUNCIL_TAX;
  reference: string;
  contact: number;
  bins?: string;
  councilPhoto?: string;
};

export type TParking = {
  parkingType: string;
  space?: string;
  permit: string;
  allocatedCount: number;
  notes?: string;
  parkingPhoto?: string;
};

// compliance item maintaining 1 active/current certificate and historical records
export type TComplianceItem = {
  current?: string;
  history?: string[];
};

// all compliance categories matching the UI screen
export type TCompliance = {
  gasSafety?: TComplianceItem;
  electrical?: TComplianceItem;
  energyPerformance?: TComplianceItem;
  landlordInsurance?: TComplianceItem;
  depositProtection?: TComplianceItem;
  propertyLicense?: TComplianceItem;
  otherDocuments?: string[];
};

export type TProperty = {
  landlord?: Types.ObjectId;
  propertyName: string;
  propertyPhotos?: string[];
  floorPlanPhotos?: string[];
  streetAddress: string;
  postCode: string;
  floorsInBuilding: string;
  propertyType: Types.ObjectId;
  isHmo?: boolean;
  yearBuilt: string;
  datePurchased: string | Date;
  valuation: number;
  valuationDate: string | Date;
  epcRating: EPC_RATING;
  epcExpireDate: string | Date;
  insuranceRenewal: string | Date;
  councilTax: COUNCIL_TAX;
  buildingNotes?: string;
  council?: TCouncil;
  parking?: TParking;
  houseRules?: string;
  compliance?: TCompliance;
  isDeleted?: boolean;
  deletedAt?: Date;
};

export type PropertyModel = ISoftDeleteModel<TProperty>;

export interface IPropertyStats {
  totalProperties: number;
  totalUnits: number;
  overallOccupancy: string;
}
