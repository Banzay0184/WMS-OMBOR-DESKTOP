import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  getBluetoothDeviceName,
  isBluetoothConnected,
  isBluetoothSupported,
  isBluetoothUserCancelled,
  normalizeBluetoothError,
  printBluetoothTestPage,
} from "./bluetoothPrinter";
import {
  buildSampleSaleForPreview,
  buildThermalReceiptHtml,
  getThermalReceiptPreviewStyle,
  printSaleReceipt,
  printThermalReceipt,
  THERMAL_RECEIPT_COMPONENT_CSS,
} from "./receiptPdf";
import {
  PRINT_MODE_OPTIONS,
  RECEIPT_DPI_OPTIONS,
  RECEIPT_DOCUMENT_TYPES,
  RECEIPT_FONT_SIZE_OPTIONS,
  RECEIPT_LAYOUT_OPTIONS,
  RECEIPT_SIZE_PRESETS,
  getReceiptPrintSettings,
  getResolvedReceiptLayout,
  saveReceiptPrintSettings,
} from "./receiptPrintSettings";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const LABEL_CLASS = "block text-sm font-medium text-muted mb-1.5";

const STATUS_CLASS = {
  disconnected: "bg-red-50 border-red-200 text-red-800",
  connected: "bg-emerald-50 border-emerald-200 text-emerald-800",
  connecting: "bg-amber-50 border-amber-200 text-amber-900",
};

