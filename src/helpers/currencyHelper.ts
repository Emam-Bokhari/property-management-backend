import config from "../config";

/**
 * Returns the lowercase currency code (e.g., "usd", "gbp")
 * Sourced dynamically from .env CURRENCY
 */
export const getCurrencyCode = (): string => {
  return (config.currency || process.env.CURRENCY || "usd").toLowerCase();
};

/**
 * Returns the uppercase currency code (e.g., "USD", "GBP")
 * Sourced dynamically from .env CURRENCY
 */
export const getCurrencyCodeUpper = (): string => {
  return (config.currency_code || process.env.CURRENCY || "USD").toUpperCase();
};

/**
 * Returns the currency symbol based on .env configuration or a specific currency code
 */
export const getCurrencySymbol = (currency?: string): string => {
  if (!currency && process.env.CURRENCY_SYMBOL) {
    return process.env.CURRENCY_SYMBOL;
  }

  const curr = (
    currency ||
    process.env.CURRENCY ||
    config.currency ||
    "usd"
  ).toLowerCase();

  switch (curr) {
    case "gbp":
      return "£";
    case "eur":
      return "€";
    case "usd":
      return "$";
    case "bdt":
      return "৳";
    case "inr":
      return "₹";
    case "cad":
      return "CA$";
    case "aud":
      return "A$";
    case "jpy":
      return "¥";
    case "cny":
      return "¥";
    default:
      return process.env.CURRENCY_SYMBOL || config.currency_symbol || "$";
  }
};

/**
 * Formats a numeric amount with the currency symbol and localized number formatting
 * e.g., formatCurrency(2450) -> "$2,450"
 */
export const formatCurrency = (
  amount: number,
  symbol: string = getCurrencySymbol(),
): string => {
  return `${symbol}${Number(amount || 0).toLocaleString("en-US")}`;
};

/**
 * Formats a monthly price into "$19/mo" or "Free"
 */
export const formatMonthlyPrice = (
  price?: number | null,
  symbol: string = getCurrencySymbol(),
): string => {
  const p = Number(price || 0);
  return p > 0 ? `${symbol}${p.toLocaleString("en-US")}/mo` : "Free";
};
