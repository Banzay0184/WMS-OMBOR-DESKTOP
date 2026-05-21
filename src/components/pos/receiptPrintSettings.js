/**
 * Настройки печати чеков (локально, по организации).
 * Применяются ко всем типам чеков: продажа, Z-отчёт и т.д.
 */

export const RECEIPT_SIZE_PRESETS = {
  "50": {
    id: "50",
    label: "50 мм",
    description: "Стандарт чековых термопринтеров. Печатная зона ~48 мм при корпусе 58 мм.",
    paperWidthMm: 50,
    widthPx203: 400,
    widthPx300: 590,
    nameMaxLen: 24,
  },
  "58": {
    id: "58",
    label: "58 мм",
    description: "Популярный широкий чек с небольшими полями.",
    paperWidthMm: 58,
    widthPx203: 464,
    widthPx300: 684,
    nameMaxLen: 28,
  },
  "80": {
    id: "80",
    label: "80 мм",
    description: "Широкая лента для подробных чеков.",
    paperWidthMm: 80,
    widthPx203: 640,
    widthPx300: 944,
    nameMaxLen: 40,
  },
};

export const RECEIPT_FONT_OPTIONS = [
  { id: "courier", label: "Courier (моноширинный)", family: 'Courier, "Courier New", monospace' },
];

export const RECEIPT_FONT_SIZE_OPTIONS = [
  { value: 9, label: "9 pt" },
  { value: 10, label: "10 pt (рекомендуется)" },
];

export const RECEIPT_DPI_OPTIONS = [
  { id: "203", label: "203 DPI (8 точек/мм)" },
  { id: "300", label: "300 DPI (11.8 точек/мм)" },
];

export const RECEIPT_DOCUMENT_TYPES = [
  { id: "sale", label: "Чек продажи" },
  { id: "z_report", label: "Z-отчёт (смена)" },
];

const STORAGE_KEY = (orgId) => `pos.receiptPrintSettings.${orgId}`;

export const PRINT_MODE_OPTIONS = [
  {
    id: "browser",
    label: "Системная печать",
    description: "Диалог печати ОС (USB-принтер, PDF, любой подключённый принтер).",
  },
  {
    id: "bluetooth",
    label: "Bluetooth ESC/POS",
    description: "Прямая печать на термопринтер через Web Bluetooth (Chrome/Edge).",
  },
];

export const DEFAULT_RECEIPT_PRINT_SETTINGS = {
  paperSizeId: "50",
  fontId: "courier",
  fontSizePt: 10,
  dpiMode: "203",
  autoPrintOnSale: true,
  printMode: "browser",
  shopInn: "",
  receiptFooter: "Спасибо за покупку!",
  /** Имя принтера — подсказка для кассира */
  printerNote: "",
};

export const getReceiptPrintSettings = (organizationId) => {
  if (!organizationId) return { ...DEFAULT_RECEIPT_PRINT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY(organizationId));
    if (!raw) return { ...DEFAULT_RECEIPT_PRINT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_RECEIPT_PRINT_SETTINGS };
    return { ...DEFAULT_RECEIPT_PRINT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_RECEIPT_PRINT_SETTINGS };
  }
};

export const saveReceiptPrintSettings = (organizationId, partial) => {
  if (!organizationId) return;
  const next = { ...getReceiptPrintSettings(organizationId), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY(organizationId), JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
};

export const getReceiptSizePreset = (paperSizeId) => {
  return RECEIPT_SIZE_PRESETS[paperSizeId] || RECEIPT_SIZE_PRESETS["50"];
};

export const getResolvedReceiptLayout = (organizationId) => {
  const settings = getReceiptPrintSettings(organizationId);
  const preset = getReceiptSizePreset(settings.paperSizeId);
  const fontOption = RECEIPT_FONT_OPTIONS.find((f) => f.id === settings.fontId) || RECEIPT_FONT_OPTIONS[0];
  const previewWidthPx =
    settings.dpiMode === "300" ? preset.widthPx300 : preset.widthPx203;

  return {
    settings,
    preset,
    paperWidthMm: preset.paperWidthMm,
    fontFamily: fontOption.family,
    fontSizePt: settings.fontSizePt,
    previewWidthPx,
    nameMaxLen: preset.nameMaxLen,
  };
};
