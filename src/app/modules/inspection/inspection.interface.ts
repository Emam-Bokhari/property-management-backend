import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import {
  INSPECTION_STATUS,
  ROOM_INSPECTION_STATUS,
} from "./inspection.constant";

export type TRoomChecklistItem = {
  _id?: Types.ObjectId | string;
  room?: Types.ObjectId;
  roomName: string;
  status: ROOM_INSPECTION_STATUS;
  defectNotes?: string;
  repairLogged?: boolean;
  maintenanceJob?: Types.ObjectId;
};

export type TInspection = {
  _id?: Types.ObjectId;
  property: Types.ObjectId;
  flat?: Types.ObjectId | null;
  isCommunalArea?: boolean;
  areaName: string;
  inspector: Types.ObjectId;
  inspectionDate?: Date | string;
  roomChecklist: TRoomChecklistItem[];
  notes?: string;
  inspectionPhotos?: string[];
  status?: INSPECTION_STATUS;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type InspectionModel = ISoftDeleteModel<TInspection>;
