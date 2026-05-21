import { useCallback, useState } from "react";
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

  if (!sale || !layout) return null;

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Чек продажи"
    >
      <div className="bg-white rounded-2xl shadow-soft w-full max-w-md p-6 space-y-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-primary">Чек продажи</h2>
          <p className="text-xs text-muted mt-1">
            {layout.preset.label} · № {sale.sale_number}
          </p>
        </div>

        <div
          className="mx-auto rounded-xl border border-border bg-gradient-to-b from-secondary/40 to-white p-4 overflow-hidden flex justify-center"
          aria-label="Предпросмотр чека"
        >
          <div
            className="thermal-receipt-ticket bg-white text-black leading-tight shadow-md ring-1 ring-black/5 rounded-sm px-2 py-3"
            style={getThermalReceiptPreviewStyle(layout)}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>

        <p className="text-xs text-center text-muted tabular-nums">
          {formatDateTime(sale.created_at)} · итого{" "}
          <span className="font-semibold text-primary">{formatMoney(sale.total_amount)} UZS</span>
        </p>

        {actionError ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
            {actionError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
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

      <style>{THERMAL_RECEIPT_COMPONENT_CSS}</style>
    </div>
  );
};

export default POSReceiptModal;
