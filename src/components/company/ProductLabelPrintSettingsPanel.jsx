import { useCallback, useState } from "react";
import {
  DEFAULT_PRODUCT_LABEL_PRINT_SETTINGS,
  LABEL_DPI_OPTIONS,
  LABEL_SIZE_PRESETS,
  getProductLabelPrintSettings,
  getResolvedProductLabelLayout,
  saveProductLabelPrintSettings,
} from "../../utils/productLabelPrintSettings";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
const LABEL_CLASS = "block text-sm font-medium text-muted mb-1.5";

const ProductLabelPrintSettingsPanel = ({ organizationId, onSettingsChange }) => {
  const [settings, setSettings] = useState(() => getProductLabelPrintSettings(organizationId));
  const [savedHint, setSavedHint] = useState("");

  const layout = getResolvedProductLabelLayout(organizationId);
  const isCustom = settings.labelSizeId === "custom";

  const handleChange = useCallback(
    (partial) => {
      const next = saveProductLabelPrintSettings(organizationId, partial);
      setSettings(next);
      onSettingsChange?.(next);
      setSavedHint("Сохранено");
      setTimeout(() => setSavedHint(""), 2000);
    },
    [organizationId, onSettingsChange]
  );

  const handleReset = () => {
    const next = saveProductLabelPrintSettings(organizationId, { ...DEFAULT_PRODUCT_LABEL_PRINT_SETTINGS });
    setSettings(next);
    onSettingsChange?.(next);
    setSavedHint("Сброшено");
    setTimeout(() => setSavedHint(""), 2000);
  };

  return (
    <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-muted">Печать этикеток</h2>
          <p className="text-sm text-muted/80 mt-1">
            Размер этикетки, отображение цены и UPC. Настройки сохраняются в этом браузере для организации.
          </p>
        </div>
        {savedHint ? (
          <span className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5" role="status">
            {savedHint}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="label-size-preset" className={LABEL_CLASS}>
            Размер этикетки
          </label>
          <select
            id="label-size-preset"
            value={settings.labelSizeId}
            onChange={(e) => handleChange({ labelSizeId: e.target.value })}
            className={`${INPUT_CLASS} input-select`}
            aria-label="Размер этикетки"
          >
            {Object.values(LABEL_SIZE_PRESETS).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted/75 mt-1">
            {(LABEL_SIZE_PRESETS[settings.labelSizeId] || LABEL_SIZE_PRESETS["58x40"]).description}
          </p>
        </div>

        <div>
          <label htmlFor="label-dpi" className={LABEL_CLASS}>
            Разрешение (DPI)
          </label>
          <select
            id="label-dpi"
            value={settings.dpiMode}
            onChange={(e) => handleChange({ dpiMode: e.target.value })}
            className={`${INPUT_CLASS} input-select`}
            aria-label="Разрешение печати"
          >
            {LABEL_DPI_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isCustom ? (
        <div className="grid gap-4 sm:grid-cols-2 max-w-md">
          <div>
            <label htmlFor="label-custom-width" className={LABEL_CLASS}>
              Ширина, мм
            </label>
            <input
              id="label-custom-width"
              type="number"
              min={20}
              max={200}
              step={1}
              value={settings.customWidthMm}
              onChange={(e) => handleChange({ customWidthMm: Number(e.target.value) })}
              className={INPUT_CLASS}
              aria-label="Ширина этикетки в миллиметрах"
            />
          </div>
          <div>
            <label htmlFor="label-custom-height" className={LABEL_CLASS}>
              Высота, мм
            </label>
            <input
              id="label-custom-height"
              type="number"
              min={15}
              max={300}
              step={1}
              value={settings.customHeightMm}
              onChange={(e) => handleChange({ customHeightMm: Number(e.target.value) })}
              className={INPUT_CLASS}
              aria-label="Высота этикетки в миллиметрах"
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="inline-flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showSalePrice === true}
            onChange={(e) => handleChange({ showSalePrice: e.target.checked })}
            className="rounded border-border text-primary focus:ring-primary"
          />
          Показывать розничную цену
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showUpcText === true}
            onChange={(e) => handleChange({ showUpcText: e.target.checked })}
            className="rounded border-border text-primary focus:ring-primary"
          />
          Показывать цифры UPC под штрих-кодом
        </label>
      </div>

      <div>
        <label htmlFor="label-printer-note" className={LABEL_CLASS}>
          Примечание к принтеру (необязательно)
        </label>
        <input
          id="label-printer-note"
          type="text"
          value={settings.printerNote ?? ""}
          onChange={(e) => handleChange({ printerNote: e.target.value })}
          className={INPUT_CLASS}
          placeholder="Например: Xprinter XP-365B, лента 58 мм"
          aria-label="Примечание к принтеру"
        />
      </div>

      <p className="text-xs text-muted/70">
        Текущий формат: <strong>{layout.widthMm} × {layout.heightMm} мм</strong>. Для термопринтеров 58 мм обычно
        подходят 58×30 и 58×40. В диалоге печати ОС выберите нужный принтер и при необходимости уточните поля.
      </p>

      <button
        type="button"
        onClick={handleReset}
        className="text-sm px-3 py-2 rounded-lg border border-border text-muted hover:bg-secondary transition"
      >
        Сбросить настройки
      </button>
    </section>
  );
};

export default ProductLabelPrintSettingsPanel;
