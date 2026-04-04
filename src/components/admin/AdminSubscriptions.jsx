import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { authFetch } from "../../api/client";

const SUBSCRIPTION_TABS = [
  { id: "tariffs", label: "Тарифы" },
  { id: "subscriptions", label: "Подписки компаний" },
  { id: "history", label: "История изменений" },
];

const SUBSCRIPTION_STATUS_LABELS = {
  not_assigned: "Не назначена",
  pending: "Ожидает",
  trial: "Пробный период",
  active: "Активна",
  expired: "Истекла",
  cancelled: "Отменена",
};

const toLocalDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mon = parseInt(m[2], 10);
      const d = parseInt(m[3], 10);
      if (!Number.isNaN(y) && !Number.isNaN(mon) && !Number.isNaN(d)) {
        return new Date(y, mon - 1, d);
      }
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const getEffectiveSubscriptionStatusKey = (sub, now = new Date()) => {
  if (!sub) return null;
  if (sub.subscription_status === "cancelled") return "cancelled";

  const endDate = toLocalDateOnly(sub.end_date);
  const today = toLocalDateOnly(now);
  if (endDate && today && endDate < today) {
    return "expired";
  }

  return sub.subscription_status ?? null;
};

const EVENT_TYPE_LABELS = {
  created: "Создана",
  tariff_changed: "Смена тарифа",
  renewed: "Продление",
  status_changed: "Смена статуса",
  cancelled: "Отменена",
};

