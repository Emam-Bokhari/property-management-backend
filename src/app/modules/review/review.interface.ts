import { Model, Types } from "mongoose";

export type TRating = 1 | 2 | 3 | 4 | 5;

export type TRatingDistribution = {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
};

export type TContractorReviewSummary = {
  contractor: Types.ObjectId | string;
  averageRating: number; // Float representation e.g. 4.8
  totalReviews: number;
  ratingDistribution: TRatingDistribution;
};

export type TReview = {
  contractor: Types.ObjectId;
  tenant: Types.ObjectId;
  maintenance: Types.ObjectId;
  rating: TRating;
  feedback?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type TCreateReviewPayload = {
  contractor?: string;
  maintenance: string;
  rating: TRating;
  feedback?: string;
};

export interface ReviewModel extends Model<TReview> {
  calculateAverageRating(
    contractorId: Types.ObjectId | string,
  ): Promise<TContractorReviewSummary>;
}