import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../../utils/phone";

const INPUT_CLASS =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
const LABEL_CLASS = "block text-sm font-medium text-muted mb-1.5";

const normalizeInn = (value) => (value || "").replace(/\D/g, "");

const CompanySuppliers = () => {
  const { activeContext, markForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbiddenSuppliers, setForbiddenSuppliers] = useState(false);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [modalSupplierId, setModalSupplierId] = useState(null);
  const [modalName, setModalName] = useState("");
  const [modalInn, setModalInn] = useState("");
  const [modalPhone, setModalPhone] = useState("");
  const [modalAddress, setModalAddress] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");

  const [confirmDeleteSupplierId, setConfirmDeleteSupplierId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadSuppliers = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    setForbiddenSuppliers(false);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/suppliers/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setForbiddenSuppliers(true);
          markForbiddenAppPage?.(organizationId, "suppliers");
          setError("Нет прав.");
          setSuppliers([]);
          return;
        }
        setError(data.detail ?? "Ошибка загрузки");
        setSuppliers([]);
        return;
      }
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, markForbiddenAppPage]);

  useEffect(() => {
    if (organizationId) loadSuppliers();
    else {
      setSuppliers([]);
      setLoading(false);
    }
  }, [organizationId, loadSuppliers]);

  const resetModal = useCallback(() => {
    setShowSupplierModal(false);
    setModalMode("create");
    setModalSupplierId(null);
    setModalName("");
    setModalInn("");
    setModalPhone("");
    setModalAddress("");
    setModalLoading(false);
    setModalError("");
    setModalSuccess("");
  }, []);

  const openCreateModal = () => {
    if (!organizationId) return;
    if (forbiddenSuppliers) {
      setModalError("Нет прав.");
      return;
    }
    setModalMode("create");
    setModalSupplierId(null);
    setModalName("");
    setModalInn("");
    setModalPhone("");
    setModalAddress("");
    setModalLoading(false);
    setModalError("");
    setModalSuccess("");
    setShowSupplierModal(true);
  };

  const openEditModal = (supplier) => {
    if (!supplier) return;
    if (forbiddenSuppliers) {
      setModalError("Нет прав.");
      return;
    }
    setModalMode("edit");
    setModalSupplierId(supplier.id);
    setModalName(supplier.name ?? "");
    setModalInn(supplier.inn ?? "");
    setModalPhone(formatPhoneDisplay(supplier.phone ?? ""));
    setModalAddress(supplier.address ?? "");
    setModalLoading(false);
    setModalError("");
    setModalSuccess("");
    setShowSupplierModal(true);
  };

  const handleSupplierModalSubmit = async (e) => {
    e.preventDefault();
    if (!organizationId) return;
    if (forbiddenSuppliers) {
      setModalError("Нет прав.");
      return;
    }

    const normalizedInn = normalizeInn(modalInn);
    const nextName = modalName.trim();
    if (!nextName) {
      setModalError("Введите название поставщика.");
      return;
    }
    if (!normalizedInn) {
      setModalError("Введите ИНН (только цифры).");
      return;
    }

    setModalLoading(true);
    setModalError("");
    setModalSuccess("");
    try {
      if (modalMode === "create") {
        const res = await authFetch(`platform/organizations/${organizationId}/suppliers/`, {
          method: "POST",
          body: JSON.stringify({
            name: nextName,
            inn: normalizedInn,
            phone: getPhoneDigits(modalPhone),
            address: modalAddress.trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403) {
            setForbiddenSuppliers(true);
            markForbiddenAppPage?.(organizationId, "suppliers");
            setModalError("Нет прав.");
            return;
          }
          setModalError(data.detail ?? data.inn?.[0] ?? "Ошибка создания");
          return;
        }
        setModalSuccess("Поставщик создан.");
      } else {
        const res = await authFetch(
          `platform/organizations/${organizationId}/suppliers/${modalSupplierId}/`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: nextName,
              inn: normalizedInn,
              phone: getPhoneDigits(modalPhone),
              address: modalAddress.trim(),
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403) {
            setForbiddenSuppliers(true);
            markForbiddenAppPage?.(organizationId, "suppliers");
            setModalError("Нет прав.");
            return;
          }
          setModalError(data.detail ?? data.inn?.[0] ?? "Ошибка обновления");
          return;
        }
        setModalSuccess("Поставщик обновлён.");
      }

      // небольшая пауза для UX
      setTimeout(() => {
        resetModal();
        loadSuppliers();
      }, 500);
    } catch (err) {
      setModalError(err.message ?? "Ошибка сети");
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!organizationId || !confirmDeleteSupplierId) return;
    if (forbiddenSuppliers) return;

    setDeleteLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/suppliers/${confirmDeleteSupplierId}/`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        if (res.status === 403) {
          setForbiddenSuppliers(true);
          markForbiddenAppPage?.(organizationId, "suppliers");
          setError("Нет прав.");
          return;
        }
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Ошибка удаления");
        return;
      }
      setConfirmDeleteSupplierId(null);
      loadSuppliers();
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-muted">Поставщики</h1>
        <p className="text-muted">Выберите организацию в контексте.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-muted">Поставщики</h1>
        <p className="text-muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-muted">Поставщики</h1>
          <p className="text-muted text-sm mt-1">Управление поставщиками, отгружающими товар на ваш склад.</p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          disabled={forbiddenSuppliers}
          className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition disabled:opacity-50 disabled:pointer-events-none"
          aria-label="Добавить поставщика"
        >
          Добавить
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {suppliers.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted shadow-sm">
          Нет поставщиков. Добавьте первого.
        </div>
      ) : (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-sm font-medium text-muted">Название</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">ИНН</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">Телефон</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">Адрес</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted">{s.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{s.inn ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {getPhoneDigits(s.phone) ? formatPhoneDisplay(s.phone) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-[200px] truncate" title={s.address ?? ""}>
                      {s.address?.trim() ? s.address : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(s)}
                          disabled={forbiddenSuppliers}
                          className="px-3 py-2 rounded-lg border border-border text-muted hover:bg-secondary hover:text-primary transition disabled:opacity-50 disabled:pointer-events-none"
                          aria-label={`Редактировать ${s.name ?? "поставщика"}`}
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSupplierId(s.id)}
                          disabled={forbiddenSuppliers}
                          className="px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50 disabled:pointer-events-none"
                          aria-label={`Удалить ${s.name ?? "поставщика"}`}
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
        </section>
      )}

      {showSupplierModal ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="supplier-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h2 id="supplier-modal-title" className="text-lg font-medium text-muted mb-4">
              {modalMode === "create" ? "Новый поставщик" : "Редактировать поставщика"}
            </h2>

            <form onSubmit={handleSupplierModalSubmit} className="space-y-4">
              <div>
                <label htmlFor="supplier-name" className={LABEL_CLASS}>
                  Название
                </label>
                <input
                  id="supplier-name"
                  type="text"
                  value={modalName}
                  disabled={modalLoading}
                  onChange={(e) => setModalName(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Название"
                  aria-label="Название поставщика"
                />
              </div>

              <div>
                <label htmlFor="supplier-inn" className={LABEL_CLASS}>
                  ИНН
                </label>
                <input
                  id="supplier-inn"
                  type="text"
                  inputMode="numeric"
                  value={modalInn}
                  disabled={modalLoading}
                  onChange={(e) => setModalInn(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Например: 123456789012"
                  aria-label="ИНН поставщика"
                />
                <p className="text-xs text-muted mt-1">ИНН уникален в организации: один ИНН — один поставщик.</p>
              </div>

              <div>
                <label htmlFor="supplier-phone" className={LABEL_CLASS}>
                  Телефон (необязательно)
                </label>
                <input
                  id="supplier-phone"
                  type="tel"
                  inputMode="numeric"
                  value={modalPhone}
                  disabled={modalLoading}
                  onChange={(e) => setModalPhone(formatPhoneDisplay(e.target.value))}
                  className={INPUT_CLASS}
                  placeholder={PHONE_PLACEHOLDER}
                  aria-label="Телефон поставщика"
                />
              </div>

              <div>
                <label htmlFor="supplier-address" className={LABEL_CLASS}>
                  Адрес (необязательно)
                </label>
                <input
                  id="supplier-address"
                  type="text"
                  value={modalAddress}
                  disabled={modalLoading}
                  onChange={(e) => setModalAddress(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Адрес"
                  aria-label="Адрес поставщика"
                />
              </div>

              {modalError ? (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
                  {modalError}
                </p>
              ) : null}

              {modalSuccess ? (
                <p className="text-sm text-green-600" role="status">
                  {modalSuccess}
                </p>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition disabled:opacity-50"
                >
                  {modalLoading ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  disabled={modalLoading}
                  onClick={resetModal}
                  className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirmDeleteSupplierId ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-supplier-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6">
            <h2 id="remove-supplier-title" className="text-lg font-medium text-muted mb-2">
              Удалить поставщика?
            </h2>
            <p className="text-sm text-muted mb-4">
              Поставщик будет удален из списка. История данных будет сохранена.
            </p>
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
                onClick={() => setConfirmDeleteSupplierId(null)}
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

export default CompanySuppliers;

