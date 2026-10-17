import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import {
  INSPECTION_STATUS,
  ROOM_INSPECTION_STATUS,
} from "./inspection.constant";
import {
  InspectionModel,
  TInspection,
  TRoomChecklistItem,
} from "./inspection.interface";

const roomChecklistItemSchema = new Schema<TRoomChecklistItem>(
  {
    room: {
      type: Schema.Types.ObjectId,
      ref: "InventoryRoom",
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(ROOM_INSPECTION_STATUS),
      default: ROOM_INSPECTION_STATUS.PASS,
      required: true,
    },
    defectNotes: {
      type: String,
      trim: true,
    },
    repairLogged: {
      type: Boolean,
      default: false,
    },
    maintenanceJob: {
      type: Schema.Types.ObjectId,
      ref: "Maintenance",
    },
  },
  { _id: true },
);

const inspectionSchema = new Schema<TInspection, InspectionModel>(
  {
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    flat: {
      type: Schema.Types.ObjectId,
      ref: "Flat",
      default: null,
      index: true,
    },
    isCommunalArea: {
      type: Boolean,
      default: false,
    },
    areaName: {
      type: String,
      required: true,
      trim: true,
    },
    inspector: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    inspectionDate: {
      type: Date,
      default: Date.now,
    },
    roomChecklist: {
      type: [roomChecklistItemSchema],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
    },
    inspectionPhotos: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: Object.values(INSPECTION_STATUS),
      default: INSPECTION_STATUS.COMPLETED,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

inspectionSchema.plugin(softDeletePlugin);

export const Inspection = model<TInspection, InspectionModel>(
  "Inspection",
  inspectionSchema,
);
