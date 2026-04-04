import { useState, useEffect, useCallback } from "react";
import { authFetch } from "../../api/client";

const ACTION_LABELS = {
  organization_created: "Создана компания",
  organization_updated: "Обновлена компания",
  organization_deleted: "Компания удалена",
  first_admin_assigned: "Назначен первый админ",
  member_added: "Добавлен участник",
  invitation_created: "Создано приглашение",
  warehouse_created: "Создан склад",
  warehouse_updated: "Обновлён склад",
  warehouse_deleted: "Удалён склад",
};

const AdminAudit = () => {
  const [data, setData] = useState({ results: [], count: 0, next: null, previous: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [filterOrg, setFilterOrg] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const loadOrganizations = useCallback(async () => {
    try {
      const res = await authFetch("platform/organizations/");
      const list = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(list)) setOrganizations(list);
    } catch {
      setOrganizations([]);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (filterOrg) params.set("organization", filterOrg);
    if (filterAction) params.set("action", filterAction);
    if (filterDateFrom) params.set("date_from", filterDateFrom);
    if (filterDateTo) params.set("date_to", filterDateTo);
    params.set("page_size", "50");
    try {
      const res = await authFetch(`platform/audit/?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.detail ?? "Ошибка загрузки");
        setData({ results: [], count: 0, next: null, previous: null });
        return;
      }
      setData({
        results: json.results ?? [],
        count: json.count ?? json.results?.length ?? 0,
        next: json.next ?? null,
        previous: json.previous ?? null,
      });
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setData({ results: [], count: 0, next: null, previous: null });
    } finally {
      setLoading(false);
    }
  }, [filterOrg, filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  const labelClassName = "block text-sm font-medium text-muted mb-1.5";
  const inputClassName =
    "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-muted">Аудит</h1>
      <p className="text-muted text-sm">
        Журнал действий по платформе и компаниям.
      </p>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label htmlFor="audit-org" className={labelClassName}>
            Организация
          </label>
          <select
            id="audit-org"
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value)}
            className={`${inputClassName} input-select`}
            aria-label="Организация"
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
          <label htmlFor="audit-action" className={labelClassName}>
            Действие
          </label>
          <select
            id="audit-action"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className={`${inputClassName} input-select`}
            aria-label="Действие"
          >
            <option value="">Все</option>
            {Object.entries(ACTION_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-date-from" className={labelClassName}>
            Дата с
          </label>
          <input
            id="audit-date-from"
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="audit-date-to" className={labelClassName}>
            Дата по
          </label>
          <input
            id="audit-date-to"
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
                    <th className="px-4 py-3 text-sm font-medium text-muted">Дата</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Пользователь</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Действие</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Объект</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Организация</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-muted text-sm">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted">{row.user_phone ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">
                        {ACTION_LABELS[row.action] ?? row.action}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {row.target_type && row.target_id
                          ? `${row.target_type} #${row.target_id}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted">{row.organization_name ?? "—"}</td>
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
    </div>
  );
};

export default AdminAudit;