const POSPrinterSettings = () => {
  const { organizationId, overview } = useOutletContext();
  const storeName = overview?.organization?.name || "Магазин";
  const btSupported = isBluetoothSupported();

  const [settings, setSettings] = useState(() => getReceiptPrintSettings(organizationId));
  const [savedHint, setSavedHint] = useState("");
  const [printError, setPrintError] = useState("");
  const [printInfo, setPrintInfo] = useState("");
  const [testPrinting, setTestPrinting] = useState(false);
  const [btStatus, setBtStatus] = useState(() =>
    isBluetoothConnected() ? "connected" : "disconnected"
  );
  const [btDeviceName, setBtDeviceName] = useState(() => getBluetoothDeviceName());
  const [btBusy, setBtBusy] = useState(false);

  useEffect(() => {
    setSettings(getReceiptPrintSettings(organizationId));
    setBtStatus(isBluetoothConnected() ? "connected" : "disconnected");
    setBtDeviceName(getBluetoothDeviceName());
  }, [organizationId]);

  const layout = useMemo(
    () => getResolvedReceiptLayout(organizationId),
    [organizationId, settings]
  );

  const sampleSale = useMemo(() => buildSampleSaleForPreview(), []);
  const previewHtml = useMemo(
    () => buildThermalReceiptHtml({ sale: sampleSale, storeName, organizationId }),
    [sampleSale, storeName, organizationId, settings]
  );

  const handleChange = useCallback(
    (partial) => {
      const next = saveReceiptPrintSettings(organizationId, partial);
      setSettings(next);
      setSavedHint("Сохранено");
      setTimeout(() => setSavedHint(""), 2000);
    },
    [organizationId]
  );

  const refreshBtState = useCallback(() => {
    setBtStatus(isBluetoothConnected() ? "connected" : "disconnected");
    setBtDeviceName(getBluetoothDeviceName());
  }, []);

  const handleConnectBluetooth = async () => {
    setPrintError("");
    setPrintInfo("");
    setBtBusy(true);
    setBtStatus("connecting");
    try {
      const name = await connectBluetoothPrinter();
      setBtDeviceName(name);
      setBtStatus("connected");
    } catch (err) {
      setBtStatus("disconnected");
      const normalized = normalizeBluetoothError(err);
      if (isBluetoothUserCancelled(normalized)) {
        setPrintInfo("Выбор устройства отменён — нажмите «Подключить Bluetooth» снова, когда будете готовы.");
        return;
      }
      setPrintError(normalized.message || "Не удалось подключить принтер");
    } finally {
      setBtBusy(false);
    }
  };

  const handleDisconnectBluetooth = async () => {
    setPrintError("");
    setBtBusy(true);
    try {
      await disconnectBluetoothPrinter();
    } catch (err) {
      setPrintError(err.message || "Ошибка отключения");
    } finally {
      refreshBtState();
      setBtBusy(false);
    }
  };

  const handleTestPrint = async () => {
    setPrintError("");
    setTestPrinting(true);
    try {
      await printThermalReceipt({
        sale: sampleSale,
        storeName,
        organizationId,
      });
    } catch (err) {
      setPrintError(err.message || "Не удалось выполнить печать");
    } finally {
      setTestPrinting(false);
    }
  };

  const handleBluetoothTestPrint = async () => {
    setPrintError("");
    setTestPrinting(true);
    try {
      await printBluetoothTestPage();
    } catch (err) {
      setPrintError(err.message || "Не удалось выполнить тест Bluetooth");
    } finally {
      setTestPrinting(false);
    }
  };

  const handleTestSalePrint = async () => {
    setPrintError("");
    setTestPrinting(true);
    try {
      await printSaleReceipt({
        sale: sampleSale,
        storeName,
        organizationId,
      });
    } catch (err) {
      setPrintError(err.message || "Не удалось напечатать чек");
    } finally {
      setTestPrinting(false);
    }
  };

  const selectedPreset = RECEIPT_SIZE_PRESETS[settings.paperSizeId] || RECEIPT_SIZE_PRESETS["50"];
  const selectedLayout =
    RECEIPT_LAYOUT_OPTIONS.find((opt) => opt.id === settings.receiptLayoutId) ||
    RECEIPT_LAYOUT_OPTIONS.find((opt) => opt.id === "table");
  const isBluetoothMode = settings.printMode === "bluetooth";

  const statusLabel =
    btStatus === "connected"
      ? "Принтер подключён"
      : btStatus === "connecting"
        ? "Подключение…"
        : "Принтер не подключён";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">Настройки принтера</h1>
        <p className="text-sm text-muted mt-1">
          Системная печать через ОС или прямой вывод на Bluetooth-термопринтер (ESC/POS).
        </p>
      </div>

      <section className="rounded-xl bg-white border border-border shadow-soft p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-primary mb-3">Способ печати</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRINT_MODE_OPTIONS.map((mode) => {
              const selected = settings.printMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleChange({ printMode: mode.id })}
                  aria-pressed={selected}
                  aria-label={`Режим: ${mode.label}`}
                  tabIndex={0}
                  className={
                    "text-left rounded-xl border p-4 transition focus:outline-none focus:ring-2 focus:ring-primary/40 " +
                    (selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50")
                  }
                >
                  <div className="font-semibold text-primary">{mode.label}</div>
                  <p className="text-xs text-muted mt-1">{mode.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {isBluetoothMode ? (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="rounded-lg bg-secondary/50 border border-border p-4 text-sm text-muted">
              <p className="font-medium text-primary mb-2">Требования Web Bluetooth</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Chrome или Edge (Android / Desktop)</li>
                <li>HTTPS или localhost</li>
                <li>Включённый Bluetooth и питание принтера</li>
                <li>Термопринтеры: RPP02N, MTP-II, Zjiang и аналоги</li>
              </ul>
              {!btSupported ? (
                <p className="text-xs text-red-600 mt-2" role="alert">
                  В этом браузере Web Bluetooth недоступен. Используйте Chrome/Edge.
                </p>
              ) : null}
            </div>

            <div
              className={`rounded-lg border px-4 py-3 text-sm font-medium ${STATUS_CLASS[btStatus]}`}
              role="status"
            >
              {btStatus === "connected" ? "✓ " : btStatus === "connecting" ? "… " : "✕ "}
              {statusLabel}
            </div>

            {btStatus === "connected" && btDeviceName ? (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                Устройство: <span className="font-medium">{btDeviceName}</span>
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConnectBluetooth}
                disabled={!btSupported || btBusy || btStatus === "connected"}
                tabIndex={0}
                aria-label="Подключить Bluetooth-принтер"
                className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              >
                {btBusy && btStatus === "connecting" ? "Подключение…" : "Подключить Bluetooth"}
              </button>
              <button
                type="button"
                onClick={handleDisconnectBluetooth}
                disabled={btBusy || btStatus !== "connected"}
                tabIndex={0}
                aria-label="Отключить Bluetooth-принтер"
                className="px-4 py-2.5 rounded-lg border border-border text-muted text-sm font-medium hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              >
                Отключить
              </button>
              <button
                type="button"
                onClick={handleBluetoothTestPrint}
                disabled={testPrinting || btStatus !== "connected"}
                tabIndex={0}
                aria-label="Тестовая печать Bluetooth"
                className="px-4 py-2.5 rounded-lg border border-border text-muted text-sm font-medium hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              >
                Тест Bluetooth
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl bg-white border border-border shadow-soft p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-primary mb-3">Макет чека</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RECEIPT_LAYOUT_OPTIONS.map((layoutOpt) => {
              const selected = settings.receiptLayoutId === layoutOpt.id;
              return (
                <button
                  key={layoutOpt.id}
                  type="button"
                  onClick={() => handleChange({ receiptLayoutId: layoutOpt.id })}
                  aria-pressed={selected}
                  aria-label={`Макет: ${layoutOpt.label}`}
                  tabIndex={0}
                  className={
                    "text-left rounded-xl border p-4 transition focus:outline-none focus:ring-2 focus:ring-primary/40 " +
                    (selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50")
                  }
                >
                  <div className="font-semibold text-primary">{layoutOpt.label}</div>
                  <p className="text-xs text-muted mt-1">{layoutOpt.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="shop-inn" className={LABEL_CLASS}>
              ИНН магазина (в шапке чека)
            </label>
            <input
              id="shop-inn"
              type="text"
              value={settings.shopInn || ""}
              onChange={(e) => handleChange({ shopInn: e.target.value })}
              placeholder="123456789012"
              className={INPUT_CLASS}
              aria-label="ИНН организации"
            />
          </div>
          <div>
            <label htmlFor="receipt-footer" className={LABEL_CLASS}>
              Текст в конце чека
            </label>
            <textarea
              id="receipt-footer"
              value={settings.receiptFooter || ""}
              onChange={(e) => handleChange({ receiptFooter: e.target.value })}
              rows={3}
              className={INPUT_CLASS + " font-mono resize-y min-h-[80px]"}
              aria-label="Футер чека"
            />
          </div>
        </div>
        {settings.receiptLayoutId !== "list" ? (
          <p className="text-xs text-muted">
            В макете «Таблица» ниже футера автоматически печатаются реквизиты разработчика системы.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl bg-white border border-border shadow-soft p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-primary mb-3">Размер бумаги</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.values(RECEIPT_SIZE_PRESETS).map((preset) => {
              const selected = settings.paperSizeId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleChange({ paperSizeId: preset.id })}
                  aria-pressed={selected}
                  aria-label={`Выбрать размер ${preset.label}`}
                  tabIndex={0}
                  className={
                    "text-left rounded-xl border p-4 transition focus:outline-none focus:ring-2 focus:ring-primary/40 " +
                    (selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50")
                  }
                >
                  <div className="font-semibold text-primary">{preset.label}</div>
                  <p className="text-xs text-muted mt-1">{preset.description}</p>
                  <p className="text-xs text-muted mt-2 tabular-nums">
                    @page: {preset.paperWidthMm}mm auto · margin: 0
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="receipt-font-size" className={LABEL_CLASS}>
              Размер шрифта
            </label>
            <select
              id="receipt-font-size"
              value={settings.fontSizePt}
              onChange={(e) => handleChange({ fontSizePt: Number(e.target.value) })}
              className={INPUT_CLASS}
              aria-label="Размер шрифта чека"
            >
              {RECEIPT_FONT_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">Шрифт: Courier. Для макета «Таблица» лучше 11 pt.</p>
          </div>

          <div>
            <label htmlFor="receipt-dpi" className={LABEL_CLASS}>
              Плотность экрана (предпросмотр)
            </label>
            <select
              id="receipt-dpi"
              value={settings.dpiMode}
              onChange={(e) => handleChange({ dpiMode: e.target.value })}
              className={INPUT_CLASS}
              aria-label="DPI для предпросмотра"
            >
              {RECEIPT_DPI_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1 tabular-nums">
              Ширина предпросмотра: {layout.previewWidthPx} px
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="printer-note" className={LABEL_CLASS}>
            Примечание к принтеру (необязательно)
          </label>
          <input
            id="printer-note"
            type="text"
            value={settings.printerNote || ""}
            onChange={(e) => handleChange({ printerNote: e.target.value })}
            placeholder="Например: XP-58, USB, касса 1"
            className={INPUT_CLASS}
            aria-label="Примечание к принтеру"
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(settings.autoPrintOnSale)}
            onChange={(e) => handleChange({ autoPrintOnSale: e.target.checked })}
            className="mt-1 rounded border-border text-primary focus:ring-primary/40"
            aria-label="Автоматически печатать чек после оплаты"
          />
          <span>
            <span className="text-sm font-medium text-primary block">Печатать сразу после оплаты</span>
            <span className="text-xs text-muted">
              {isBluetoothMode
                ? "Чек уйдёт на подключённый Bluetooth-принтер (если не подключён — только модальное окно)."
                : "Откроется системный диалог печати."}
            </span>
          </span>
        </label>

        <div>
          <p className="text-xs font-medium text-muted mb-2">Типы документов с этими настройками</p>
          <ul className="flex flex-wrap gap-2">
            {RECEIPT_DOCUMENT_TYPES.map((doc) => (
              <li
                key={doc.id}
                className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted border border-border"
              >
                {doc.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
          <button
            type="button"
            onClick={handleTestPrint}
            disabled={testPrinting}
            tabIndex={0}
            aria-label="Тестовая печать"
            className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            {testPrinting ? "Печать…" : isBluetoothMode ? "Тест системной печати" : "Тестовая печать"}
          </button>
          {isBluetoothMode ? (
            <button
              type="button"
              onClick={handleTestSalePrint}
              disabled={testPrinting}
              tabIndex={0}
              aria-label="Печать примера чека продажи"
              className="px-4 py-2.5 rounded-lg border border-border text-muted text-sm font-medium hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            >
              Печать примера чека
            </button>
          ) : null}
          {savedHint ? (
            <span className="text-sm text-green-600" role="status">
              {savedHint}
            </span>
          ) : null}
          {printInfo ? (
            <span className="text-sm text-muted" role="status">
              {printInfo}
            </span>
          ) : null}
          {printError ? (
            <span className="text-sm text-red-600" role="alert">
              {printError}
            </span>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl bg-white border border-border shadow-soft p-5 sm:p-6">
        <h2 className="text-base font-semibold text-primary mb-3">Предпросмотр чека</h2>
        <p className="text-xs text-muted mb-4">
          {selectedPreset.label} · {selectedLayout?.label ?? "Таблица"} · Courier · {settings.fontSizePt} pt ·
          высота подстраивается под содержимое
        </p>
        <div className="flex justify-center rounded-xl border border-border bg-gradient-to-b from-secondary/40 to-white p-5 overflow-x-auto">
          <div
            className="thermal-receipt-ticket bg-white text-black leading-tight shadow-md ring-1 ring-black/5 rounded-sm px-2 py-3"
            style={getThermalReceiptPreviewStyle(layout)}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </section>

      <style>{THERMAL_RECEIPT_COMPONENT_CSS}</style>
    </div>
  );
};

export default POSPrinterSettings;
