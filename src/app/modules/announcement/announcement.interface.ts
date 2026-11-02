import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { VISIBILITY_SCOPE } from "./announcement.constant";

export type TAnnouncement = {
  property: Types.ObjectId;
  flats?: Types.ObjectId[];
  visibilityScope: VISIBILITY_SCOPE;
  title: string;
  message: string;
  image?: string;
  landlord: Types.ObjectId;
  recipients?: Types.ObjectId[];
  isDeleted?: boolean;
  deletedAt?: Date;
};

export type AnnouncementModel = ISoftDeleteModel<TAnnouncement>;