const AdminSubscriptions = () => {
  const [activeTab, setActiveTab] = useState("tariffs");
  const [tariffs, setTariffs] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [historySubscriptionId, setHistorySubscriptionId] = useState("");
  const [historyEvents, setHistoryEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTariffForm, setShowTariffForm] = useState(false);
  const [editingTariffId, setEditingTariffId] = useState(null);
  const [tariffName, setTariffName] = useState("");
  const [tariffPrice, setTariffPrice] = useState("");
  const [tariffDurationDays, setTariffDurationDays] = useState("");
  const [tariffMaxUsers, setTariffMaxUsers] = useState("");
  const [tariffMaxWarehouses, setTariffMaxWarehouses] = useState("");
  const [tariffCanInvite, setTariffCanInvite] = useState(true);
  const [tariffCanWarehouses, setTariffCanWarehouses] = useState(true);
  const [tariffCanReports, setTariffCanReports] = useState(false);
  const [tariffCanMarking, setTariffCanMarking] = useState(false);
  const [tariffCanUpc, setTariffCanUpc] = useState(false);
  const [tariffIsActive, setTariffIsActive] = useState(true);
  const [tariffSaveLoading, setTariffSaveLoading] = useState(false);
  const [tariffSaveError, setTariffSaveError] = useState("");

  const loadTariffs = useCallback(async () => {
    setError("");
    try {
      const res = await authFetch("platform/tariffs/");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data)) setTariffs(data);
      else setTariffs([]);
    } catch (err) {
      setError(err.message ?? "Ошибка загрузки тарифов");
      setTariffs([]);
    }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    setError("");
    try {
      const res = await authFetch("platform/subscriptions/");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data)) setSubscriptions(data);
      else setSubscriptions([]);
    } catch (err) {
      setError(err.message ?? "Ошибка загрузки подписок");
      setSubscriptions([]);
    }
  }, []);

  const loadHistory = useCallback(async (subscriptionId) => {
    if (!subscriptionId) {
      setHistoryEvents([]);
      return;
    }
    try {
      const res = await authFetch(`platform/subscriptions/${subscriptionId}/history/`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data)) setHistoryEvents(data);
      else setHistoryEvents([]);
    } catch {
      setHistoryEvents([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    if (activeTab === "tariffs") loadTariffs().finally(() => setLoading(false));
    else if (activeTab === "subscriptions" || activeTab === "history") loadSubscriptions().finally(() => setLoading(false));
    else setLoading(false);
  }, [activeTab, loadTariffs, loadSubscriptions]);

  useEffect(() => {
    if (activeTab === "history" && historySubscriptionId) loadHistory(historySubscriptionId);
    else if (activeTab === "history") setHistoryEvents([]);
  }, [activeTab, historySubscriptionId, loadHistory]);

  const openCreateTariff = () => {
    setEditingTariffId(null);
    setTariffName("");
    setTariffPrice("");
    setTariffDurationDays("");
    setTariffMaxUsers("");
    setTariffMaxWarehouses("");
    setTariffCanInvite(true);
    setTariffCanWarehouses(true);
    setTariffCanReports(false);
    setTariffCanMarking(false);
    setTariffCanUpc(false);
    setTariffIsActive(true);
    setTariffSaveError("");
    setShowTariffForm(true);
  };

  const openEditTariff = (t) => {
    setEditingTariffId(t.id);
    setTariffName(t.name ?? "");
    setTariffPrice(t.price != null ? String(t.price) : "");
    setTariffDurationDays(t.duration_days != null ? String(t.duration_days) : "");
    setTariffMaxUsers(t.max_users != null ? String(t.max_users) : "");
    setTariffMaxWarehouses(t.max_warehouses != null ? String(t.max_warehouses) : "");
    setTariffCanInvite(t.can_invite !== false);
    setTariffCanWarehouses(t.can_warehouses !== false);
    setTariffCanReports(t.can_reports === true);
    setTariffCanMarking(t.can_marking === true);
    setTariffCanUpc(t.can_upc === true);
    setTariffIsActive(t.is_active !== false);
    setTariffSaveError("");
    setShowTariffForm(true);
  };

  const handleTariffSubmit = async (e) => {
    e.preventDefault();
    setTariffSaveError("");
    setTariffSaveLoading(true);
    try {
      const payload = {
        name: tariffName.trim(),
        price: tariffPrice.trim() ? Number(tariffPrice) : null,
        duration_days: tariffDurationDays.trim() ? Number(tariffDurationDays) : null,
        max_users: tariffMaxUsers.trim() ? Number(tariffMaxUsers) : null,
        max_warehouses: tariffMaxWarehouses.trim() ? Number(tariffMaxWarehouses) : null,
        can_invite: tariffCanInvite,
        can_warehouses: tariffCanWarehouses,
        can_reports: tariffCanReports,
        can_marking: tariffCanMarking,
        can_upc: tariffCanUpc,
        is_active: tariffIsActive,
      };
      const url = editingTariffId
        ? `platform/tariffs/${editingTariffId}/`
        : "platform/tariffs/";
      const method = editingTariffId ? "PATCH" : "POST";
      const res = await authFetch(url, { method, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTariffSaveError(data.name?.[0] ?? data.detail ?? "Ошибка сохранения");
        setTariffSaveLoading(false);
        return;
      }
      setShowTariffForm(false);
      loadTariffs();
    } catch (err) {
      setTariffSaveError(err.message ?? "Ошибка сети");
    } finally {
      setTariffSaveLoading(false);
    }
  };

  const inputClassName =
    "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
  const labelClassName = "block text-sm font-medium text-muted mb-1.5";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-muted">Подписки</h1>

      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Вкладки подписок">
        {SUBSCRIPTION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary bg-white"
                : "border-transparent text-muted hover:text-primary hover:bg-secondary/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {activeTab === "tariffs" && (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-medium text-muted">Тарифы</h2>
            <button
              type="button"
              onClick={openCreateTariff}
              className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition"
              aria-label="Создать тариф"
            >
              Создать тариф
            </button>
          </div>
          {loading ? (
            <p className="text-muted">Загрузка…</p>
          ) : tariffs.length === 0 ? (
            <p className="text-muted text-sm">Нет тарифов. Создайте первый.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-sm font-medium text-muted">Название</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Цена</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Срок (дней)</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Лимит пользователей</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Лимит складов</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Функции</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Активен</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {tariffs.map((t) => (
                    <tr key={t.id} className="border-b border-border hover:bg-secondary/30">
                      <td className="px-4 py-3 font-medium text-muted">{t.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{t.price != null ? t.price : "—"}</td>
                      <td className="px-4 py-3 text-muted">{t.duration_days ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{t.max_users ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{t.max_warehouses ?? "—"}</td>
                      <td className="px-4 py-3 text-muted text-sm">
                        {[
                          t.can_invite && "Приглашения",
                          t.can_warehouses && "Склады",
                          t.can_reports && "Отчёты",
                          t.can_marking && "Маркировка",
                          t.can_upc && "UPC",
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted">{t.is_active ? "Да" : "Нет"}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openEditTariff(t)}
                          className="text-sm px-2 py-1 rounded border border-border text-muted hover:bg-secondary hover:text-primary transition"
                        >
                          Изменить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "subscriptions" && (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-medium text-muted mb-4">Подписки компаний</h2>
          {loading ? (
            <p className="text-muted">Загрузка…</p>
          ) : subscriptions.length === 0 ? (
            <p className="text-muted text-sm">Нет подписок.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-sm font-medium text-muted">Компания</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Тариф</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Статус</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Дата начала</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Дата окончания</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Trial</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="border-b border-border hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <Link
                          to={`/panel/companies/${sub.organization}`}
                          className="font-medium text-muted hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset rounded"
                        >
                          {sub.organization_name || `Компания #${sub.organization}`}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{sub.tariff_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">
                        {(() => {
                          const effectiveKey = getEffectiveSubscriptionStatusKey(sub);
                          return effectiveKey
                            ? SUBSCRIPTION_STATUS_LABELS[effectiveKey] ?? effectiveKey
                            : "—";
                        })()}
                      </td>
                      <td className="px-4 py-3 text-muted">{sub.start_date ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{sub.end_date ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{sub.is_trial ? "Да" : "Нет"}</td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/panel/companies/${sub.organization}?tab=subscription`}
                          className="text-sm px-2 py-1 rounded border border-border text-muted hover:bg-secondary hover:text-primary transition"
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
        </section>
      )}

      {activeTab === "history" && (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-medium text-muted mb-4">История изменений</h2>
          <div className="mb-4 max-w-sm">
            <label htmlFor="history-subscription" className={labelClassName}>
              Подписка (компания)
            </label>
            <select
              id="history-subscription"
              value={historySubscriptionId}
              onChange={(e) => setHistorySubscriptionId(e.target.value)}
              className={`${inputClassName} input-select`}
              aria-label="Выбрать подписку"
            >
              <option value="">— Выберите подписку —</option>
              {subscriptions.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.organization_name || `Компания #${sub.organization}`} {sub.tariff_name ? `· ${sub.tariff_name}` : ""}
                </option>
              ))}
            </select>
          </div>
          {!historySubscriptionId ? (
            <p className="text-muted text-sm">Выберите подписку, чтобы увидеть историю.</p>
          ) : historyEvents.length === 0 ? (
            <p className="text-muted text-sm">Нет событий.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-sm font-medium text-muted">Дата</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Тип события</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Пользователь</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Данные</th>
                  </tr>
                </thead>
                <tbody>
                  {historyEvents.map((ev) => (
                    <tr key={ev.id} className="border-b border-border">
                      <td className="px-4 py-3 text-muted text-sm">
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
                      </td>
                      <td className="px-4 py-3 text-muted">{ev.user_phone ?? "—"}</td>
                      <td className="px-4 py-3 text-muted text-sm">
                        {ev.payload && Object.keys(ev.payload).length > 0
                          ? JSON.stringify(ev.payload)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showTariffForm && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tariff-form-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h2 id="tariff-form-title" className="text-lg font-medium text-muted mb-4">
              {editingTariffId ? "Редактировать тариф" : "Новый тариф"}
            </h2>
            <form onSubmit={handleTariffSubmit} className="space-y-4">
              <div>
                <label htmlFor="tariff-name" className={labelClassName}>Название</label>
                <input id="tariff-name" type="text" value={tariffName} onChange={(e) => setTariffName(e.target.value)} className={inputClassName} placeholder="Базовый" required />
              </div>
              <div>
                <label htmlFor="tariff-price" className={labelClassName}>Цена</label>
                <input id="tariff-price" type="number" step="0.01" min="0" value={tariffPrice} onChange={(e) => setTariffPrice(e.target.value)} className={inputClassName} placeholder="0" />
              </div>
              <div>
                <label htmlFor="tariff-duration" className={labelClassName}>Срок (дней)</label>
                <input id="tariff-duration" type="number" min="0" value={tariffDurationDays} onChange={(e) => setTariffDurationDays(e.target.value)} className={inputClassName} placeholder="30" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tariff-max-users" className={labelClassName}>Лимит пользователей</label>
                  <input id="tariff-max-users" type="number" min="0" value={tariffMaxUsers} onChange={(e) => setTariffMaxUsers(e.target.value)} className={inputClassName} placeholder="—" />
                </div>
                <div>
                  <label htmlFor="tariff-max-warehouses" className={labelClassName}>Лимит складов</label>
                  <input id="tariff-max-warehouses" type="number" min="0" value={tariffMaxWarehouses} onChange={(e) => setTariffMaxWarehouses(e.target.value)} className={inputClassName} placeholder="—" />
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted">Функции</span>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={tariffCanInvite} onChange={(e) => setTariffCanInvite(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
                    <span className="text-sm text-muted">Приглашения</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={tariffCanWarehouses} onChange={(e) => setTariffCanWarehouses(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
                    <span className="text-sm text-muted">Склады</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={tariffCanReports} onChange={(e) => setTariffCanReports(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
                    <span className="text-sm text-muted">Отчёты</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={tariffCanMarking} onChange={(e) => setTariffCanMarking(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
                    <span className="text-sm text-muted">Маркировка</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={tariffCanUpc} onChange={(e) => setTariffCanUpc(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
                    <span className="text-sm text-muted">UPC</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input id="tariff-active" type="checkbox" checked={tariffIsActive} onChange={(e) => setTariffIsActive(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
                <label htmlFor="tariff-active" className="text-sm text-muted">Тариф активен</label>
              </div>
              {tariffSaveError ? <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">{tariffSaveError}</p> : null}
              <div className="flex gap-2">
                <button type="submit" disabled={tariffSaveLoading} className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50">
                  {tariffSaveLoading ? "Сохранение…" : "Сохранить"}
                </button>
                <button type="button" onClick={() => setShowTariffForm(false)} className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:text-primary transition">
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSubscriptions;
