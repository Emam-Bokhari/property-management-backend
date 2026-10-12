import { Types } from "mongoose";
import { COUNCIL_TAX, EPC_RATING } from "./property.constant";

export type TCouncil = {
    authority: string;
    taxBand: COUNCIL_TAX;
    reference: string;
    contact: number;
    bins?: string;
    councilPhoto?: string;
}

export type TParking = {
    parkingType: string;
    space?: string;
    permit: string;
    allocatedCount: number;
    notes?: string;
    parkingPhoto?: string;
}


export type TProperty = {
    propertyName: string;
    propertyPhotos?: string[];
    floorPlanPhotos?: string[];
    streetAddress: string;
    postCode: string;
    floorsInBuilding: string;
    propertyType: Types.ObjectId;
    yearBuilt: string;
    datePurchased: string | Date;
    valuation: number;
    valuationDate: string | Date;
    epcRating: EPC_RATING;
    epcExpireDate: string | Date;
    insuranceRenewal: string | Date;
    councilTax: COUNCIL_TAX;
    buildingNotes: string;
    council?: TCouncil;
    parking: TParking;
}