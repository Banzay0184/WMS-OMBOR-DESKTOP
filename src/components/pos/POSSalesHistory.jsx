import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import POSReceiptModal from "./POSReceiptModal";
import {
  PAYMENT_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  formatDateTime,
  formatMoney,
  posApi,
} from "./posApi";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const ReturnModal = ({ sale, onClose, onSuccess }) => {
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sale) {
      const init = {};
      sale.items.forEach((it) => {
        init[it.id] = 0;
      });
      setQuantities(init);
      setReason("");
      setError("");
    }
  }, [sale]);

  if (!sale) return null;

  const handleQtyChange = (itemId, value, max) => {
    const n = Math.max(0, Math.min(Number(value) || 0, max));
    setQuantities((p) => ({ ...p, [itemId]: n }));
  };

  const linesToReturn = sale.items
    .map((it) => ({
      sale_item_id: it.id,
      quantity: Number(quantities[it.id] || 0),
      maxRemaining: it.quantity - (it.refunded_quantity || 0),
      name: it.name_snapshot,
      unit_price: Number(it.unit_price),
    }))
    .filter((ln) => ln.quantity > 0);

  const totalRefund = linesToReturn.reduce(
    (s, ln) => s + ln.quantity * ln.unit_price,
    0
  );

  const handleSubmit = async () => {
    if (linesToReturn.length === 0) {
      setError("Укажите количество хотя бы для одной позиции.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSuccess({
        sale_id: sale.id,
        reason: reason.trim(),
        lines: linesToReturn.map((ln) => ({
          sale_item_id: ln.sale_item_id,
          quantity: ln.quantity,
        })),
      });
      onClose();
    } catch (err) {
      setError(err.message || "Не удалось оформить возврат");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Возврат по чеку ${sale.sale_number}`}
    >
      <div className="bg-white rounded-2xl shadow-soft w-full max-w-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-primary">Возврат по чеку № {sale.sale_number}</h2>
          <p className="text-sm text-muted">{formatDateTime(sale.created_at)}</p>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted">
              <tr>
                <th className="text-left px-3 py-2">Товар</th>
                <th className="text-right px-3 py-2">Куплено</th>
                <th className="text-right px-3 py-2">Уже возвращено</th>
                <th className="text-right px-3 py-2">К возврату</th>
                <th className="text-right px-3 py-2">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((it) => {
                const remaining = it.quantity - (it.refunded_quantity || 0);
                return (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-2 text-primary">{it.name_snapshot}</td>
                    <td className="px-3 py-2 text-right">{it.quantity}</td>
                    <td className="px-3 py-2 text-right">{it.refunded_quantity || 0}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        value={quantities[it.id] ?? 0}
                        onChange={(e) => handleQtyChange(it.id, e.target.value, remaining)}
                        disabled={remaining === 0}
                        aria-label={`Количество к возврату для ${it.name_snapshot}`}
                        className="w-20 text-right px-2 py-1 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {formatMoney(Number(quantities[it.id] || 0) * Number(it.unit_price))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <input
          type="text"
          placeholder="Причина возврата (необязательно)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Причина возврата"
          className={INPUT_CLASS}
        />

        {error ? (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-2">{error}</div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="text-sm text-muted">
            Сумма возврата: <span className="font-semibold text-primary">{formatMoney(totalRefund)} UZS</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              tabIndex={0}
              aria-label="Отмена"
              className="px-4 py-2 rounded-lg border border-border text-muted text-sm hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || linesToReturn.length === 0}
              tabIndex={0}
              aria-label="Оформить возврат"
              className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            >
              {submitting ? "Сохранение…" : "Оформить возврат"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const POSSalesHistory = () => {
  const { organizationId, warehouseId, reloadOverview, permissions, overview } = useOutletContext();
  const storeName = overview?.organization?.name || "Магазин";
  const canRefund = Boolean(permissions?.can_refund);

  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [returnSale, setReturnSale] = useState(null);
  const [receiptSale, setReceiptSale] = useState(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await posApi.listSales(organizationId, {
        warehouse_id: warehouseId,
        status: statusFilter || undefined,
        payment_type: paymentFilter || undefined,
      });
      setSales(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить чеки");
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, warehouseId, statusFilter, paymentFilter]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const handleOpenSale = async (saleId, target) => {
    try {
      const full = await posApi.getSale(organizationId, saleId);
      if (target === "return") setReturnSale(full);
      else setReceiptSale(full);
    } catch (err) {
      alert(err.message || "Не удалось открыть чек");
    }
  };

  const handleReturnSubmit = async (payload) => {
    await posApi.createReturn(organizationId, payload);
    await loadSales();
    await reloadOverview();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-border shadow-soft p-3 flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Фильтр по статусу"
          className={INPUT_CLASS + " sm:w-48"}
        >
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABEL).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          aria-label="Фильтр по способу оплаты"
          className={INPUT_CLASS + " sm:w-48"}
        >
          <option value="">Все способы оплаты</option>
          {Object.entries(PAYMENT_LABEL).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={loadSales}
          aria-label="Обновить список чеков"
          tabIndex={0}
          className="px-4 py-2 rounded-lg border border-border text-muted text-sm hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          Обновить
        </button>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div>
      ) : null}

      <div className="rounded-xl bg-white border border-border shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-muted text-sm">Загрузка чеков…</div>
        ) : sales.length === 0 ? (
          <div className="p-6 text-center text-muted text-sm">Нет чеков по фильтру.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted">
                <tr>
                  <th className="text-left px-3 py-2">№ чека</th>
                  <th className="text-left px-3 py-2">Дата</th>
                  <th className="text-left px-3 py-2">Оплата</th>
                  <th className="text-left px-3 py-2">Статус</th>
                  <th className="text-left px-3 py-2">Клиент</th>
                  <th className="text-right px-3 py-2">Сумма</th>
                  <th className="text-right px-3 py-2">Долг</th>
                  <th className="text-right px-3 py-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const status = STATUS_LABEL[s.status] || s.status;
                  const statusCls = STATUS_CLASS[s.status] || "bg-secondary text-muted border border-border";
                  return (
                    <tr key={s.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-3 py-2 font-medium text-primary">{s.sale_number}</td>
                      <td className="px-3 py-2 text-muted">{formatDateTime(s.created_at)}</td>
                      <td className="px-3 py-2 text-muted">{PAYMENT_LABEL[s.payment_type] || s.payment_type}</td>
                      <td className="px-3 py-2">
                        <span className={"px-2 py-0.5 rounded-full text-xs " + statusCls}>{status}</span>
                      </td>
                      <td className="px-3 py-2 text-muted">{s.customer_name || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary">{formatMoney(s.total_amount)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">
                        {Number(s.remaining_debt) > 0 ? formatMoney(s.remaining_debt) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenSale(s.id, "receipt")}
                            aria-label={`Открыть чек ${s.sale_number}`}
                            tabIndex={0}
                            className="text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
                          >
                            Чек
                          </button>
                          {s.status === "cancelled" || s.status === "refunded" || !canRefund ? null : (
                            <button
                              type="button"
                              onClick={() => handleOpenSale(s.id, "return")}
                              aria-label={`Оформить возврат по чеку ${s.sale_number}`}
                              tabIndex={0}
                              className="text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
                            >
                              Возврат
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReturnModal
        sale={returnSale}
        onClose={() => setReturnSale(null)}
        onSuccess={handleReturnSubmit}
      />

      <POSReceiptModal
        sale={receiptSale}
        storeName={storeName}
        organizationId={organizationId}
        onClose={() => setReceiptSale(null)}
      />
    </div>
  );
};

export default POSSalesHistory;
