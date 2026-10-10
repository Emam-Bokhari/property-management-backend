import { AppOptionsType } from "./appOptions.constant";

export type TAppOptions = {
    name: string;
    type: AppOptionsType
    isActive?: boolean;
}