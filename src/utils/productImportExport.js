const EXPORT_HEADERS = {
  name: "Наименование",
  ikpu_name: "Наименование по ИКПУ",
  ikpu_code: "ИКПУ",
  upc: "UPC",
  sale_price: "Розница",
  unit: "Ед. изм.",
};

const buildProductsExportRows = (products, { canUseInvoiceIkpu, canUseUpc }) => {
  return products.map((p) => {
    const row = { [EXPORT_HEADERS.name]: p.name || "" };
    if (canUseInvoiceIkpu) {
      row[EXPORT_HEADERS.ikpu_name] = p.ikpu_name || "";
      row[EXPORT_HEADERS.ikpu_code] = p.ikpu_code || "";
    }
    if (canUseUpc) {
      row[EXPORT_HEADERS.upc] = p.upc || "";
      row[EXPORT_HEADERS.sale_price] =
        p.sale_price != null && Number(p.sale_price) > 0 ? Number(p.sale_price) : "";
    }
    row[EXPORT_HEADERS.unit] = (p.unit || "шт").trim() || "шт";
    return row;
  });
};

/** Экспортирует товары в .xlsx (лениво подгружает библиотеку — как парсинг маркировки в приходе). */
export const exportProductsToXlsx = async (products, tariffFlags, filenamePrefix = "tovary") => {
  const XLSX = await import("xlsx");
  const rows = buildProductsExportRows(products, tariffFlags);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Товары");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}-${stamp}.xlsx`);
};

const pickField = (row, ...keys) => {
  const normalizedKeys = keys.map((k) => k.toLowerCase());
  for (const k of Object.keys(row)) {
    if (normalizedKeys.includes(k.trim().toLowerCase())) {
      const v = row[k];
      return v == null ? "" : String(v).trim();
    }
  }
  return "";
};

const mapImportRow = (row) => ({
  name: pickField(row, "Наименование", "Наше наименование", "name"),
  ikpu_name: pickField(row, "Наименование по ИКПУ", "ikpu_name"),
  ikpu_code: pickField(row, "ИКПУ", "ikpu_code"),
  upc: pickField(row, "UPC", "upc"),
  unit: pickField(row, "Ед. изм.", "Ед.изм.", "unit") || "шт",
  sale_price: pickField(row, "Розница", "sale_price", "Цена", "цена"),
});

/**
 * Парсит .xlsx/.csv в список товаров ({name, ikpu_name, ikpu_code, upc, unit, sale_price}).
 * Строки без наименования отбрасываются. Формат колонки .xlsx — как в parseMarkingCodesFromXlsxBuffer
 * (WarehouseReceipt.jsx): та же библиотека, тот же способ чтения файла.
 */
export const parseProductsImportFile = async (file) => {
  const nameLower = file.name.toLowerCase();
  const isXlsx = nameLower.endsWith(".xlsx") || file.type.includes("spreadsheetml");

  const raw = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.onload = () => resolve(reader.result);
    if (isXlsx) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  });

  const XLSX = await import("xlsx");
  const wb = isXlsx ? XLSX.read(raw, { type: "array" }) : XLSX.read(raw, { type: "string" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows.map(mapImportRow).filter((r) => r.name);
};
