import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { DEPOSIT_PROTECTION_SCHEME, TENANCY_STATUS } from "./tenant.constant";
import { ITenancy, TenancyModel, TTenantNote } from "./tenant.interface";

const tenantNoteSchema = new Schema<TTenantNote>(
  {
    notes: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: true,
    id: false,
    timestamps: true,
  },
);

const tenancySchema = new Schema<ITenancy, TenancyModel>(
  {
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    flat: {
      type: Schema.Types.ObjectId,
      ref: "Flat",
      required: true,
      index: true,
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    rentAmount: {
      type: Number,
      required: true,
    },
    leaseStartDate: {
      type: Date,
      required: true,
    },
    leaseEndDate: {
      type: Date,
      required: true,
    },
    securityDeposit: {
      type: Number,
      default: 0,
    },
    advanceRent: {
      type: Number,
      default: 0,
    },
    depositProtectionScheme: {
      type: String,
      trim: true,
      enum: Object.values(DEPOSIT_PROTECTION_SCHEME),
      default: DEPOSIT_PROTECTION_SCHEME.MY_DEPOSITS,
    },
    personalMessage: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: Object.values(TENANCY_STATUS),
      default: TENANCY_STATUS.ACTIVE,
      index: true,
    },
    invitedAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: [tenantNoteSchema],
      default: [],
    },
    document: {
      type: [String],
      default: [],
      set: (val: any) => {
        if (!val) return [];
        if (typeof val === "string") {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              return parsed.map((item) =>
                typeof item === "string"
                  ? item
                  : item?.url || item?.fileUrl || String(item),
              );
            }
          } catch {
            return [val];
          }
          return [val];
        }
        if (Array.isArray(val)) {
          return val.map((item) =>
            typeof item === "string"
              ? item
              : item?.url || item?.fileUrl || String(item),
          );
        }
        return [val];
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

tenancySchema.plugin(softDeletePlugin);

export const Tenancy = model<ITenancy, TenancyModel>("Tenancy", tenancySchema);
