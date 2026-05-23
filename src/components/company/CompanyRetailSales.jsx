import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import {
  PAYMENT_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  formatDateTime,
  formatMoney,
  formatSalePaymentLabel,
} from "../pos/posApi";
import SalePaymentLabel from "../pos/SalePaymentLabel";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const CompanyRetailSales = () => {
  const { activeContext } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;
  const [searchParams] = useSearchParams();
  const initialWarehouseId = searchParams.get("warehouse_id") || "";

  const [warehouses, setWarehouses] = useState([]);
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!organizationId) return;
    authFetch(`platform/organizations/${organizationId}/warehouses/`)
      .then((res) => res.json().catch(() => []))
      .then((data) => setWarehouses(Array.isArray(data) ? data : []))
      .catch(() => setWarehouses([]));
  }, [organizationId]);

  const loadSales = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (warehouseId) params.set("warehouse_id", warehouseId);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (statusFilter) params.set("status", statusFilter);
      if (paymentFilter) params.set("payment_type", paymentFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

      const res = await authFetch(
        `platform/organizations/${organizationId}/pos/sales/?${params.toString()}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? "Не удалось загрузить розничные продажи");
        setResults([]);
        setCount(0);
        return;
      }
      setResults(Array.isArray(data.results) ? data.results : []);
      setCount(typeof data.count === "number" ? data.count : 0);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setResults([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [
    organizationId,
    page,
    pageSize,
    warehouseId,
    dateFrom,
    dateTo,
    statusFilter,
    paymentFilter,
    debouncedSearch,
  ]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-primary">Розничные продажи</h1>
        <p className="text-sm text-muted mt-1">
          Чеки кассы POS. Списание со склада происходит через розницу, а не через расходные счёт‑фактуры.
        </p>
      </div>

      <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 text-sm text-sky-900">
        Расходные счёт‑фактуры — для оптовых/документальных отгрузок. Розница с кассы учитывается здесь и
        автоматически уменьшает остаток на складе (вкладка «Без маркировки»).
      </div>

      <div className="rounded-xl bg-white border border-border shadow-soft p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label htmlFor="retail-wh" className="block text-xs text-muted mb-1">
            Склад
          </label>
          <select
            id="retail-wh"
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          >
            <option value="">Все склады</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="retail-from" className="block text-xs text-muted mb-1">
            Дата с
          </label>
          <input
            id="retail-from"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="retail-to" className="block text-xs text-muted mb-1">
            Дата по
          </label>
          <input
            id="retail-to"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="retail-search" className="block text-xs text-muted mb-1">
            Поиск
          </label>
          <input
            id="retail-search"
            type="search"
            placeholder="№ чека, клиент, кассир…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="retail-status" className="block text-xs text-muted mb-1">
            Статус
          </label>
          <select
            id="retail-status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          >
            <option value="">Все</option>
            <option value="completed">Завершён</option>
            <option value="debt_pending">В долг</option>
            <option value="partially_refunded">Частичный возврат</option>
            <option value="refunded">Возврат</option>
          </select>
        </div>
        <div>
          <label htmlFor="retail-payment" className="block text-xs text-muted mb-1">
            Оплата
          </label>
          <select
            id="retail-payment"
            value={paymentFilter}
            onChange={(e) => {
              setPaymentFilter(e.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          >
            <option value="">Все</option>
            <option value="cash">Наличные</option>
            <option value="card">Карта</option>
            <option value="debt">В долг</option>
            <option value="mixed">Смешанная</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div>
      ) : null}

      <div className="rounded-xl bg-white border border-border shadow-soft overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-muted text-center">Загрузка…</p>
        ) : results.length === 0 ? (
          <p className="p-6 text-sm text-muted text-center">Розничных продаж не найдено.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted">
                <tr>
                  <th className="text-left px-3 py-2">№ чека</th>
                  <th className="text-left px-3 py-2">Дата</th>
                  <th className="text-left px-3 py-2">Склад</th>
                  <th className="text-left px-3 py-2">Кассир</th>
                  <th className="text-left px-3 py-2">Клиент</th>
                  <th className="text-left px-3 py-2">Оплата</th>
                  <th className="text-right px-3 py-2">Сумма</th>
                  <th className="text-left px-3 py-2">Статус</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-medium text-primary">{row.sale_number}</td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-3 py-2 text-muted">{row.warehouse_name || "—"}</td>
                    <td className="px-3 py-2 text-muted">{row.cashier_name || "—"}</td>
                    <td className="px-3 py-2 text-muted">{row.customer_name || "—"}</td>
                    <td className="px-3 py-2">
                      <SalePaymentLabel sale={row} />
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatMoney(row.total_amount)} UZS
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[row.status] || "bg-secondary text-muted"}`}
                      >
                        {STATUS_LABEL[row.status] || row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/app/retail-sales/${row.id}`}
                        className="text-primary text-xs font-medium hover:underline"
                      >
                        Открыть
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {count > pageSize ? (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Всего: {count} · страница {page} из {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-50 hover:bg-secondary"
            >
              Назад
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-50 hover:bg-secondary"
            >
              Вперёд
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CompanyRetailSales;
