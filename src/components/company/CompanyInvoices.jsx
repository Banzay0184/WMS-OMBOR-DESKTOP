import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const moneyFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (iso) => {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
};

const formatActor = (name, id) => {
  const normalized = String(name || "").trim();
  if (normalized) return normalized;
  if (id) return `ID ${id}`;
  return "—";
};

const CompanyInvoices = () => {
  const navigate = useNavigate();
  const { activeContext, markForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [warehouses, setWarehouses] = useState([]);
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [newInvoiceWarehouseId, setNewInvoiceWarehouseId] = useState("");
  const [deletingInvoiceId, setDeletingInvoiceId] = useState(null);
  const [pendingInvoiceAction, setPendingInvoiceAction] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const loadWarehouses = useCallback(async () => {
    if (!organizationId) return;
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/warehouses/`);
      const data = await res.json().catch(() => []);
      if (!res.ok) return;
      setWarehouses(Array.isArray(data) ? data : []);
    } catch {
      setWarehouses([]);
    }
  }, [organizationId]);

  const loadInvoices = useCallback(async () => {
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
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

      const res = await authFetch(`platform/organizations/${organizationId}/documents/?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "warehouses");
          setError("Нет прав на просмотр документов.");
          setResults([]);
          setCount(0);
          return;
        }
        setError(data.detail ?? "Ошибка загрузки");
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
  }, [organizationId, page, pageSize, warehouseId, dateFrom, dateTo, debouncedSearch, markForbiddenAppPage]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (organizationId) loadWarehouses();
  }, [organizationId, loadWarehouses]);

  useEffect(() => {
    if (organizationId) loadInvoices();
  }, [organizationId, loadInvoices]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const handleOpenNewModal = () => {
    setNewInvoiceWarehouseId(warehouses.length === 1 ? String(warehouses[0].id) : "");
    setShowWarehouseModal(true);
  };

  const handleConfirmNew = () => {
    const wid = newInvoiceWarehouseId.trim();
    if (!wid) return;
    const wh = warehouses.find((w) => String(w.id) === wid);
    setShowWarehouseModal(false);
    navigate(`/app/warehouses/${wid}/receipt`, {
      state: {
        warehouseName: wh?.name ?? `Склад #${wid}`,
        warehouseAddress: wh?.address ?? "",
      },
    });
  };

  const handleDeleteInvoice = useCallback(async (doc) => {
    if (!doc?.id) return;
    setPendingInvoiceAction(doc);
  }, []);

  const handleConfirmArchiveDelete = useCallback(async () => {
    const invoice = pendingInvoiceAction;
    if (!organizationId || !invoice?.id) return;
    const isDraftInvoice = invoice.status === "draft";
    const isOutgoing = invoice.doc_type === "outgoing";
    const entityLabel = isOutgoing ? "расходная счёт‑фактура" : "счёт‑фактура";
    const endpoint = isOutgoing ? "outgoing-invoices" : "invoices";
    setPendingInvoiceAction(null);
    setActionError("");
    setActionSuccess("");
    setDeletingInvoiceId(invoice.id);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/${endpoint}/${invoice.id}/`, {
        method: "DELETE",
      });
      if (res.status === 204 || res.ok) {
        await loadInvoices();
        setActionSuccess(isDraftInvoice ? "Черновик удалён." : `${entityLabel} архивирована.`);
        setTimeout(() => setActionSuccess(""), 2500);
        return;
      }
      if (res.status === 403) {
        const message = "Недостаточно прав: действие доступно только администратору компании.";
        setActionError(message);
        return;
      }
      const json = await res.json().catch(() => ({}));
      const message =
        typeof json.detail === "string"
          ? json.detail
          : (isDraftInvoice ? `Не удалось удалить ${entityLabel}.` : `Не удалось архивировать ${entityLabel}.`);
      setActionError(message);
    } catch (err) {
      const message = err.message ?? "Ошибка сети";
      setActionError(message);
    } finally {
      setDeletingInvoiceId(null);
    }
  }, [organizationId, pendingInvoiceAction, loadInvoices]);

  if (!organizationId) {
    return (
      <div className="rounded-xl border border-border bg-white p-6 text-sm text-muted">
        Выберите организацию в контексте.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-muted tracking-tight">Счёт‑фактуры</h1>
          <p className="text-sm text-muted/75 mt-1">Единый журнал документов прихода и расхода.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleOpenNewModal}
            className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold bg-primary text-white shadow-sm hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 transition disabled:opacity-50"
            disabled={warehouses.length === 0}
            aria-label="Новая счёт‑фактура"
          >
            Новая счёт‑фактура
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-4 shadow-soft space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="inv-filter-wh" className="block text-xs font-medium text-muted/80 mb-1">
              Склад
            </label>
            <select
              id="inv-filter-wh"
              value={warehouseId}
              onChange={(e) => {
                setPage(1);
                setWarehouseId(e.target.value);
              }}
              className={`${INPUT_CLASS} input-select`}
              aria-label="Фильтр по складу"
            >
              <option value="">Все склады</option>
              {warehouses.map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name ?? `Склад #${w.id}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="inv-filter-from" className="block text-xs font-medium text-muted/80 mb-1">
              Дата документа с
            </label>
            <input
              id="inv-filter-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setPage(1);
                setDateFrom(e.target.value);
              }}
              className={INPUT_CLASS}
              aria-label="Дата с"
            />
          </div>
          <div>
            <label htmlFor="inv-filter-to" className="block text-xs font-medium text-muted/80 mb-1">
              Дата документа по
            </label>
            <input
              id="inv-filter-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setPage(1);
                setDateTo(e.target.value);
              }}
              className={INPUT_CLASS}
              aria-label="Дата по"
            />
          </div>
          <div>
            <label htmlFor="inv-filter-search" className="block text-xs font-medium text-muted/80 mb-1">
              Поиск
            </label>
            <input
              id="inv-filter-search"
              type="search"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Номер, контрагент…"
              className={INPUT_CLASS}
              aria-label="Поиск по номеру или контрагенту"
            />
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-800 bg-red-50/80 border border-red-200/70 rounded-lg px-4 py-2.5" role="alert">
            {error}
          </p>
        ) : null}
        {actionError ? (
          <p className="text-sm text-red-800 bg-red-50/80 border border-red-200/70 rounded-lg px-4 py-2.5" role="alert">
            {actionError}
          </p>
        ) : null}
        {actionSuccess ? (
          <p className="text-sm text-green-700 bg-green-50/80 border border-green-200/70 rounded-lg px-4 py-2.5" role="status">
            {actionSuccess}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted/75 py-6">Загрузка…</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted/75 py-6">Нет счёт‑фактур по выбранным условиям.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted/70">
                  <th className="py-2 pr-3">Тип</th>
                  <th className="py-2 pr-3">Договор №</th>
                  <th className="py-2 pr-3">Дата дог.</th>
                  <th className="py-2 pr-3">Статус</th>
                  <th className="py-2 pr-3">Склад</th>
                  <th className="py-2 pr-3">Контрагент</th>
                  <th className="py-2 pr-3">Счёт</th>
                  <th className="py-2 pr-3 text-right">Итого</th>
                  <th className="py-2 pr-0">Действия</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={`${row.doc_type || "incoming"}-${row.id}`} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.doc_type === "outgoing"
                            ? "bg-sky-100 text-sky-900"
                            : "bg-violet-100 text-violet-900"
                        }`}
                      >
                        {row.doc_type === "outgoing" ? "Расход" : "Приход"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-muted">{row.contract_number || "—"}</td>
                    <td className="py-2.5 pr-3 text-muted">{formatDate(row.contract_date)}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.status === "approved"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {row.status === "approved" ? "Утверждена" : "Черновик"}
                      </span>
                      <p className="text-[11px] text-muted/70 mt-1">
                        Создал: {formatActor(row.created_by_name, row.created_by_id)}
                      </p>
                      {row.status === "approved" ? (
                        <p className="text-[11px] text-muted/70">
                          Утвердил: {formatActor(row.approved_by_name, row.approved_by_id)}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{row.warehouse_name || "—"}</td>
                    <td className="py-2.5 pr-3 text-muted max-w-[12rem] truncate" title={row.counterparty_name || row.supplier_name}>
                      {row.counterparty_name || row.supplier_name || "—"}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted/90">{row.invoice_number || "—"}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-medium text-muted">
                      {moneyFmt.format(Number(row.total_with_vat ?? 0))}
                    </td>
                    <td className="py-2.5 pr-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={row.doc_type === "outgoing" ? `/app/outgoing-invoices/${row.id}` : `/app/invoices/${row.id}`}
                          className="text-primary font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
                        >
                          Открыть
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteInvoice(row)}
                          disabled={deletingInvoiceId === row.id}
                          className="text-red-700 text-sm font-medium hover:underline disabled:opacity-60"
                          aria-label={`${row.status === "draft" ? "Удалить" : "Архивировать"} счёт‑фактуру ${row.contract_number || row.id}`}
                        >
                          {deletingInvoiceId === row.id
                            ? (row.status === "draft" ? "Удаление…" : "Архивация…")
                            : (row.status === "draft" ? "Удалить" : "Архивировать")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {count > pageSize ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
            <p className="text-xs text-muted/70">
              Всего: {count} · страница {page} из {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-sm rounded-lg border border-border bg-white disabled:opacity-40"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm rounded-lg border border-border bg-white disabled:opacity-40"
              >
                Вперёд
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {showWarehouseModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-new-invoice-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-lg p-5 space-y-4">
            <h2 id="modal-new-invoice-title" className="text-lg font-semibold text-muted">
              Новая счёт‑фактура
            </h2>
            <p className="text-sm text-muted/75">Выберите склад прихода — откроется форма ввода.</p>
            <div>
              <label htmlFor="modal-wh" className="block text-sm font-medium text-muted mb-1.5">
                Склад
              </label>
              <select
                id="modal-wh"
                value={newInvoiceWarehouseId}
                onChange={(e) => setNewInvoiceWarehouseId(e.target.value)}
                className={`${INPUT_CLASS} input-select w-full`}
              >
                <option value="">— Выберите склад —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name ?? `Склад #${w.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowWarehouseModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border bg-white text-muted"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmNew}
                disabled={!newInvoiceWarehouseId}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white disabled:opacity-50"
              >
                Продолжить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingInvoiceAction ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-archive-delete-invoice-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-lg p-5 space-y-4">
            <h2 id="modal-archive-delete-invoice-title" className="text-lg font-semibold text-muted">
              {pendingInvoiceAction.status === "draft" ? "Удалить черновик?" : "Архивировать счёт‑фактуру?"}
            </h2>
            <p className="text-sm text-muted/75">
              {pendingInvoiceAction.status === "draft"
                ? "Черновик будет удалён без возможности восстановления."
                : "Документ будет перемещён в архив и сможет быть удалён навсегда только из панели разработчика/очистки."}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingInvoiceAction(null)}
                className="px-4 py-2 text-sm rounded-lg border border-border bg-white text-muted"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmArchiveDelete()}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white"
              >
                {pendingInvoiceAction.status === "draft" ? "Удалить" : "Архивировать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CompanyInvoices;
