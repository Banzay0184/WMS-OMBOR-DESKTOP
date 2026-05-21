import { useCallback, useEffect, useState } from "react";
import { formatDate, formatMoney, posApi } from "./posApi";

const formatDelta = (delta) => {
  if (delta == null || delta === "") return null;
  const num = Number(delta);
  if (!Number.isFinite(num) || num === 0) return null;
  const sign = num > 0 ? "+" : "";
  return `${sign}${formatMoney(num)}`;
};

const DeltaBadge = ({ delta }) => {
  const text = formatDelta(delta);
  if (!text) return null;
  const num = Number(delta);
  const cls =
    num > 0
      ? "text-amber-700 bg-amber-50"
      : "text-emerald-700 bg-emerald-50";
  return (
    <span className={`ml-1 px-1 py-0.5 rounded text-[10px] font-medium tabular-nums ${cls}`}>
      {text}
    </span>
  );
};

const POSProductCostHistory = ({ organizationId, warehouseId, product, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const loadHistory = useCallback(async () => {
    if (!organizationId || !product?.id) return;
    setLoading(true);
    setError("");
    try {
      const res = await posApi.getProductCostHistory(organizationId, product.id, { warehouseId });
      setData(res);
    } catch (err) {
      setError(err.message || "Ошибка загрузки");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId, warehouseId, product?.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") onClose();
  };

  const history = Array.isArray(data?.history) ? data.history : [];
  const productName = data?.product?.name || product?.name || "Товар";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`История прихода: ${productName}`}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted/70">Секретно · история прихода</p>
            <h2 className="text-sm font-semibold text-primary truncate" title={productName}>
              {productName}
            </h2>
            {data?.product?.current_sale_price ? (
              <p className="text-[11px] text-muted mt-0.5 tabular-nums">
                Сейчас в кассе: {formatMoney(data.product.current_sale_price)} UZS
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            tabIndex={0}
            className="shrink-0 w-8 h-8 rounded-lg text-muted hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            ×
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-3 py-2">
          {loading ? (
            <p className="text-xs text-muted py-4 text-center">Загрузка…</p>
          ) : error ? (
            <p className="text-xs text-red-600 py-4 text-center">{error}</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted py-4 text-center">Нет утверждённых приходов по этому товару.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((row) => (
                <li
                  key={`${row.invoice_id}-${row.date}-${row.purchase_price}`}
                  className="rounded-lg border border-border/70 bg-secondary/30 px-2.5 py-2 text-[11px] leading-snug text-muted"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-primary tabular-nums">
                      {formatDate(row.date || row.datetime)}
                    </span>
                    <span className="text-[10px] text-muted/80 shrink-0">
                      {row.quantity} шт
                      {row.invoice_number ? ` · ${row.invoice_number}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 tabular-nums">
                    <span className="text-muted/90">Закуп:</span>{" "}
                    <span className="font-semibold text-primary">{formatMoney(row.purchase_price)}</span>
                    <DeltaBadge delta={row.purchase_price_delta} />
                  </div>
                  <div className="tabular-nums">
                    <span className="text-muted/90">Продажа:</span>{" "}
                    {row.sale_price ? (
                      <>
                        <span className="font-semibold text-primary">{formatMoney(row.sale_price)}</span>
                        <DeltaBadge delta={row.sale_price_delta} />
                      </>
                    ) : (
                      <span className="text-muted/70">—</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border bg-secondary/20">
          <p className="text-[10px] text-muted/70 text-center">
            Удерживайте фото товара ~0.6 сек, чтобы открыть снова
          </p>
        </div>
      </div>
    </div>
  );
};

export default POSProductCostHistory;
