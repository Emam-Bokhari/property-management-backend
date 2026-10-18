import { StatusCodes } from "http-status-codes";
import { Faq } from "./faq.model";
import mongoose from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { TFaq } from "./faq.interface";
import QueryBuilder from "../../builder/queryBuilder";
import { faqSearchableFields, normalizeFaqRole } from "./faq.constant";
import { USER_ROLES } from "../../../enums/user";

const createFaqToDB = async (payload: Partial<TFaq>) => {
  if (payload.role) {
    payload.role = normalizeFaqRole(payload.role) as USER_ROLES;
  }

  const faq = await Faq.create(payload);
  if (!faq) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to create Faq");
  }

  return faq;
};

const faqsFromDB = async (query: Record<string, unknown> = {}) => {
  const queryObj = { ...query };

  // Normalize role if provided in query params (e.g. ?role=landlords or ?role=landlord)
  if (queryObj.role) {
    queryObj.role = normalizeFaqRole(queryObj.role);
  }

  const queryBuilder = new QueryBuilder(Faq.find(), queryObj)
    .search(faqSearchableFields)
    .filter()
    .sort();

  if (query.page || query.limit) {
    queryBuilder.paginate();
    const [data, meta] = await Promise.all([
      queryBuilder.modelQuery.lean(),
      queryBuilder.countTotal(),
    ]);
    return { data, meta };
  }

  const data = await queryBuilder.modelQuery.lean();
  return { data };
};

const getFaqByIdFromDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const faq = await Faq.findById(id);
  if (!faq) {
    throw new ApiError(StatusCodes.NOT_FOUND, "No faq found by this ID");
  }

  return faq;
};

const updateFaqToDB = async (id: string, payload: Partial<TFaq>) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  if (payload.role) {
    payload.role = normalizeFaqRole(payload.role) as USER_ROLES;
  }

  const updatedFaq = await Faq.findByIdAndUpdate({ _id: id }, payload, {
    new: true,
    runValidators: true,
  });

  if (!updatedFaq) {
    throw new ApiError(StatusCodes.NOT_FOUND, "No faq found by this ID");
  }

  return updatedFaq;
};

const deleteFaqToDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const result = await Faq.softDeleteById(id);

  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "No faq found by this ID");
  }

  return result;
};

export const FaqService = {
  createFaqToDB,
  faqsFromDB,
  getFaqByIdFromDB,
  updateFaqToDB,
  deleteFaqToDB,
};
