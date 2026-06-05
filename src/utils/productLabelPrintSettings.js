/**
 * Настройки печати товарных этикеток (локально, по организации).
 */

export const LABEL_SIZE_PRESETS = {
  "30x20": {
    id: "30x20",
    label: "30 × 20 мм",
    description: "Мелкая ценник-этикетка: цена и штрих-код.",
    widthMm: 30,
    heightMm: 20,
    nameFontPt: 6,
    priceFontPt: 7,
    codeFontPt: 5,
    barcodeScale: 1,
  },
  "40x30": {
    id: "40x30",
    label: "40 × 30 мм",
    description: "Компактная этикетка для мелких товаров.",
    widthMm: 40,
    heightMm: 30,
    nameFontPt: 7,
    priceFontPt: 8,
    codeFontPt: 6,
    barcodeScale: 1.2,
  },
  "58x30": {
    id: "58x30",
    label: "58 × 30 мм",
    description: "Узкая лента 58 мм — цена и штрих-код.",
    widthMm: 58,
    heightMm: 30,
    nameFontPt: 7,
    priceFontPt: 9,
    codeFontPt: 6,
    barcodeScale: 1.4,
  },
  "58x40": {
    id: "58x40",
    label: "58 × 40 мм",
    description: "Универсальный формат для большинства товаров (рекомендуется).",
    widthMm: 58,
    heightMm: 40,
    nameFontPt: 8,
    priceFontPt: 10,
    codeFontPt: 7,
    barcodeScale: 1.6,
  },
  "75x120": {
    id: "75x120",
    label: "75 × 120 мм",
    description: "Крупная этикетка для коробок и групповой упаковки.",
    widthMm: 75,
    heightMm: 120,
    nameFontPt: 10,
    priceFontPt: 12,
    codeFontPt: 8,
    barcodeScale: 2,
  },
  "100x150": {
    id: "100x150",
    label: "100 × 150 мм",
    description: "Логистическая этикетка (принтер 4″).",
    widthMm: 100,
    heightMm: 150,
    nameFontPt: 11,
    priceFontPt: 14,
    codeFontPt: 9,
    barcodeScale: 2.4,
  },
  custom: {
    id: "custom",
    label: "Свой размер",
    description: "Укажите ширину и высоту этикетки в миллиметрах.",
    widthMm: 58,
    heightMm: 40,
    nameFontPt: 8,
    priceFontPt: 10,
    codeFontPt: 7,
    barcodeScale: 1.6,
  },
};

export const LABEL_DPI_OPTIONS = [
  { id: "203", label: "203 DPI (стандарт)" },
  { id: "300", label: "300 DPI (мелкий шрифт / QR)" },
];

const STORAGE_KEY = (orgId) => `org.productLabelPrintSettings.${orgId}`;

export const DEFAULT_PRODUCT_LABEL_PRINT_SETTINGS = {
  labelSizeId: "58x40",
  customWidthMm: 58,
  customHeightMm: 40,
  dpiMode: "203",
  showSalePrice: true,
  showUpcText: true,
  printerNote: "",
};

export const getProductLabelPrintSettings = (organizationId) => {
  if (!organizationId) return { ...DEFAULT_PRODUCT_LABEL_PRINT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY(organizationId));
    if (!raw) return { ...DEFAULT_PRODUCT_LABEL_PRINT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PRODUCT_LABEL_PRINT_SETTINGS };
    return { ...DEFAULT_PRODUCT_LABEL_PRINT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_PRODUCT_LABEL_PRINT_SETTINGS };
  }
};

export const saveProductLabelPrintSettings = (organizationId, partial) => {
  if (!organizationId) return { ...DEFAULT_PRODUCT_LABEL_PRINT_SETTINGS };
  const next = { ...getProductLabelPrintSettings(organizationId), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY(organizationId), JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
};

export const getLabelSizePreset = (labelSizeId) =>
  LABEL_SIZE_PRESETS[labelSizeId] || LABEL_SIZE_PRESETS["58x40"];

export const getResolvedProductLabelLayout = (organizationId) => {
  const settings = getProductLabelPrintSettings(organizationId);
  const preset = getLabelSizePreset(settings.labelSizeId);
  const isCustom = settings.labelSizeId === "custom";
  const widthMm = isCustom
    ? Math.min(200, Math.max(20, Number(settings.customWidthMm) || preset.widthMm))
    : preset.widthMm;
  const heightMm = isCustom
    ? Math.min(300, Math.max(15, Number(settings.customHeightMm) || preset.heightMm))
    : preset.heightMm;
  const dpiScale = settings.dpiMode === "300" ? 1.15 : 1;

  return {
    settings,
    preset,
    widthMm,
    heightMm,
    nameFontPt: preset.nameFontPt,
    priceFontPt: preset.priceFontPt,
    codeFontPt: preset.codeFontPt,
    barcodeScale: preset.barcodeScale * dpiScale,
    previewScale: 2.2,
  };
};
