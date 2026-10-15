import { z } from "zod";
import { COUNCIL_TAX, EPC_RATING, COMPLIANCE_TYPE } from "./property.constant";

const councilZodSchema = z.object({
  authority: z
    .string({ required_error: "Council authority is required" })
    .min(1, "Council authority cannot be empty"),
  taxBand: z.nativeEnum(COUNCIL_TAX, {
    required_error: "Tax band is required",
  }),
  reference: z
    .string({ required_error: "Council reference is required" })
    .min(1, "Council reference cannot be empty"),
  contact: z.union(
    [
      z.number(),
      z.string().transform((val) => {
        const cleaned = val.replace(/\s+/g, "");
        const num = Number(cleaned);
        return isNaN(num) ? 0 : num;
      }),
    ],
    { required_error: "Council contact is required" },
  ),
  bins: z.string().optional(),
  councilPhoto: z.string().optional(),
});

const parkingZodSchema = z.object({
  parkingType: z
    .string({ required_error: "Parking type is required" })
    .min(1, "Parking type cannot be empty"),
  space: z.string().optional(),
  permit: z
    .string({ required_error: "Permit info is required" })
    .min(1, "Permit info cannot be empty"),
  allocatedCount: z
    .union([
      z.number(),
      z.string().transform((val) => {
        const num = Number(val);
        return isNaN(num) ? 0 : num;
      }),
    ])
    .optional()
    .default(0),
  notes: z.string().optional(),
  parkingPhoto: z.string().optional(),
});

const complianceItemZodSchema = z.object({
  current: z.string().optional(),
  history: z.array(z.string()).optional(),
});

const complianceZodSchema = z.object({
  gasSafety: complianceItemZodSchema.optional(),
  electrical: complianceItemZodSchema.optional(),
  energyPerformance: complianceItemZodSchema.optional(),
  landlordInsurance: complianceItemZodSchema.optional(),
  depositProtection: complianceItemZodSchema.optional(),
  propertyLicense: complianceItemZodSchema.optional(),
  otherDocuments: z
    .union([z.string().transform((val) => [val]), z.array(z.string())])
    .optional(),
});

const createPropertyZodSchema = z.object({
  body: z.object({
    landlord: z.string().optional(),
    propertyName: z
      .string({ required_error: "Property name is required" })
      .min(1, "Property name cannot be empty"),
    propertyPhotos: z.array(z.string()).optional(),
    floorPlanPhotos: z.array(z.string()).optional(),
    streetAddress: z
      .string({ required_error: "Street address is required" })
      .min(1, "Street address cannot be empty"),
    postCode: z
      .string({ required_error: "Post code is required" })
      .min(1, "Post code cannot be empty"),
    floorsInBuilding: z
      .string({ required_error: "Floors in building is required" })
      .min(1, "Floors in building cannot be empty"),
    propertyType: z.string({ required_error: "Property type ID is required" }),
    isHmo: z
      .union([
        z.boolean(),
        z.string().transform((val) => val === "true" || val === "1"),
      ])
      .optional()
      .default(false),
    yearBuilt: z
      .string({ required_error: "Year built is required" })
      .min(1, "Year built cannot be empty"),
    datePurchased: z.union([z.string(), z.date()], {
      required_error: "Date purchased is required",
    }),
    valuation: z.union(
      [
        z.number(),
        z.string().transform((val) => {
          const cleaned = val.replace(/,/g, "").trim();
          const num = Number(cleaned);
          return isNaN(num) ? 0 : num;
        }),
      ],
      { required_error: "Valuation is required" },
    ),
    valuationDate: z.union([z.string(), z.date()], {
      required_error: "Valuation date is required",
    }),
    epcRating: z.nativeEnum(EPC_RATING, {
      required_error: "EPC rating is required",
    }),
    epcExpireDate: z.union([z.string(), z.date()], {
      required_error: "EPC expire date is required",
    }),
    insuranceRenewal: z.union([z.string(), z.date()], {
      required_error: "Insurance renewal date is required",
    }),
    councilTax: z.nativeEnum(COUNCIL_TAX, {
      required_error: "Council tax band is required",
    }),
    buildingNotes: z.string().optional(),
    council: councilZodSchema.optional(),
    parking: parkingZodSchema.optional(),
    houseRules: z.string().optional(),
    compliance: complianceZodSchema.optional(),
  }),
});

