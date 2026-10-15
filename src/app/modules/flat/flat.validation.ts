import { z } from "zod";
import { FURNISHED_TYPE } from "./flat.constant";

const keyZodSchema = z.object({
  keyType: z.string({ required_error: "Key type is required" }),
  quantity: z.coerce.number().optional().default(1),
  location: z.string({ required_error: "Key location is required" }),
  heldBy: z.string({ required_error: "Key held by is required" }),
});

const updateKeyZodSchema = z.object({
  body: z.object({
    keyType: z.string().optional(),
    quantity: z.coerce.number().optional(),
    location: z.string().optional(),
    heldBy: z.string().optional(),
  }),
});

const addKeyZodSchema = z.object({
  body: keyZodSchema,
});

const gasZodSchema = z.object({
  supplier: z.string().optional(),
  mprn: z.union([z.number(), z.string()]).optional(),
  location: z.string().optional(),
  shutOff: z.string().optional(),
  helpline: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional(),
  meterPhoto: z.string().optional(),
});

const upsertGasZodSchema = z.object({
  body: gasZodSchema,
});

const electricityZodSchema = z.object({
  supplier: z.string().optional(),
  mprn: z.union([z.number(), z.string()]).optional(),
  location: z.string().optional(),
  consumerUnit: z.string().optional(),
  helpline: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional(),
  meterPhoto: z.string().optional(),
});

const upsertElectricityZodSchema = z.object({
  body: electricityZodSchema,
});

const waterZodSchema = z.object({
  supplier: z.string().optional(),
  meterNumber: z.union([z.number(), z.string()]).optional(),
  stopcock: z.string().optional(),
  streetValve: z.string().optional(),
  helpline: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional(),
  meterPhoto: z.string().optional(),
});

const upsertWaterZodSchema = z.object({
  body: waterZodSchema,
});

const wifiZodSchema = z.object({
  provider: z.string().optional(),
  network: z.string().optional(),
  password: z.string().optional(),
  router: z.string().optional(),
  supportNumber: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional(),
  routerPhoto: z.string().optional(),
});

const upsertWifiZodSchema = z.object({
  body: wifiZodSchema,
});

const safetyAlarmZodSchema = z.object({
  alarmPhoto: z.string().optional(),
  alarmName: z.string().optional(),
  locationInProperty: z.string().optional(),
  expiry: z.union([z.string(), z.date()]).optional(),
});

const addSafetyAlarmZodSchema = z.object({
  body: safetyAlarmZodSchema,
});

const updateSafetyAlarmZodSchema = z.object({
  body: safetyAlarmZodSchema.partial(),
});

const applianceZodSchema = z.object({
  appliancePhoto: z.string().optional(),
  applianceName: z.string({ required_error: "Appliance name is required" }),
  brand: z.string().optional(),
  modelNote: z.string().optional(),
  warranty: z.string().optional(),
});

const addApplianceZodSchema = z.object({
  body: applianceZodSchema,
});

const updateApplianceZodSchema = z.object({
  body: applianceZodSchema.partial(),
});

const createFlatZodSchema = z.object({
  body: z.object({
    unitName: z
      .string({ required_error: "Unit name is required" })
      .min(1, "Unit name cannot be empty"),
    rentPerMonth: z.coerce.number({
      required_error: "Rent per month is required",
    }),
    beds: z.coerce.number().optional().default(0),
    baths: z.coerce.number().optional().default(0),
    sqft: z.coerce.number().optional(),
    floor: z.coerce.number({ required_error: "Floor is required" }),
    floorNote: z.string().optional(),
    unitType: z.string().optional(),
    furnished: z
      .nativeEnum(FURNISHED_TYPE)
      .optional()
      .default(FURNISHED_TYPE.NOT_SET),
    property: z.string({ required_error: "Property ID is required" }),
    flatPhotos: z
      .union([z.string(), z.array(z.string())])
      .transform((val) => (Array.isArray(val) ? val : [val]))
      .optional(),
    key: z.array(keyZodSchema).optional(),
    gas: gasZodSchema.optional(),
    electricity: electricityZodSchema.optional(),
    water: waterZodSchema.optional(),
    wifi: wifiZodSchema.optional(),
    safetyAlarms: z.array(safetyAlarmZodSchema).optional(),
    appliances: z.array(applianceZodSchema).optional(),
  }),
});

const updateFlatZodSchema = z.object({
  body: z.object({
    unitName: z.string().min(1, "Unit name cannot be empty").optional(),
    rentPerMonth: z.coerce.number().optional(),
    beds: z.coerce.number().optional(),
    baths: z.coerce.number().optional(),
    sqft: z.coerce.number().optional(),
    floor: z.coerce.number().optional(),
    floorNote: z.string().optional(),
    unitType: z.string().optional(),
    furnished: z.nativeEnum(FURNISHED_TYPE).optional(),
    property: z.string().optional(),
    flatPhotos: z
      .union([z.string(), z.array(z.string())])
      .transform((val) => (Array.isArray(val) ? val : [val]))
      .optional(),
    key: z.array(keyZodSchema).optional(),
    gas: gasZodSchema.optional(),
    electricity: electricityZodSchema.optional(),
    water: waterZodSchema.optional(),
    wifi: wifiZodSchema.optional(),
    safetyAlarms: z.array(safetyAlarmZodSchema).optional(),
    appliances: z.array(applianceZodSchema.partial()).optional(),
  }),
});

export const FlatValidation = {
  createFlatZodSchema,
  updateFlatZodSchema,
  addKeyZodSchema,
  updateKeyZodSchema,
  upsertGasZodSchema,
  upsertElectricityZodSchema,
  upsertWaterZodSchema,
  upsertWifiZodSchema,
  addSafetyAlarmZodSchema,
  updateSafetyAlarmZodSchema,
  addApplianceZodSchema,
  updateApplianceZodSchema,
};
