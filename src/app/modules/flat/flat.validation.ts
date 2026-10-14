import { z } from "zod";
import { FURNISHED_TYPE } from "./flat.constant";

const keyZodSchema = z.object({
  keyType: z.string({ required_error: "Key type is required" }),
  quantity: z.number({ required_error: "Key quantity is required" }),
  location: z.string({ required_error: "Key location is required" }),
  heldBy: z.string({ required_error: "Key held by is required" }),
});

const gasZodSchema = z.object({
  supplier: z.string().optional(),
  mprn: z.number().optional(),
  location: z.string().optional(),
  shutOff: z.string().optional(),
  helpline: z.number().optional(),
  notes: z.string().optional(),
  meterPhoto: z.string().optional(),
});

const electricityZodSchema = z.object({
  supplier: z.string().optional(),
  mprn: z.number().optional(),
  location: z.string().optional(),
  consumerUnit: z.string().optional(),
  helpline: z.number().optional(),
  notes: z.string().optional(),
  meterPhoto: z.string().optional(),
});

const waterZodSchema = z.object({
  supplier: z.string().optional(),
  meterNumber: z.number().optional(),
  stopcock: z.string().optional(),
  streetValve: z.string().optional(),
  helpline: z.number().optional(),
  notes: z.string().optional(),
  meterPhoto: z.string().optional(),
});

const wifiZodSchema = z.object({
  provider: z.string().optional(),
  network: z.string().optional(),
  password: z.string().optional(),
  router: z.string().optional(),
  supportNumber: z.number().optional(),
  notes: z.string().optional(),
  routerPhoto: z.string().optional(),
});

const safetyAlarmZodSchema = z.object({
  alarmPhoto: z.string().optional(),
  alarmName: z.string().optional(),
  locationInProperty: z.string().optional(),
  expiry: z.union([z.string(), z.date()]).optional(),
});

const applianceZodSchema = z.object({
  appliancePhoto: z.string().optional(),
  applianceName: z.string({ required_error: "Appliance name is required" }),
  brand: z.string().optional(),
  modelNote: z.string().optional(),
  warranty: z.string().optional(),
});

const createFlatZodSchema = z.object({
  body: z.object({
    unitName: z
      .string({ required_error: "Unit name is required" })
      .min(1, "Unit name cannot be empty"),
    rentPerMonth: z.number({ required_error: "Rent per month is required" }),
    beds: z.number().optional().default(0),
    baths: z.number().optional().default(0),
    sqft: z.number().optional(),
    floor: z.number({ required_error: "Floor is required" }),
    floorNote: z.string().optional(),
    unitType: z.string().optional(),
    furnished: z
      .nativeEnum(FURNISHED_TYPE)
      .optional()
      .default(FURNISHED_TYPE.NOT_FURNISHED),
    property: z.string({ required_error: "Property ID is required" }),
    flatPhotos: z.array(z.string()).optional(),
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
    rentPerMonth: z.number().optional(),
    beds: z.number().optional(),
    baths: z.number().optional(),
    sqft: z.number().optional(),
    floor: z.number().optional(),
    floorNote: z.string().optional(),
    unitType: z.string().optional(),
    furnished: z.nativeEnum(FURNISHED_TYPE).optional(),
    property: z.string().optional(),
    flatPhotos: z.array(z.string()).optional(),
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
};
