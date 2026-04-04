import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";

const CompanyWarehouses = () => {
  const { activeContext, markForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadWarehouses = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/warehouses/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "warehouses");
          setError("Нет прав.");
          setWarehouses([]);
          return;
        }
        setError(data.detail ?? "Ошибка загрузки");
        setWarehouses([]);
        return;
      }
      setWarehouses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!organizationId) return;
    setSaveError("");
    setSaveLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/warehouses/`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || undefined,
          is_active: isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.name?.[0] ?? data.detail ?? "Ошибка создания");
        setSaveLoading(false);
        return;
      }
      setShowAddModal(false);
      setName("");
      setAddress("");
      setIsActive(true);
      loadWarehouses();
    } catch (err) {
      setSaveError(err.message ?? "Ошибка сети");
    } finally {
      setSaveLoading(false);
    }
  };

  const inputClassName =
    "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
  const labelClassName = "block text-sm font-medium text-muted mb-1.5";

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-muted">Склады компании</h1>
        <p className="text-muted">Выберите организацию в контексте.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-muted">Склады компании</h1>
        <button
          type="button"
          onClick={() => {
            setShowAddModal(true);
            setName("");
            setAddress("");
            setIsActive(true);
            setSaveError("");
          }}
          className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition"
          aria-label="Добавить склад"
        >
          Добавить склад
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-muted">Загрузка…</p>
      ) : warehouses.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted shadow-sm">
          Нет складов. Добавьте первый склад.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-sm font-medium text-muted">Название</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">Адрес</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">Активен</th>
                      <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((wh) => (
                  <tr key={wh.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted">{wh.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{wh.address ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{wh.is_active ? "Да" : "Нет"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              to={`/app/warehouses/${wh.id}`}
                              className="px-3 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition"
                              aria-label={`Открыть склад ${wh.name ?? wh.id}`}
                            >
                              Склад
                            </Link>
                          </div>
                        </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-warehouse-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6">
            <h2 id="add-warehouse-title" className="text-lg font-medium text-muted mb-4">
              Новый склад
            </h2>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label htmlFor="wh-name" className={labelClassName}>
                  Название
                </label>
                <input
                  id="wh-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClassName}
                  placeholder="Склад 1"
                  required
                />
              </div>
              <div>
                <label htmlFor="wh-address" className={labelClassName}>
                  Адрес (необязательно)
                </label>
                <input
                  id="wh-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={inputClassName}
                  placeholder="г. Ташкент, ул. Примерная, 1"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="wh-active"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="wh-active" className="text-sm text-muted">
                  Активен
                </label>
              </div>
              {saveError ? (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
                  {saveError}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none transition"
                >
                  {saveLoading ? "Создание…" : "Создать"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition"
                >
                  Закрыть
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyWarehouses;
