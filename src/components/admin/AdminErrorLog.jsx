import { useState, useEffect, useCallback } from "react";
import { authFetch } from "../../api/client";
import { useModalDismiss } from "../../utils/useModalDismiss";
import { useAuth } from "../../context/AuthContext";

const LEVEL_LABELS = { info: "Info", warning: "Warning", error: "Error", critical: "Critical" };
const SOURCE_LABELS = { frontend: "Frontend", backend: "Backend", api: "API" };
const STATUS_LABELS = { new: "Новая", viewed: "Просмотрена", fixed: "Исправлена" };

const LEVEL_BADGE_CLASS = {
  info: "bg-sky-100 text-sky-900",
  warning: "bg-amber-100 text-amber-900",
  error: "bg-red-100 text-red-800",
  critical: "bg-red-200 text-red-900 font-semibold",
};

const labelClassName = "block text-sm font-medium text-muted mb-1.5";
const inputClassName =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
};

const SortableHeader = ({ label, field, ordering, onSort }) => {
  const active = ordering.replace("-", "") === field;
  const dir = ordering.startsWith("-") ? "desc" : "asc";
  return (
    <th
      className="px-4 py-3 text-sm font-medium text-muted cursor-pointer select-none hover:text-primary"
      onClick={() => onSort(field)}
    >
      {label} {active ? (dir === "desc" ? "▼" : "▲") : ""}
    </th>
  );
};

