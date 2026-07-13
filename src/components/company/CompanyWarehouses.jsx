import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { useModalDismiss } from "../../utils/useModalDismiss";

const PAGE_SIZE = 10;

const INPUT_CLASS =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
const LABEL_CLASS = "block text-sm font-medium text-muted mb-1.5";

const CompanyWarehouses = () => {
  const { activeContext, markForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [viewMode, setViewMode] = useState("active"); // "active" | "archived"
  const [archivedWarehouses, setArchivedWarehouses] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedError, setArchivedError] = useState("");
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // "create" | "edit"
  const [modalWarehouseId, setModalWarehouseId] = useState(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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
      setCurrentPage(1);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, markForbiddenAppPage]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    // Смена организации: архив предыдущей компании больше не актуален.
    setViewMode("active");
    setArchivedWarehouses([]);
    setArchivedLoaded(false);
  }, [organizationId]);

  const loadArchivedWarehouses = useCallback(async () => {
    if (!organizationId) return;
    setArchivedLoading(true);
    setArchivedError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/warehouses/?archived=true`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "warehouses");
          setArchivedError("Нет прав.");
          setArchivedWarehouses([]);
          return;
        }
        setArchivedError(data.detail ?? "Ошибка загрузки архива");
        setArchivedWarehouses([]);
        return;
      }
      setArchivedWarehouses(Array.isArray(data) ? data : []);
      setArchivedLoaded(true);
    } catch (err) {
      setArchivedError(err.message ?? "Ошибка сети");
      setArchivedWarehouses([]);
    } finally {
      setArchivedLoading(false);
    }
  }, [organizationId, markForbiddenAppPage]);

  useEffect(() => {
    if (viewMode === "archived" && organizationId && !archivedLoaded) {
      loadArchivedWarehouses();
    }
  }, [viewMode, organizationId, archivedLoaded, loadArchivedWarehouses]);

  const handleRestoreWarehouse = async (warehouseId) => {
    if (!organizationId || !warehouseId) return;
    setRestoringId(warehouseId);
    setArchivedError("");
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/warehouses/${warehouseId}/restore/`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "warehouses");
          setArchivedError("Нет прав.");
          return;
        }
        setArchivedError(data.detail ?? "Ошибка восстановления");
        return;
      }
      setArchivedWarehouses((prev) => prev.filter((w) => w.id !== warehouseId));
      loadWarehouses();
    } catch (err) {
      setArchivedError(err.message ?? "Ошибка сети");
    } finally {
      setRestoringId(null);
    }
  };

  const resetModal = useCallback(() => {
    setShowModal(false);
    setModalMode("create");
    setModalWarehouseId(null);
    setName("");
    setAddress("");
    setIsActive(true);
    setSaveLoading(false);
    setSaveError("");
  }, []);

  const openCreateModal = () => {
    if (!organizationId) return;
    setModalMode("create");
    setModalWarehouseId(null);
    setName("");
    setAddress("");
    setIsActive(true);
    setSaveLoading(false);
    setSaveError("");
    setShowModal(true);
  };

  const openEditModal = (wh) => {
    if (!wh) return;
    setModalMode("edit");
    setModalWarehouseId(wh.id);
    setName(wh.name ?? "");
    setAddress(wh.address ?? "");
    setIsActive(Boolean(wh.is_active));
    setSaveLoading(false);
    setSaveError("");
    setShowModal(true);
  };

  const closeModal = useCallback(() => {
    if (saveLoading) return;
    resetModal();
  }, [saveLoading, resetModal]);

  const modalA11y = useModalDismiss(closeModal, { active: showModal });

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!organizationId) return;
    setSaveError("");
    setSaveLoading(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim(),
        is_active: isActive,
      };
      const isCreate = modalMode === "create";
      const url = isCreate
        ? `platform/organizations/${organizationId}/warehouses/`
        : `platform/organizations/${organizationId}/warehouses/${modalWarehouseId}/`;
      const res = await authFetch(url, {
        method: isCreate ? "POST" : "PATCH",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.name?.[0] ?? data.detail ?? (isCreate ? "Ошибка создания" : "Ошибка обновления"));
        return;
      }
      resetModal();
      loadWarehouses();
    } catch (err) {
      setSaveError(err.message ?? "Ошибка сети");
    } finally {
      setSaveLoading(false);
    }
  };

  const closeDeleteModal = useCallback(() => {
    if (deleteLoading) return;
    setConfirmDeleteId(null);
  }, [deleteLoading]);

  const deleteModalA11y = useModalDismiss(closeDeleteModal, { active: Boolean(confirmDeleteId) });

  const handleDeleteConfirm = async () => {
    if (!organizationId || !confirmDeleteId) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/warehouses/${confirmDeleteId}/`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "warehouses");
          setError("Нет прав.");
          return;
        }
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Ошибка удаления");
        return;
      }
      setConfirmDeleteId(null);
      setArchivedLoaded(false);
      loadWarehouses();
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setDeleteLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(warehouses.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const pagedWarehouses = warehouses.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition"
          aria-label="Добавить склад"
        >
          Добавить склад
        </button>
      </div>

      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Режим просмотра складов">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "active"}
          onClick={() => setViewMode("active")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            viewMode === "active"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-primary"
          }`}
        >
          Активные
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "archived"}
          onClick={() => setViewMode("archived")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            viewMode === "archived"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-primary"
          }`}
        >
          Архив{archivedLoaded && archivedWarehouses.length > 0 ? ` (${archivedWarehouses.length})` : ""}
        </button>
      </div>

      {viewMode === "active" && error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {viewMode === "active" ? (
        loading ? (
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
                  {pagedWarehouses.map((wh) => (
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
                          <button
                            type="button"
                            onClick={() => openEditModal(wh)}
                            className="px-3 py-2 rounded-lg border border-border text-muted hover:bg-secondary hover:text-primary transition"
                            aria-label={`Редактировать ${wh.name ?? wh.id}`}
                          >
                            Редактировать
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(wh.id)}
                            className="px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition"
                            aria-label={`Удалить ${wh.name ?? wh.id}`}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {warehouses.length > PAGE_SIZE ? (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-white">
                <p className="text-sm text-muted">
                  Показано {startIndex + 1}-{Math.min(endIndex, warehouses.length)} из {warehouses.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={safePage === 1}
                    className="px-3 py-2 rounded-lg border border-border text-muted hover:bg-secondary transition disabled:opacity-50 disabled:pointer-events-none"
                    aria-label="Предыдущая страница складов"
                  >
                    Назад
                  </button>
                  <span className="text-sm text-muted">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={safePage >= totalPages}
                    className="px-3 py-2 rounded-lg border border-border text-muted hover:bg-secondary transition disabled:opacity-50 disabled:pointer-events-none"
                    aria-label="Следующая страница складов"
                  >
                    Вперёд
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )
      ) : (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          {archivedError ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4" role="alert">
              {archivedError}
            </p>
          ) : null}

          {archivedLoading ? (
            <p className="text-muted text-sm">Загрузка архива…</p>
          ) : archivedWarehouses.length === 0 ? (
            <p className="text-muted text-sm">В архиве нет удалённых складов.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-sm font-medium text-muted">Название</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Адрес</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedWarehouses.map((wh) => (
                    <tr key={wh.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-muted">{wh.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{wh.address ?? "—"}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleRestoreWarehouse(wh.id)}
                          disabled={restoringId === wh.id}
                          className="px-3 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition disabled:opacity-50"
                          aria-label={`Восстановить ${wh.name ?? wh.id}`}
                        >
                          {restoringId === wh.id ? "Восстановление…" : "Восстановить"}
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

      {showModal ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="warehouse-modal-title"
          onMouseDown={modalA11y.onBackdropMouseDown}
        >
          <div
            ref={modalA11y.dialogRef}
            tabIndex={-1}
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 focus:outline-none"
          >
            <h2 id="warehouse-modal-title" className="text-lg font-medium text-muted mb-4">
              {modalMode === "create" ? "Новый склад" : "Редактировать склад"}
            </h2>
            <form onSubmit={handleModalSubmit} className="space-y-4">
              <div>
                <label htmlFor="wh-name" className={LABEL_CLASS}>
                  Название
                </label>
                <input
                  id="wh-name"
                  type="text"
                  value={name}
                  disabled={saveLoading}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Склад 1"
                  required
                />
              </div>
              <div>
                <label htmlFor="wh-address" className={LABEL_CLASS}>
                  Адрес (необязательно)
                </label>
                <input
                  id="wh-address"
                  type="text"
                  value={address}
                  disabled={saveLoading}
                  onChange={(e) => setAddress(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="г. Ташкент, ул. Примерная, 1"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="wh-active"
                  type="checkbox"
                  checked={isActive}
                  disabled={saveLoading}
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
                  {saveLoading ? "Сохранение…" : modalMode === "create" ? "Создать" : "Сохранить"}
                </button>
                <button
                  type="button"
                  disabled={saveLoading}
                  onClick={closeModal}
                  className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirmDeleteId ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-warehouse-title"
          onMouseDown={deleteModalA11y.onBackdropMouseDown}
        >
          <div
            ref={deleteModalA11y.dialogRef}
            tabIndex={-1}
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6 focus:outline-none"
          >
            <h2 id="remove-warehouse-title" className="text-lg font-medium text-muted mb-2">
              Удалить склад?
            </h2>
            <p className="text-sm text-muted mb-4">Запись будет скрыта из списка (мягкое удаление).</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleteLoading ? "Удаление…" : "Удалить"}
              </button>
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteLoading}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CompanyWarehouses;
