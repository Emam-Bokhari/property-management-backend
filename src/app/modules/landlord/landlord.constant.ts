import { getCurrencySymbol } from "../../../helpers/currencyHelper";

export const getLandlordCurrencySymbol = (): string => getCurrencySymbol();
export const LANDLORD_CURRENCY_SYMBOL = getCurrencySymbol();

export const DEFAULT_LANDLORD_QUICK_ACTIONS = [
  {
    id: "announcement",
    title: "Announcement",
    icon: "megaphone",
    route: "/announcements",
  },
  {
    id: "maintenance",
    title: "Maintenance",
    icon: "wrench",
    route: "/maintenance",
  },
  {
    id: "finance",
    title: "Finance",
    icon: "wallet",
    route: "/finance",
  },
];
