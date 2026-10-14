export enum EPC_RATING {
  A = "a",
  B = "b",
  C = "c",
  D = "d",
  E = "e",
  F = "f",
  G = "g",
  NOT_RATED = "not_rated",
  EXEMPT = "exempt",
}

export enum COUNCIL_TAX {
  BAND_A = "band_a",
  BAND_B = "band_b",
  BAND_C = "band_c",
  BAND_D = "band_d",
  BAND_E = "band_e",
  BAND_F = "band_f",
  BAND_G = "band_g",
  BAND_H = "band_h",
  NOT_APPLICABLE = "not_applicable",
}

export enum COMPLIANCE_TYPE {
  GAS_SAFETY = "gas_safety",
  ELECTRICAL = "electrical",
  ENERGY_PERFORMANCE = "energy_performance",
  LANDLORD_INSURANCE = "landlord_insurance",
  DEPOSIT_PROTECTION = "deposit_protection",
  PROPERTY_LICENCE = "property_licence",
  OTHER_DOCUMENTS = "other_documents",
}

export const propertySearchableFields = [
  "propertyName",
  "streetAddress",
  "postCode",
  "yearBuilt",
  "floorsInBuilding",
  "buildingNotes",
];