const ErrorDetailDrawer = ({ errorId, onClose, onStatusChanged }) => {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`platform/error-log/${errorId}/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? "Не удалось загрузить ошибку.");
        return;
      }
      setDetail(data);
      onStatusChanged?.();
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [errorId, onStatusChanged]);

  useEffect(() => {
    load();
  }, [load]);

  const closeModal = () => {
    if (commentSaving || statusSaving) return;
    onClose();
  };
  const modalA11y = useModalDismiss(closeModal, { active: true });

  const handleStatusChange = async (newStatus) => {
    setStatusSaving(true);
    try {
      const res = await authFetch(`platform/error-log/${errorId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDetail(data);
        onStatusChanged?.();
      }
    } finally {
      setStatusSaving(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommentSaving(true);
    try {
      const res = await authFetch(`platform/error-log/${errorId}/comments/`, {
        method: "POST",
        body: JSON.stringify({ text: commentText.trim() }),
      });
      if (res.ok) {
        setCommentText("");
        await load();
      }
    } finally {
      setCommentSaving(false);
    }
  };

  const handleCopy = () => {
    if (!detail) return;
    const text = `[${detail.level}] ${detail.message}\n\n${detail.stack_trace || ""}`;
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const handleDownload = () => {
    if (!detail) return;
    const text = JSON.stringify(detail, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `error-${detail.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-detail-title"
      onMouseDown={modalA11y.onBackdropMouseDown}
    >
      <div
        ref={modalA11y.dialogRef}
        tabIndex={-1}
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="error-detail-title" className="text-lg font-medium text-muted">
            Карточка ошибки {detail ? `#${detail.id}` : ""}
          </h2>
          <button
            type="button"
            onClick={closeModal}
            className="text-muted hover:text-primary transition"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {loading ? <p className="text-muted text-sm">Загрузка…</p> : null}
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
            {error}
          </p>
        ) : null}

        {detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-1 rounded text-xs font-medium ${LEVEL_BADGE_CLASS[detail.level] || "bg-secondary"}`}>
                {LEVEL_LABELS[detail.level] || detail.level}
              </span>
              <span className="px-2 py-1 rounded text-xs font-medium bg-secondary text-muted">
                {SOURCE_LABELS[detail.source] || detail.source}
              </span>
              {detail.occurrence_count > 1 ? (
                <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-900">
                  Повторов: {detail.occurrence_count}
                </span>
              ) : null}
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-muted/70">Дата (первая / последняя)</dt>
                <dd className="text-muted font-medium">
                  {formatDate(detail.created_at)} / {formatDate(detail.updated_at)}
                </dd>
              </div>
              <div>
                <dt className="text-muted/70">Модуль / страница</dt>
                <dd className="text-muted font-medium">{detail.module || "—"} · {detail.page || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted/70">Пользователь / компания</dt>
                <dd className="text-muted font-medium">
                  {detail.user_name || "—"} · {detail.organization_name || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted/70">URL</dt>
                <dd className="text-muted font-medium break-all">{detail.url || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted/70">HTTP</dt>
                <dd className="text-muted font-medium">
                  {detail.http_method || "—"} {detail.http_status ?? ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted/70">Окружение</dt>
                <dd className="text-muted font-medium">
                  {detail.browser || "—"} · {detail.os || "—"} · v{detail.app_version || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted/70">IP</dt>
                <dd className="text-muted font-medium">{detail.ip_address || "—"}</dd>
              </div>
            </dl>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted/70 mb-1">Текст ошибки</h3>
              <p className="text-sm text-muted bg-secondary/40 rounded-lg px-3 py-2 whitespace-pre-wrap">
                {detail.message}
              </p>
            </div>

            {detail.stack_trace ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted/70 mb-1">Stack Trace</h3>
                <pre className="text-xs text-muted bg-neutral-900 text-neutral-100 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap max-h-64">
                  {detail.stack_trace}
                </pre>
              </div>
            ) : null}

            {detail.request_payload ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted/70 mb-1">Request Payload</h3>
                <pre className="text-xs text-muted bg-secondary/40 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap max-h-48">
                  {JSON.stringify(detail.request_payload, null, 2)}
                </pre>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 rounded-lg border border-border text-muted hover:bg-secondary transition text-sm"
              >
                Копировать текст
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="px-3 py-2 rounded-lg border border-border text-muted hover:bg-secondary transition text-sm"
              >
                Скачать отчёт
              </button>
              {["new", "viewed", "fixed"].map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={statusSaving || detail.status === s}
                  onClick={() => handleStatusChange(s)}
                  className={`px-3 py-2 rounded-lg border text-sm transition disabled:opacity-50 ${
                    detail.status === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted hover:bg-secondary"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted/70 mb-2">
                История обработки / комментарии
              </h3>
              <div className="space-y-2 mb-3">
                {(detail.comments || []).length === 0 ? (
                  <p className="text-sm text-muted/60">Комментариев пока нет.</p>
                ) : (
                  detail.comments.map((c) => (
                    <div key={c.id} className="text-sm bg-secondary/40 rounded-lg px-3 py-2">
                      <p className="text-xs text-muted/70 mb-0.5">
                        {c.author_name || "—"} · {formatDate(c.created_at)}
                      </p>
                      <p className="text-muted">{c.text}</p>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Добавить комментарий…"
                  className={inputClassName}
                  disabled={commentSaving}
                />
                <button
                  type="submit"
                  disabled={commentSaving || !commentText.trim()}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition shrink-0"
                >
                  Добавить
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const AdminErrorLog = () => {
  const { isSuperAdmin } = useAuth();
  const [data, setData] = useState({ results: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [filterLevel, setFilterLevel] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterOrg, setFilterOrg] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [ordering, setOrdering] = useState("-updated_at");
  const [selectedErrorId, setSelectedErrorId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const loadOrganizations = useCallback(async () => {
    try {
      const res = await authFetch("platform/organizations/");
      const list = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(list)) setOrganizations(list);
    } catch {
      setOrganizations([]);
    }
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filterLevel) params.set("level", filterLevel);
    if (filterSource) params.set("source", filterSource);
    if (filterStatus) params.set("status", filterStatus);
    if (filterOrg) params.set("organization", filterOrg);
    if (filterModule) params.set("module", filterModule);
    if (filterDateFrom) params.set("date_from", filterDateFrom);
    if (filterDateTo) params.set("date_to", filterDateTo);
    if (search.trim()) params.set("search", search.trim());
    params.set("ordering", ordering);
    return params;
  }, [filterLevel, filterSource, filterStatus, filterOrg, filterModule, filterDateFrom, filterDateTo, search, ordering]);

  const loadErrors = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = buildParams();
    params.set("page_size", "50");
    try {
      const res = await authFetch(`platform/error-log/?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.detail ?? "Ошибка загрузки");
        setData({ results: [], count: 0 });
        return;
      }
      setData({ results: json.results ?? [], count: json.count ?? 0 });
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setData({ results: [], count: 0 });
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    loadErrors();
  }, [loadErrors]);

  const handleSort = (field) => {
    setOrdering((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : `-${field}`));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildParams();
      params.set("export", "1");
      const res = await authFetch(`platform/error-log/?${params.toString()}`);
      const rows = await res.json().catch(() => []);
      if (!res.ok || !Array.isArray(rows)) return;
      const XLSX = await import("xlsx");
      const exportRows = rows.map((r) => ({
        ID: r.id,
        Дата: formatDate(r.created_at),
        Уровень: LEVEL_LABELS[r.level] || r.level,
        Источник: SOURCE_LABELS[r.source] || r.source,
        Модуль: r.module,
        Страница: r.page,
        Пользователь: r.user_name || "",
        Компания: r.organization_name || "",
        URL: r.url,
        "HTTP метод": r.http_method,
        "HTTP статус": r.http_status ?? "",
        Сообщение: r.message,
        Статус: STATUS_LABELS[r.status] || r.status,
        Повторов: r.occurrence_count,
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ошибки");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `error-log-${stamp}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-muted">Журнал ошибок</h1>
        <p className="text-muted">Доступ запрещён.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-muted">Журнал ошибок (Error Log)</h1>
          <p className="text-muted text-sm">
            Централизованный журнал ошибок frontend и backend. Повторяющиеся одинаковые ошибки группируются
            (счётчик повторов), не создавая дублей.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2.5 rounded-lg border border-border bg-white text-muted hover:bg-secondary transition disabled:opacity-50"
        >
          {exporting ? "Экспорт…" : "Экспорт в Excel"}
        </button>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label htmlFor="errlog-search" className={labelClassName}>
            Поиск
          </label>
          <input
            id="errlog-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Текст ошибки, URL, модуль…"
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="errlog-level" className={labelClassName}>
            Уровень
          </label>
          <select
            id="errlog-level"
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className={`${inputClassName} input-select`}
          >
            <option value="">Все</option>
            {Object.entries(LEVEL_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="errlog-source" className={labelClassName}>
            Источник
          </label>
          <select
            id="errlog-source"
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className={`${inputClassName} input-select`}
          >
            <option value="">Все</option>
            {Object.entries(SOURCE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="errlog-status" className={labelClassName}>
            Статус
          </label>
          <select
            id="errlog-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className={`${inputClassName} input-select`}
          >
            <option value="">Все</option>
            {Object.entries(STATUS_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="errlog-org" className={labelClassName}>
            Компания
          </label>
          <select
            id="errlog-org"
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value)}
            className={`${inputClassName} input-select`}
          >
            <option value="">Все</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name || org.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="errlog-module" className={labelClassName}>
            Модуль
          </label>
          <input
            id="errlog-module"
            type="text"
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="errlog-date-from" className={labelClassName}>
            Дата с
          </label>
          <input
            id="errlog-date-from"
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="errlog-date-to" className={labelClassName}>
            Дата по
          </label>
          <input
            id="errlog-date-to"
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-muted">Загрузка…</p>
      ) : (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          {data.results.length === 0 ? (
            <div className="p-8 text-center text-muted">Нет записей</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <SortableHeader label="Дата" field="updated_at" ordering={ordering} onSort={handleSort} />
                    <SortableHeader label="Уровень" field="level" ordering={ordering} onSort={handleSort} />
                    <th className="px-4 py-3 text-sm font-medium text-muted">Источник</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Модуль</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Сообщение</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Пользователь</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Компания</th>
                    <SortableHeader label="Повторов" field="occurrence_count" ordering={ordering} onSort={handleSort} />
                    <SortableHeader label="Статус" field="status" ordering={ordering} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedErrorId(row.id)}
                    >
                      <td className="px-4 py-3 text-muted text-sm whitespace-nowrap">{formatDate(row.updated_at)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${LEVEL_BADGE_CLASS[row.level] || "bg-secondary"}`}
                        >
                          {LEVEL_LABELS[row.level] || row.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted text-sm">{SOURCE_LABELS[row.source] || row.source}</td>
                      <td className="px-4 py-3 text-muted text-sm">{row.module || "—"}</td>
                      <td className="px-4 py-3 text-muted text-sm max-w-md truncate">{row.message}</td>
                      <td className="px-4 py-3 text-muted text-sm">{row.user_name || "—"}</td>
                      <td className="px-4 py-3 text-muted text-sm">{row.organization_name || "—"}</td>
                      <td className="px-4 py-3 text-muted text-sm text-center">{row.occurrence_count}</td>
                      <td className="px-4 py-3 text-muted text-sm">{STATUS_LABELS[row.status] || row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.count > data.results.length ? (
            <div className="px-4 py-2 border-t border-border text-sm text-muted">
              Показано {data.results.length} из {data.count}
            </div>
          ) : null}
        </div>
      )}

      {selectedErrorId ? (
        <ErrorDetailDrawer
          errorId={selectedErrorId}
          onClose={() => setSelectedErrorId(null)}
          onStatusChanged={loadErrors}
        />
      ) : null}
    </div>
  );
};

export default AdminErrorLog;
