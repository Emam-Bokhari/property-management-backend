import { model, Schema, Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import {
  MAINTENANCE_STATUS,
  PAYMENT_STATUS,
} from "../maintenance/maintenance.constant";
import { Maintenance } from "../maintenance/maintenance.model";
import {
  ReviewModel,
  TContractorReviewSummary,
  TReview,
} from "./review.interface";

const reviewSchema = new Schema<TReview, ReviewModel>(
  {
    contractor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Contractor ID is required"],
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Tenant ID is required"],
    },
    maintenance: {
      type: Schema.Types.ObjectId,
      ref: "Maintenance",
      required: [true, "Maintenance ID is required"],
      unique: true, // Akta kaj a akbar e review/rating dite parbe
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
      validate: {
        validator: function (val: number) {
          // Kebol 1, 2, 3, 4, 5 star e dite parbe, float hobe na
          return Number.isInteger(val) && val >= 1 && val <= 5;
        },
        message:
          "Rating must be an integer between 1 and 5. Float/decimal ratings are not allowed.",
      },
    },
    feedback: {
      type: String,
      trim: true,
      default: "", // Feedback daoua optional
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Indexes
reviewSchema.index({ maintenance: 1 }, { unique: true });
reviewSchema.index({ contractor: 1, createdAt: -1 });
reviewSchema.index({ tenant: 1 });

// Validation: Nije k nije review/rating dite parbe na
reviewSchema.pre("validate", function (next) {
  if (
    this.tenant &&
    this.contractor &&
    this.tenant.toString() === this.contractor.toString()
  ) {
    return next(
      new ApiError(
        StatusCodes.BAD_REQUEST,
        "You cannot review or rate yourself",
      ),
    );
  }
  next();
});

// Validation: Kaj complete hoile e abong payment complete hoile e kebol review/rating dite parbe
reviewSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("maintenance")) {
    const maintenanceDoc = await Maintenance.findById(this.maintenance);

    if (!maintenanceDoc) {
      return next(
        new ApiError(StatusCodes.NOT_FOUND, "Maintenance request not found"),
      );
    }

    if (maintenanceDoc.status !== MAINTENANCE_STATUS.COMPLETED) {
      return next(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          "Review can only be submitted once the maintenance job is completed",
        ),
      );
    }

    if (maintenanceDoc.paymentStatus !== PAYMENT_STATUS.PAID) {
      return next(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          "Review can only be submitted once the maintenance job payment is completed",
        ),
      );
    }

    if (!maintenanceDoc.contractor) {
      return next(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          "This maintenance job does not have an assigned contractor",
        ),
      );
    }

    if (
      maintenanceDoc.contractor.toString() !== this.contractor.toString()
    ) {
      return next(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          "The contractor does not match the contractor assigned to this maintenance job",
        ),
      );
    }

    const jobTenantId = maintenanceDoc.tenant
      ? maintenanceDoc.tenant.toString()
      : maintenanceDoc.requestedBy?.toString();

    if (
      jobTenantId &&
      jobTenantId !== this.tenant.toString()
    ) {
      return next(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          "Only the tenant associated with this maintenance job can submit a review",
        ),
      );
    }
  }

  next();
});

// Static method to calculate contractor average rating (Float), total reviews and star breakdown
reviewSchema.statics.calculateAverageRating = async function (
  contractorId: Types.ObjectId | string,
): Promise<TContractorReviewSummary> {
  const targetContractorId =
    typeof contractorId === "string"
      ? new Types.ObjectId(contractorId)
      : contractorId;

  const stats = await this.aggregate([
    {
      $match: {
        contractor: targetContractorId,
      },
    },
    {
      $group: {
        _id: "$contractor",
        totalReviews: { $sum: 1 },
        averageRating: { $avg: "$rating" },
        fiveStar: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
        fourStar: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
        threeStar: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
        twoStar: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
        oneStar: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
      },
    },
  ]);

  if (stats.length > 0) {
    const rawAverage = stats[0].averageRating ?? 0;
    return {
      contractor: targetContractorId,
      // Average rating e float thakbe (e.g. 4.8)
      averageRating: parseFloat(rawAverage.toFixed(1)),
      totalReviews: stats[0].totalReviews,
      ratingDistribution: {
        5: stats[0].fiveStar,
        4: stats[0].fourStar,
        3: stats[0].threeStar,
        2: stats[0].twoStar,
        1: stats[0].oneStar,
      },
    };
  }

  return {
    contractor: targetContractorId,
    averageRating: 0.0,
    totalReviews: 0,
    ratingDistribution: {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    },
  };
};

export const Review = model<TReview, ReviewModel>("Review", reviewSchema);
