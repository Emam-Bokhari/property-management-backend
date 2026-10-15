import { ISoftDeleteModel } from "../../../types/softDelete";
import { AppOptionType } from "./appOption.constant";

export type TAppOption = {
  name: string;
  type: AppOptionType;
  isActive?: boolean;
};

export type AppOptionModel = ISoftDeleteModel<TAppOption>;
