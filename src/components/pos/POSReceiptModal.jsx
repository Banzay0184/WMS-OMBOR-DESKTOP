import { useCallback, useMemo, useState } from "react";
import { formatDateTime, formatMoney } from "./posApi";
import {
  buildReceiptPdfFilename,
  buildThermalReceiptHtml,
  downloadThermalReceiptPdf,
  getThermalReceiptPreviewStyle,
  printSaleReceipt,
  THERMAL_RECEIPT_COMPONENT_CSS,
} from "./receiptPdf";
import { getResolvedReceiptLayout } from "./receiptPrintSettings";

const POSReceiptModal = ({ sale, storeName, organizationId, onClose }) => {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const layout = sale ? getResolvedReceiptLayout(organizationId) : null;
  const previewHtml =
    sale && layout
      ? buildThermalReceiptHtml({ sale, storeName, organizationId })
      : "";

  const previewStyle = useMemo(() => {
    if (!layout) return null;
    const base = getThermalReceiptPreviewStyle(layout);
    return {
      ...base,
      width: "100%",
      maxWidth: `${Math.min(layout.previewWidthPx, 300)}px`,
    };
  }, [layout]);

  const handleDownloadPdf = useCallback(async () => {
    if (!sale) return;
    setActionError("");
    setPdfLoading(true);
    try {
      await downloadThermalReceiptPdf(
        sale,
        storeName,
        organizationId,
        buildReceiptPdfFilename(sale.sale_number)
      );
    } catch (err) {
      setActionError(err.message || "Не удалось сформировать PDF");
    } finally {
      setPdfLoading(false);
    }
  }, [sale, storeName, organizationId]);

  const handlePrint = useCallback(() => {
    if (!sale) return;
    setActionError("");
    printSaleReceipt({ sale, storeName, organizationId }).catch((err) => {
      setActionError(err.message || "Не удалось открыть печать");
    });
  }, [sale, storeName, organizationId]);

  if (!sale || !layout || !previewStyle) return null;

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Чек продажи"
    >
      <div className="bg-white rounded-2xl shadow-soft w-full max-w-md my-auto max-h-[calc(100vh-1.5rem)] flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-4 sm:px-6 pt-5 pb-3 text-center border-b border-border">
          <h2 className="text-lg font-semibold text-primary">Чек продажи</h2>
          <p className="text-xs text-muted mt-1">
            {layout.preset.label} · № {sale.sale_number}
          </p>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-3"
          aria-label="Предпросмотр чека"
        >
          <div className="rounded-xl border border-border bg-gradient-to-b from-secondary/40 to-white p-3 flex justify-center">
            <div
              className="thermal-receipt-ticket bg-white text-black leading-tight shadow-md ring-1 ring-black/5 rounded-sm px-2 py-3"
              style={previewStyle}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>

        <div className="flex-shrink-0 px-4 sm:px-6 pb-5 pt-3 space-y-3 border-t border-border bg-white">
          <p className="text-xs text-center text-muted tabular-nums">
            {formatDateTime(sale.created_at)} · итого{" "}
            <span className="font-semibold text-primary">{formatMoney(sale.total_amount)} UZS</span>
          </p>

          {actionError ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {actionError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                tabIndex={0}
                aria-label="Скачать чек в PDF"
                className="px-4 py-2 rounded-lg border border-border text-muted text-sm hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                {pdfLoading ? "Формирование…" : "Скачать чек"}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                tabIndex={0}
                aria-label="Распечатать чек"
                className="px-4 py-2 rounded-lg border border-border text-muted text-sm hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                Печать
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              tabIndex={0}
              aria-label="Закрыть чек"
              className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              Готово
            </button>
          </div>
        </div>
      </div>

      <style>{THERMAL_RECEIPT_COMPONENT_CSS}</style>
    </div>
  );
};

export default POSReceiptModal;
