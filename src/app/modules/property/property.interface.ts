import { Types } from "mongoose";
import { COUNCIL_TAX, EPC_RATING } from "./property.constant";

export type TProperty = {
    propertyName: string;
    propertyPhotos?: string[];
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
}