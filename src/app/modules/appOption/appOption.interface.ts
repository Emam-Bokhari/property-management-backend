import { AppOptionType } from "./appOption.constant";

export type TAppOption = {
    name: string;
    type: AppOptionType
    isActive?: boolean;
}