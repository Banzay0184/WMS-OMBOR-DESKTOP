import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { buildCustomerBalanceRows } from "../pos/receiptBalance";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  formatDateTime,
  formatMoney,
  formatSalePaymentLabel,
} from "../pos/posApi";

const CompanyRetailSaleDetail = () => {
  const { saleId } = useParams();
  const { activeContext } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId || !saleId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/pos/sales/${saleId}/`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? "Чек не найден");
      setSale(data);
    } catch (err) {
      setError(err.message ?? "Ошибка загрузки");
      setSale(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId, saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const balanceRows = sale ? buildCustomerBalanceRows(sale) : [];

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted">Загрузка чека…</div>
    );
  }

  if (error || !sale) {
    return (
      <div className="p-6 space-y-3">
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-3 text-sm">
          {error || "Чек не найден"}
        </div>
        <Link to="/app/retail-sales" className="text-primary text-sm hover:underline">
          ← К списку розничных продаж
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/app/retail-sales" className="text-sm text-muted hover:text-primary">
            ← Розничные продажи
          </Link>
          <h1 className="text-xl font-semibold text-primary mt-1">{sale.sale_number}</h1>
          <p className="text-sm text-muted">{formatDateTime(sale.created_at)}</p>
        </div>
        <span
          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${STATUS_CLASS[sale.status] || "bg-secondary text-muted"}`}
        >
          {STATUS_LABEL[sale.status] || sale.status}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-white border border-border p-4 text-sm space-y-1">
          <p className="text-muted">
            Склад: <span className="text-primary font-medium">{sale.warehouse_name || "—"}</span>
          </p>
          <p className="text-muted">
            Кассир: <span className="text-primary font-medium">{sale.cashier_name || "—"}</span>
          </p>
          <p className="text-muted">
            Клиент: <span className="text-primary font-medium">{sale.customer_name || "—"}</span>
          </p>
          <p className="text-muted">
            Оплата:{" "}
            <span className="text-primary font-medium">{formatSalePaymentLabel(sale)}</span>
          </p>
        </div>
        <div className="rounded-xl bg-white border border-border p-4 text-sm space-y-1">
          <p className="text-muted">
            Итог: <span className="text-primary font-bold text-base">{formatMoney(sale.total_amount)} UZS</span>
          </p>
          {Number(sale.cash_amount) > 0 ? (
            <p className="text-muted">Наличные: {formatMoney(sale.cash_amount)} UZS</p>
          ) : null}
          {Number(sale.card_amount) > 0 ? (
            <p className="text-muted">Карта: {formatMoney(sale.card_amount)} UZS</p>
          ) : null}
          {Number(sale.prepayment_applied) > 0 ? (
            <p className="text-emerald-700">
              С баланса клиента: {formatMoney(sale.prepayment_applied)} UZS
            </p>
          ) : null}
          {Number(sale.debt_amount_at_sale) > 0 ? (
            <p className="text-amber-700">В долг: {formatMoney(sale.debt_amount_at_sale)} UZS</p>
          ) : null}
        </div>
      </div>

      {balanceRows.length > 0 ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <h2 className="text-sm font-semibold text-emerald-900 mb-2">Баланс клиента по чеку</h2>
          <ul className="space-y-1 text-sm">
            {balanceRows.map((row) => (
              <li key={row.label} className="flex justify-between gap-3">
                <span className="text-emerald-800">{row.label}</span>
                <span className="font-semibold tabular-nums text-emerald-900">{row.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl bg-white border border-border shadow-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-muted">
            <tr>
              <th className="text-left px-3 py-2">Товар</th>
              <th className="text-right px-3 py-2">Кол-во</th>
              <th className="text-right px-3 py-2">Цена</th>
              <th className="text-right px-3 py-2">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items || []).map((it) => (
              <tr key={it.id} className="border-t border-border">
                <td className="px-3 py-2 text-primary">{it.name_snapshot}</td>
                <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(it.unit_price)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatMoney(it.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Array.isArray(sale.returns) && sale.returns.length > 0 ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm">
          <h2 className="font-semibold text-amber-900 mb-2">Возвраты по чеку</h2>
          <ul className="space-y-1">
            {sale.returns.map((ret) => (
              <li key={ret.id} className="text-amber-800">
                {ret.return_number} · {formatDateTime(ret.created_at)} · {formatMoney(ret.total_amount)} UZS
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default CompanyRetailSaleDetail;
