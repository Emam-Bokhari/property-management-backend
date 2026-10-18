import { USER_ROLES } from "../../../enums/user";
import { ISoftDeleteModel } from "../../../types/softDelete";

export type TFaq = {
  question: string;
  answer: string;
  role: USER_ROLES;
};

export type FaqModel = ISoftDeleteModel<TFaq>;