const updatePropertyZodSchema = z.object({
  body: z.object({
    landlord: z.string().optional(),
    propertyName: z.string().min(1, "Property name cannot be empty").optional(),
    propertyPhotos: z.array(z.string()).optional(),
    floorPlanPhotos: z.array(z.string()).optional(),
    streetAddress: z
      .string()
      .min(1, "Street address cannot be empty")
      .optional(),
    postCode: z.string().min(1, "Post code cannot be empty").optional(),
    floorsInBuilding: z
      .string()
      .min(1, "Floors in building cannot be empty")
      .optional(),
    propertyType: z.string().optional(),
    isHmo: z
      .union([
        z.boolean(),
        z.string().transform((val) => val === "true" || val === "1"),
      ])
      .optional(),
    yearBuilt: z.string().min(1, "Year built cannot be empty").optional(),
    datePurchased: z.union([z.string(), z.date()]).optional(),
    valuation: z
      .union([
        z.number(),
        z.string().transform((val) => {
          const cleaned = val.replace(/,/g, "").trim();
          const num = Number(cleaned);
          return isNaN(num) ? 0 : num;
        }),
      ])
      .optional(),
    valuationDate: z.union([z.string(), z.date()]).optional(),
    epcRating: z.nativeEnum(EPC_RATING).optional(),
    epcExpireDate: z.union([z.string(), z.date()]).optional(),
    insuranceRenewal: z.union([z.string(), z.date()]).optional(),
    councilTax: z.nativeEnum(COUNCIL_TAX).optional(),
    buildingNotes: z.string().optional(),
    council: councilZodSchema.partial().optional(),
    parking: parkingZodSchema.partial().optional(),
    houseRules: z.string().optional(),
    compliance: complianceZodSchema.optional(),
  }),
});

const updateCouncilZodSchema = z.object({
  body: councilZodSchema
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one council field must be provided to update",
    }),
});

const updateParkingZodSchema = z.object({
  body: parkingZodSchema
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one parking field must be provided to update",
    }),
});

const complianceTypeEnum = z.union(
  [
    z.nativeEnum(COMPLIANCE_TYPE),
    z.enum([
      "gasSafety",
      "electrical",
      "energyPerformance",
      "landlordInsurance",
      "depositProtection",
      "propertyLicense",
      "otherDocuments",
    ]),
  ],
  {
    required_error: "Compliance type is required",
  },
);

const updateComplianceZodSchema = z.object({
  body: z.object({
    complianceType: complianceTypeEnum,
    certificateUrl: z.union(
      [
        z.string().min(1, "Certificate URL cannot be empty"),
        z
          .array(z.string().min(1))
          .min(1, "At least one certificate URL is required"),
      ],
      {
        required_error: "Certificate URL is required",
      },
    ),
    oldCertificateUrl: z.string().optional(),
  }),
});

const deleteComplianceZodSchema = z.object({
  body: z.object({
    complianceType: complianceTypeEnum,
    certificateUrl: z
      .string({ required_error: "Certificate URL is required to delete" })
      .min(1, "Certificate URL cannot be empty"),
  }),
});

const updateFloorPlansZodSchema = z.object({
  body: z.object({
    floorPlanPhotos: z
      .array(z.string({ required_error: "Floor plan photo is required" }))
      .min(1, "At least one floor plan photo is required"),
  }),
});

const updateHouseRulesZodSchema = z.object({
  body: z.object({
    houseRules: z
      .string({ required_error: "House rules is required" })
      .min(1, "House rules cannot be empty"),
  }),
});

export const PropertyValidation = {
  createPropertyZodSchema,
  updatePropertyZodSchema,
  updateCouncilZodSchema,
  updateParkingZodSchema,
  updateComplianceZodSchema,
  deleteComplianceZodSchema,
  updateFloorPlansZodSchema,
  updateHouseRulesZodSchema,
};
