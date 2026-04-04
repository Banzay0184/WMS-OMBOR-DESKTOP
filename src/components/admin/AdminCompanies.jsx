import { useState, useEffect, useCallback } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { authFetch } from "../../api/client";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../../utils/phone";

const PLATFORM_ORGANIZATIONS = "platform/organizations/";
const PLATFORM_TARIFFS = "platform/tariffs/";
const PLATFORM_USERS = "platform/users/";

const COMPANY_STATUS_LABELS = {
  active: "Активна",
  blocked: "Заблокирована",
  archived: "В архиве",
};

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

const AdminCompanies = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const showArchive = location.pathname.includes("companies/archive");
  const [organizations, setOrganizations] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [restoreId, setRestoreId] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createInn, setCreateInn] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createAddress, setCreateAddress] = useState("");
  const [createContactPerson, setCreateContactPerson] = useState("");
  const [createComment, setCreateComment] = useState("");
  const [createAdminUserId, setCreateAdminUserId] = useState("");
  const [createAdminPhone, setCreateAdminPhone] = useState("");
  const [createTariffId, setCreateTariffId] = useState("");
  const [createStartDate, setCreateStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [createCompanyStatus, setCreateCompanyStatus] = useState("active");

  const loadOrganizations = useCallback(async (archived = false) => {
    setLoading(true);
    setError("");
    const url = archived ? `${PLATFORM_ORGANIZATIONS}?archived=1` : PLATFORM_ORGANIZATIONS;
    try {
      const res = await authFetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? "Ошибка загрузки списка");
        setOrganizations([]);
        return;
      }
      setOrganizations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTariffs = useCallback(async () => {
    try {
      const res = await authFetch(PLATFORM_TARIFFS + "?is_active=true");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data)) setTariffs(data);
      else setTariffs([]);
    } catch {
      setTariffs([]);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await authFetch(PLATFORM_USERS + "?page_size=500");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.results) setUsers(data.results);
      else if (res.ok && Array.isArray(data)) setUsers(data);
      else setUsers([]);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    loadOrganizations(showArchive);
  }, [loadOrganizations, showArchive]);

  useEffect(() => {
    if (showArchive) setShowCreateForm(false);
  }, [showArchive]);

  const handleRestore = async (orgId) => {
    setRestoreId(orgId);
    setRestoreLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${orgId}/restore/`, {
        method: "POST",
      });
      if (res.ok) {
        navigate("/panel/companies");
        loadOrganizations(false);
      } else {
        loadOrganizations(true);
      }
    } catch {
      loadOrganizations(true);
    } finally {
      setRestoreId(null);
      setRestoreLoading(false);
    }
  };

  useEffect(() => {
    if (showCreateForm) {
      loadTariffs();
      loadUsers();
    }
  }, [showCreateForm, loadTariffs, loadUsers]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError("");
    const adminUserId = createAdminUserId.trim() ? Number(createAdminUserId) : null;
    const adminPhoneDigits = getPhoneDigits(createAdminPhone).trim();
    const adminPhone = adminPhoneDigits || null;
    if (!adminUserId && !adminPhone) {
      setCreateError("Укажите администратора: выберите пользователя или введите телефон.");
      return;
    }
    if (adminUserId && adminPhone) {
      setCreateError("Укажите только пользователя или только телефон.");
      return;
    }
    setCreateLoading(true);
    try {
      const payload = {
        name: createName.trim() || null,
        inn: createInn.trim() || null,
        phone: getPhoneDigits(createPhone).trim() || null,
        email: createEmail.trim() || null,
        address: createAddress.trim() || null,
        contact_person: createContactPerson.trim() || null,
        comment: createComment.trim() || null,
        company_status: createCompanyStatus,
        tariff_id: createTariffId ? Number(createTariffId) : null,
        subscription_start_date: createStartDate || null,
      };
      if (adminUserId) payload.admin_user_id = adminUserId;
      else payload.admin_phone = adminPhoneDigits;

      const res = await authFetch(PLATFORM_ORGANIZATIONS, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.admin_user_id?.[0] ??
          data.admin_phone?.[0] ??
          data.inn?.[0] ??
          data.name?.[0] ??
          data.detail ??
          "Ошибка создания";
        setCreateError(typeof msg === "string" ? msg : JSON.stringify(msg));
        setCreateLoading(false);
        return;
      }
      setShowCreateForm(false);
      setCreateName("");
      setCreateInn("");
      setCreatePhone("");
      setCreateEmail("");
      setCreateAddress("");
      setCreateContactPerson("");
      setCreateComment("");
      setCreateAdminUserId("");
      setCreateAdminPhone("");
      setCreateTariffId("");
      setCreateStartDate(new Date().toISOString().slice(0, 10));
      setCreateCompanyStatus("active");
      loadOrganizations();
    } catch (err) {
      setCreateError(err.message ?? "Ошибка сети");
    } finally {
      setCreateLoading(false);
    }
  };

  const resetCreateForm = () => {
    setShowCreateForm(false);
    setCreateError("");
    setCreateName("");
    setCreateInn("");
    setCreatePhone("");
    setCreateEmail("");
    setCreateAddress("");
    setCreateContactPerson("");
    setCreateComment("");
    setCreateAdminUserId("");
    setCreateAdminPhone("");
    setCreateTariffId("");
    setCreateStartDate(new Date().toISOString().slice(0, 10));
    setCreateCompanyStatus("active");
  };

  const inputClassName =
    "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
  const labelClassName = "block text-sm font-medium text-muted mb-1.5";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-muted">Компании</h1>

      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Вкладки компаний">
        <NavLink
          to="/panel/companies"
          end
          className={({ isActive }) =>
            `px-4 py-2.5 rounded-t-lg text-sm font-medium transition border-b-2 -mb-px ${
              isActive
                ? "border-primary text-primary bg-white"
                : "border-transparent text-muted hover:text-primary hover:bg-secondary/50"
            }`
          }
          aria-label="Активные компании"
        >
          Активные
        </NavLink>
        <NavLink
          to="/panel/companies/archive"
          className={({ isActive }) =>
            `px-4 py-2.5 rounded-t-lg text-sm font-medium transition border-b-2 -mb-px ${
              isActive
                ? "border-primary text-primary bg-white"
                : "border-transparent text-muted hover:text-primary hover:bg-secondary/50"
            }`
          }
          aria-label="Архив компаний"
        >
          Архив
        </NavLink>
      </nav>

      {showCreateForm && (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-medium text-muted mb-4">Новая компания</h2>
          <form onSubmit={handleCreateSubmit} className="space-y-6 max-w-2xl">
            <div>
              <h3 className="text-sm font-medium text-muted mb-3">Основная информация</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="org-name" className={labelClassName}>
                    Название компании
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className={inputClassName}
                    placeholder="Название организации"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="org-inn" className={labelClassName}>
                    ИНН
                  </label>
                  <input
                    id="org-inn"
                    type="text"
                    value={createInn}
                    onChange={(e) => setCreateInn(e.target.value)}
                    className={inputClassName}
                    placeholder="ИНН"
                  />
                </div>
                <div>
                  <label htmlFor="org-phone" className={labelClassName}>
                    Телефон
                  </label>
                  <input
                    id="org-phone"
                    type="text"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(formatPhoneDisplay(e.target.value))}
                    className={inputClassName}
                    placeholder={PHONE_PLACEHOLDER}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="org-email" className={labelClassName}>
                    Email
                  </label>
                  <input
                    id="org-email"
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className={inputClassName}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="org-address" className={labelClassName}>
                    Адрес
                  </label>
                  <input
                    id="org-address"
                    type="text"
                    value={createAddress}
                    onChange={(e) => setCreateAddress(e.target.value)}
                    className={inputClassName}
                    placeholder="Адрес"
                  />
                </div>
                <div>
                  <label htmlFor="org-contact-person" className={labelClassName}>
                    Контактное лицо
                  </label>
                  <input
                    id="org-contact-person"
                    type="text"
                    value={createContactPerson}
                    onChange={(e) => setCreateContactPerson(e.target.value)}
                    className={inputClassName}
                    placeholder="ФИО"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="org-comment" className={labelClassName}>
                    Комментарий
                  </label>
                  <textarea
                    id="org-comment"
                    value={createComment}
                    onChange={(e) => setCreateComment(e.target.value)}
                    className={inputClassName}
                    placeholder="Комментарий"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-muted mb-3">Системная часть</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="org-admin" className={labelClassName}>
                    Администратор компании
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      id="org-admin"
                      value={createAdminUserId}
                      onChange={(e) => {
                        setCreateAdminUserId(e.target.value);
                        if (e.target.value) setCreateAdminPhone("");
                      }}
                      className={`${inputClassName} input-select`}
                      aria-label="Выбрать пользователя"
                    >
                      <option value="">— Выберите пользователя —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username || u.phone || `#${u.id}`}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-muted">или телефон:</span>
                    <input
                      type="tel"
                      value={createAdminPhone}
                      onChange={(e) => {
                        setCreateAdminPhone(formatPhoneDisplay(e.target.value));
                        if (e.target.value) setCreateAdminUserId("");
                      }}
                      className={inputClassName}
                      placeholder={PHONE_PLACEHOLDER}
                      aria-label="Телефон администратора"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="org-tariff" className={labelClassName}>
                    Тариф / план
                  </label>
                  <select
                    id="org-tariff"
                    value={createTariffId}
                    onChange={(e) => setCreateTariffId(e.target.value)}
                    className={`${inputClassName} input-select`}
                    aria-label="Выбрать тариф"
                  >
                    <option value="">— Без тарифа —</option>
                    {tariffs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.price != null ? `(${t.price})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="org-start-date" className={labelClassName}>
                    Дата начала подписки
                  </label>
                  <input
                    id="org-start-date"
                    type="date"
                    value={createStartDate}
                    onChange={(e) => setCreateStartDate(e.target.value)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label htmlFor="org-status" className={labelClassName}>
                    Статус компании
                  </label>
                  <select
                    id="org-status"
                    value={createCompanyStatus}
                    onChange={(e) => setCreateCompanyStatus(e.target.value)}
                    className={`${inputClassName} input-select`}
                    aria-label="Статус компании"
                  >
                    {Object.entries(COMPANY_STATUS_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {createError ? (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
                {createError}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createLoading}
                className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none transition"
              >
                {createLoading ? "Создание…" : "Создать"}
              </button>
              <button
                type="button"
                onClick={resetCreateForm}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition"
              >
                Отмена
              </button>
            </div>
          </form>
        </section>
      )}

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-muted">Загрузка…</p>
      ) : (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          {!showArchive ? (
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-medium text-muted">Активные</h2>
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition"
                aria-label="Создать компанию"
              >
                Создать компанию
              </button>
            </div>
          ) : null}
          <div className="overflow-hidden">
          {organizations.length === 0 ? (
            <div className="p-8 text-center text-muted">
              {showArchive ? "В архиве нет компаний." : "Нет компаний. Создайте первую."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-sm font-medium text-muted">Название</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Тариф</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Статус компании</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Статус подписки</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Пользователи</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Подписка до</th>
                    {showArchive ? (
                      <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org) => {
                    const sub = org.subscription;
                    const effectiveSubscriptionStatusKey = getEffectiveSubscriptionStatusKey(sub);
                    return (
                      <tr
                        key={org.id}
                        className="border-b border-border hover:bg-secondary/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          {showArchive ? (
                            <span className="font-medium text-muted">{org.name || "—"}</span>
                          ) : (
                            <Link
                              to={`/panel/companies/${org.id}`}
                              className="font-medium text-muted hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset rounded"
                            >
                              {org.name || "—"}
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {sub?.tariff_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {showArchive || org.is_deleted
                            ? "В архиве"
                            : (COMPANY_STATUS_LABELS[org.company_status] ?? org.company_status)}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {effectiveSubscriptionStatusKey
                            ? SUBSCRIPTION_STATUS_LABELS[effectiveSubscriptionStatusKey] ?? effectiveSubscriptionStatusKey
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted">{org.members_count ?? 0}</td>
                        <td className="px-4 py-3 text-muted">{sub?.end_date ?? "—"}</td>
                        {showArchive ? (
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => handleRestore(org.id)}
                              disabled={restoreLoading}
                              className="text-sm px-2 py-1 rounded border border-primary text-primary hover:bg-primary hover:text-white transition disabled:opacity-50"
                              aria-label={`Восстановить ${org.name || org.id}`}
                            >
                              {restoreId === org.id && restoreLoading ? "Восстановление…" : "Восстановить"}
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminCompanies;
