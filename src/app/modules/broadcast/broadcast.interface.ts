import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import {
  BROADCAST_AUDIENCE,
  BROADCAST_CHANNEL,
  BROADCAST_STATUS,
} from "./broadcast.constant";

export type IBroadcast = {
  title: string;
  message: string;
  audience: BROADCAST_AUDIENCE;
  selectedLandlords?: Types.ObjectId[];
  recipientCount: number;
  channel: BROADCAST_CHANNEL;
  status: BROADCAST_STATUS;
  sentAt?: Date;
  createdBy: Types.ObjectId;
  isDeleted?: boolean;
  deletedAt?: Date | null;
};

export type BroadcastModel = ISoftDeleteModel<IBroadcast>;
