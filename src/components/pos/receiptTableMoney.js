import { formatMoney } from "./posApi";
import { RECEIPT_SIZE_PRESETS } from "./receiptPrintSettings";

const COL_MONEY_RATIO = 0.21;
const CHAR_WIDTH_EM = 0.58;
const PT_TO_MM = 0.352778;
const MIN_MONEY_PT = 4.5;

const paperWidthMmFor = (paperSizeId) =>
  RECEIPT_SIZE_PRESETS[paperSizeId]?.paperWidthMm ?? RECEIPT_SIZE_PRESETS["50"].paperWidthMm;

/**
 * Inline-стиль суммы для печати: явный pt от ширины колонки (мм) и длины числа.
 * Работает одинаково в предпросмотре и в системной печати (iframe).
 */
export const getReceiptMoneyPrintStyle = (
  formattedText,
  paperSizeId = "50",
  tablePt = 11,
  paperWidthMm = null
) => {
  const text = String(formattedText ?? "");
  const len = Math.max(1, text.length);
  const paperMm = paperWidthMm ?? paperWidthMmFor(paperSizeId);
  const colWidthMm = Math.max(6, paperMm * COL_MONEY_RATIO - 1.4);
  const basePt = Math.min(12, Number(tablePt) || 11);

  const fitPt = colWidthMm / (len * PT_TO_MM * CHAR_WIDTH_EM);
  let fontPt = Math.min(basePt, fitPt * 0.94);
  fontPt = Math.max(MIN_MONEY_PT, Math.round(fontPt * 10) / 10);

  const styleParts = [
    `font-size:${fontPt}pt`,
    "line-height:1.05",
    "font-weight:700",
    "font-variant-numeric:tabular-nums",
    "white-space:nowrap",
    "display:inline-block",
    "vertical-align:middle",
    "-webkit-print-color-adjust:exact",
    "print-color-adjust:exact",
  ];

  const usedWidthMm = len * fontPt * PT_TO_MM * CHAR_WIDTH_EM;
  if (usedWidthMm > colWidthMm) {
    const scale = Math.max(0.4, (colWidthMm / usedWidthMm) * 0.96);
    styleParts.push("transform-origin:100% 50%");
    styleParts.push(`transform:scale(${scale.toFixed(3)})`);
  } else if (len >= 10) {
    styleParts.push("letter-spacing:-0.04em");
  }

  return styleParts.join(";");
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

export const buildReceiptTableMoneyHtml = (value, { paperSizeId, tablePt, paperWidthMm }) => {
  const text = formatReceiptTableMoneyText(value);
  if (!text) return "—";
  const style = getReceiptMoneyPrintStyle(text, paperSizeId, tablePt, paperWidthMm);
  return `<span class="money-value" style="${style}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`;
};
