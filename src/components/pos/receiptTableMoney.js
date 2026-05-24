import { formatMoney } from "./posApi";

/** Пороги длины строки «1 000 000» для уменьшения шрифта в HTML-таблице. */
export const RECEIPT_MONEY_SIZE_THRESHOLDS = {
  "50": { compact: 8, tight: 10, micro: 12, nano: 14 },
  "58": { compact: 9, tight: 11, micro: 13, nano: 15 },
  "80": { compact: 11, tight: 13, micro: 15, nano: 17 },
};

export const getReceiptMoneySizeClass = (formattedText, paperSizeId = "50") => {
  const len = String(formattedText ?? "").length;
  const thresholds =
    RECEIPT_MONEY_SIZE_THRESHOLDS[paperSizeId] || RECEIPT_MONEY_SIZE_THRESHOLDS["50"];

  if (len >= thresholds.nano) return "money-nano";
  if (len >= thresholds.micro) return "money-micro";
  if (len >= thresholds.tight) return "money-tight";
  if (len >= thresholds.compact) return "money-compact";
  return "money-normal";
};

/**
 * Сумма для узкой колонки термопринтера: сначала без пробелов, затем без разделителей.
 */
export const compactMoneyForColumn = (value, maxChars) => {
  const limit = Math.max(4, Number(maxChars) || 8);
  const spaced = formatMoney(value);
  if (spaced.length <= limit) return spaced;

  const noSpaces = spaced.replace(/\s/g, "");
  if (noSpaces.length <= limit) return noSpaces;

  const raw = String(Math.round(Number(value) || 0));
  if (raw.length <= limit) return raw;

  return raw.slice(0, limit);
};

export const formatReceiptTableMoneyText = (value) => {
  if (value == null || !(Number(value) > 0)) return null;
  return formatMoney(value);
};
