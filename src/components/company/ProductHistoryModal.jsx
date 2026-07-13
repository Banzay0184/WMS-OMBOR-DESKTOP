import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../../api/client";
import { useModalDismiss } from "../../utils/useModalDismiss";

const FIELD_LABELS = {
  name: "Наименование",
  ikpu_name: "Наименование по ИКПУ",
  ikpu_code: "ИКПУ",
  upc: "UPC",
  unit: "Ед. изм.",
};

const SOURCE_LABELS = {
  manual: "Вручную",
  invoice: "Приход по накладной",
};

const moneyFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });

const formatEntry = (entry) => {
  if (entry.type === "price") {
    return {
      field: "Розничная цена",
      before: entry.old_price != null ? `${moneyFmt.format(Number(entry.old_price))} UZS` : "—",
      after: entry.new_price != null ? `${moneyFmt.format(Number(entry.new_price))} UZS` : "—",
      source: SOURCE_LABELS[entry.source] || entry.source,
    };
  }
  return {
    field: FIELD_LABELS[entry.field] || entry.field,
    before: entry.old_value?.trim() ? entry.old_value : "—",
    after: entry.new_value?.trim() ? entry.new_value : "—",
    source: "Вручную",
  };
};

/** Объединённая лента истории изменений товара (цена + критичные поля). Только чтение. */
const ProductHistoryModal = ({ product, organizationId, onClose }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!product || !organizationId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/products/${product.id}/history/`);
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        setError(data.detail ?? "Не удалось загрузить историю.");
        setEntries([]);
        return;
      }
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [product, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const modalA11y = useModalDismiss(onClose, { active: true });

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-history-title"
      onMouseDown={modalA11y.onBackdropMouseDown}
    >
      <div
        ref={modalA11y.dialogRef}
        tabIndex={-1}
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-5 sm:p-6 max-h-[85vh] overflow-y-auto focus:outline-none"
      >
        <h2 id="product-history-title" className="text-lg font-medium text-muted mb-1">
          История изменений
        </h2>
        <p className="text-sm text-muted/80 mb-4">{product?.name || "Товар"}</p>

        {loading ? <p className="text-muted text-sm">Загрузка…</p> : null}
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error && entries.length === 0 ? (
          <p className="text-muted text-sm">Изменений пока не было.</p>
        ) : null}

        {!loading && entries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-3 py-2 font-medium text-muted whitespace-nowrap">Дата</th>
                  <th className="px-3 py-2 font-medium text-muted">Поле</th>
                  <th className="px-3 py-2 font-medium text-muted">Было</th>
                  <th className="px-3 py-2 font-medium text-muted">Стало</th>
                  <th className="px-3 py-2 font-medium text-muted">Кто</th>
                  <th className="px-3 py-2 font-medium text-muted">Источник</th>
                  <th className="px-3 py-2 font-medium text-muted">Причина</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const row = formatEntry(entry);
                  return (
                    <tr key={`${entry.type}-${entry.id}`} className="border-b border-border">
                      <td className="px-3 py-2 text-muted whitespace-nowrap">
                        {dateFmt.format(new Date(entry.created_at))}
                      </td>
                      <td className="px-3 py-2 text-muted">{row.field}</td>
                      <td className="px-3 py-2 text-muted">{row.before}</td>
                      <td className="px-3 py-2 text-muted">{row.after}</td>
                      <td className="px-3 py-2 text-muted">{entry.changed_by_name || "—"}</td>
                      <td className="px-3 py-2 text-muted">{row.source}</td>
                      <td className="px-3 py-2 text-muted">{entry.reason || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductHistoryModal;
