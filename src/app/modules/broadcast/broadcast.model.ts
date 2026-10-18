import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import {
  BROADCAST_AUDIENCE,
  BROADCAST_CHANNEL,
  BROADCAST_STATUS,
} from "./broadcast.constant";
import { BroadcastModel, IBroadcast } from "./broadcast.interface";

const broadcastSchema = new Schema<IBroadcast, BroadcastModel>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    audience: {
      type: String,
      enum: Object.values(BROADCAST_AUDIENCE),
      default: BROADCAST_AUDIENCE.ALL_LANDLORDS,
      required: true,
    },
    selectedLandlords: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    recipientCount: {
      type: Number,
      default: 0,
    },
    channel: {
      type: String,
      enum: Object.values(BROADCAST_CHANNEL),
      default: BROADCAST_CHANNEL.PUSH_NOTIFICATION,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(BROADCAST_STATUS),
      default: BROADCAST_STATUS.PENDING,
      index: true,
    },
    sentAt: {
      type: Date,
      required: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

broadcastSchema.index({ status: 1, createdAt: -1 });
broadcastSchema.plugin(softDeletePlugin);

export const Broadcast = model<IBroadcast, BroadcastModel>(
  "Broadcast",
  broadcastSchema,
);
