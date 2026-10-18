import { model, Schema } from "mongoose";
import { TFaq, FaqModel } from "./faq.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { USER_ROLES } from "../../../enums/user";

const faqSchema = new Schema<TFaq>(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.LANDLORD,
      required: true,
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

faqSchema.index({ role: 1 });

faqSchema.plugin(softDeletePlugin);

export const Faq = model<TFaq, FaqModel>("Faq", faqSchema);
