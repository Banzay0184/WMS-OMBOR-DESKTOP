import { useState, useEffect, useCallback } from "react";
import { authFetch } from "../../api/client";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../../utils/phone";

const AdminUsers = () => {
  const [data, setData] = useState({ results: [], count: 0, next: null, previous: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [filterStaff, setFilterStaff] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createPhone, setCreatePhone] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createIsActive, setCreateIsActive] = useState(true);
  const [createIsStaff, setCreateIsStaff] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleteUserId, setDeleteUserId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (searchDebounced) params.set("search", searchDebounced);
    if (filterStaff === "yes") params.set("is_staff", "true");
    if (filterStaff === "no") params.set("is_staff", "false");
    if (filterActive === "yes") params.set("is_active", "true");
    if (filterActive === "no") params.set("is_active", "false");
    params.set("page_size", "20");
    try {
      const res = await authFetch(`platform/users/?${params.toString()}`);
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
  }, [searchDebounced, filterStaff, filterActive]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError("");
    const phoneDigits = getPhoneDigits(createPhone).trim();
    if (!phoneDigits) {
      setCreateError("Введите номер телефона.");
      return;
    }
    if (!createPassword.trim()) {
      setCreateError("Введите пароль.");
      return;
    }
    setCreateLoading(true);
    try {
      const res = await authFetch("platform/users/", {
        method: "POST",
        body: JSON.stringify({
          phone: phoneDigits,
          username: createUsername.trim() || undefined,
          password: createPassword,
          is_active: createIsActive,
          is_staff: createIsStaff,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(json.phone?.[0] ?? json.password?.[0] ?? json.detail ?? "Ошибка создания");
        setCreateLoading(false);
        return;
      }
      setShowCreateForm(false);
      setCreatePhone("");
      setCreateUsername("");
      setCreatePassword("");
      setCreateIsActive(true);
      setCreateIsStaff(false);
      loadUsers();
    } catch (err) {
      setCreateError(err.message ?? "Ошибка сети");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteUserId) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(`platform/users/${deleteUserId}/`, { method: "DELETE" });
      if (res.ok) {
        setDeleteUserId(null);
        loadUsers();
      }
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  };

  const inputClassName =
    "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
  const labelClassName = "block text-sm font-medium text-muted mb-1.5";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-muted">Глобальные пользователи</h1>
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition"
          aria-label="Создать пользователя"
        >
          Создать пользователя
        </button>
      </div>

      {showCreateForm && (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-medium text-muted mb-4">Новый пользователь</h2>
          <form onSubmit={handleCreateSubmit} className="space-y-4 max-w-md">
            <div>
              <label htmlFor="create-phone" className={labelClassName}>
                Телефон
              </label>
              <input
                id="create-phone"
                type="tel"
                value={createPhone}
                onChange={(e) => setCreatePhone(formatPhoneDisplay(e.target.value))}
                className={inputClassName}
                placeholder={PHONE_PLACEHOLDER}
                required
                aria-label="Телефон"
              />
            </div>
            <div>
              <label htmlFor="create-username" className={labelClassName}>
                Имя пользователя
              </label>
              <input
                id="create-username"
                type="text"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                className={inputClassName}
                placeholder="Если не указано, будет использован номер телефона"
                aria-label="Имя пользователя"
              />
              <p className="text-xs text-muted mt-1">Если не указано, будет использован номер телефона.</p>
            </div>
            <div>
              <label htmlFor="create-password" className={labelClassName}>
                Пароль
              </label>
              <input
                id="create-password"
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                className={inputClassName}
                placeholder="Пароль"
                required
                minLength={1}
                aria-label="Пароль"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="create-is-active"
                type="checkbox"
                checked={createIsActive}
                onChange={(e) => setCreateIsActive(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="create-is-active" className="text-sm text-muted">
                Активен
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="create-is-staff"
                type="checkbox"
                checked={createIsStaff}
                onChange={(e) => setCreateIsStaff(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="create-is-staff" className="text-sm text-muted">
                Доступ к платформе (сотрудник платформы)
              </label>
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
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError("");
                  setCreatePhone("");
                  setCreateUsername("");
                  setCreatePassword("");
                  setCreateIsActive(true);
                  setCreateIsStaff(false);
                }}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition"
              >
                Отмена
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="flex flex-wrap gap-4 items-end">
        <div className="min-w-[200px] max-w-sm">
          <label htmlFor="users-search" className={labelClassName}>
            Поиск (телефон, имя)
          </label>
          <input
            id="users-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClassName}
            placeholder="+998..."
          />
        </div>
        <div>
          <label htmlFor="filter-staff" className={labelClassName}>
            Доступ к платформе
          </label>
          <select
            id="filter-staff"
            value={filterStaff}
            onChange={(e) => setFilterStaff(e.target.value)}
            className={`${inputClassName} input-select`}
            aria-label="Доступ к платформе"
          >
            <option value="">Все</option>
            <option value="yes">Да</option>
            <option value="no">Нет</option>
          </select>
        </div>
        <div>
          <label htmlFor="filter-active" className={labelClassName}>
            Активен
          </label>
          <select
            id="filter-active"
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            className={`${inputClassName} input-select`}
            aria-label="Активен"
          >
            <option value="">Все</option>
            <option value="yes">Да</option>
            <option value="no">Нет</option>
          </select>
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
            <div className="p-8 text-center text-muted">Нет пользователей</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-sm font-medium text-muted">Пользователь</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Телефон</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Компании (роли)</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Платформа</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Активен</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((u) => (
                    <tr key={u.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-muted">{u.username ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{u.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">
                        {(u.memberships ?? []).length === 0
                          ? "—"
                          : (u.memberships ?? [])
                              .map((m) => `${m.organization_name || m.organization_id} (${m.role_name || m.role_code})`)
                              .join(", ")}
                      </td>
                      <td className="px-4 py-3 text-muted">{u.is_staff ? "Да" : "Нет"}</td>
                      <td className="px-4 py-3 text-muted">{u.is_active ? "Да" : "Нет"}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDeleteUserId(u.id)}
                          className="text-sm px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition"
                          aria-label={`Удалить пользователя ${u.username ?? u.phone ?? u.id}`}
                        >
                          Удалить навсегда
                        </button>
                      </td>
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

      {deleteUserId && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-user-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6">
            <h2 id="delete-user-title" className="text-lg font-medium text-muted mb-2">
              Удалить пользователя навсегда?
            </h2>
            <p className="text-sm text-muted mb-4">
              Пользователь будет удалён из системы и исчезнет из списка. Его записи в компаниях останутся в истории.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleteLoading ? "Удаление…" : "Удалить навсегда"}
              </button>
              <button
                type="button"
                onClick={() => setDeleteUserId(null)}
                disabled={deleteLoading}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary transition"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
