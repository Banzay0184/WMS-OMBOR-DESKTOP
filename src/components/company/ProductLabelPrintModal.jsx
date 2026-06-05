import { useCallback, useEffect, useState } from "react";
import {
  buildProductLabelDocument,
  getProductLabelPreviewBoxStyle,
  normalizeUpcDigits,
  printProductLabel,
} from "../../utils/productLabelPrint";
import { getResolvedProductLabelLayout } from "../../utils/productLabelPrintSettings";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
const LABEL_CLASS = "block text-sm font-medium text-muted mb-1.5";

const moneyFmt = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const ProductLabelPrintModal = ({ product, organizationId, onClose }) => {
  const [copies, setCopies] = useState(1);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(true);
  const [printLoading, setPrintLoading] = useState(false);
  const [error, setError] = useState("");

  const layout = getResolvedProductLabelLayout(organizationId);
  const upcDigits = normalizeUpcDigits(product?.upc);
  const salePrice =
    product?.sale_price != null && Number.isFinite(Number(product.sale_price)) && Number(product.sale_price) > 0
      ? Number(product.sale_price)
      : null;

  const loadPreview = useCallback(async () => {
    if (!product || !organizationId || !upcDigits) {
      setPreviewHtml("");
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setError("");
    try {
      const { html } = await buildProductLabelDocument({
        product,
        organizationId,
        copies: 1,
      });
      setPreviewHtml(html);
    } catch (err) {
      setError(err.message ?? "Не удалось подготовить предпросмотр.");
      setPreviewHtml("");
    } finally {
      setPreviewLoading(false);
    }
  }, [product, organizationId, upcDigits]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview, layout.widthMm, layout.heightMm, layout.settings]);

  const handlePrint = async () => {
    if (!product || !organizationId) return;
    setPrintLoading(true);
    setError("");
    try {
      await printProductLabel({ product, organizationId, copies });
      onClose?.();
    } catch (err) {
      setError(err.message ?? "Ошибка печати");
    } finally {
      setPrintLoading(false);
    }
  };

  const previewBoxStyle = getProductLabelPreviewBoxStyle(layout);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-label-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
        <h2 id="print-label-title" className="text-lg font-medium text-muted mb-2">
          Печать этикетки
        </h2>
        <p className="text-sm text-muted mb-1">
          <span className="font-medium">{product?.name || "Товар"}</span>
        </p>
        <p className="text-sm text-muted/80 font-mono mb-4">UPC: {upcDigits || "—"}</p>

        {!upcDigits ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4" role="alert">
            У товара нет UPC. Укажите код в карточке товара, затем повторите печать.
          </p>
        ) : null}

        <div className="mb-4 flex justify-center">
          <div
            className="border border-dashed border-border rounded-lg bg-neutral-50 overflow-hidden relative"
            style={previewBoxStyle}
            aria-label="Предпросмотр этикетки"
          >
            {previewLoading ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">Загрузка…</div>
            ) : null}
            {!previewLoading && previewHtml ? (
              <iframe
                title="Предпросмотр этикетки"
                srcDoc={previewHtml}
                className="border-0 bg-white pointer-events-none"
                style={{
                  width: `${layout.widthMm}mm`,
                  height: `${layout.heightMm}mm`,
                  transform: `scale(${layout.previewScale})`,
                  transformOrigin: "top left",
                }}
              />
            ) : null}
            {!previewLoading && !previewHtml ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">Нет предпросмотра</div>
            ) : null}
          </div>
        </div>

        <p className="text-xs text-muted/70 text-center mb-4">
          Формат: {layout.widthMm} × {layout.heightMm} мм
          {salePrice != null ? ` · розница ${moneyFmt.format(salePrice)} UZS` : ""}
        </p>

        <div className="mb-4 max-w-[8rem]">
          <label htmlFor="label-copies" className={LABEL_CLASS}>
            Количество
          </label>
          <input
            id="label-copies"
            type="number"
            min={1}
            max={99}
            value={copies}
            onChange={(e) => setCopies(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
            className={INPUT_CLASS}
            aria-label="Количество этикеток"
            disabled={!upcDigits || printLoading}
          />
        </div>

        {error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!upcDigits || printLoading || previewLoading}
            className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition disabled:opacity-50"
          >
            {printLoading ? "Печать…" : "Печать"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={printLoading}
            className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary transition disabled:opacity-50"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductLabelPrintModal;
