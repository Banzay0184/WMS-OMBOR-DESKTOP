import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";

const INPUT_CLASS =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
const LABEL_CLASS = "block text-sm font-medium text-muted mb-1.5";

const CompanyRoles = () => {
  const { activeContext, markForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [roles, setRoles] = useState([]);
  const [permissionBlocks, setPermissionBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPermissions, setCreatePermissions] = useState([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPermissions, setEditPermissions] = useState([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const [confirmDeleteRoleId, setConfirmDeleteRoleId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadRoles = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/roles/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "roles");
          setError("Нет прав.");
          setRoles([]);
          setPermissionBlocks([]);
          return;
        }
        setError(data.detail ?? "Ошибка загрузки");
        setRoles([]);
        setPermissionBlocks([]);
        return;
      }
      const allRoles = Array.isArray(data.roles) ? data.roles : [];
      setRoles(allRoles.filter((role) => !role?.is_system));
      setPermissionBlocks(Array.isArray(data.permission_blocks) ? data.permission_blocks : []);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setRoles([]);
      setPermissionBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) loadRoles();
    else {
      setRoles([]);
      setPermissionBlocks([]);
      setLoading(false);
    }
  }, [organizationId, loadRoles]);

  const togglePermission = (code, selected, setSelected) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!organizationId) return;
    const name = createName.trim();
    if (!name) {
      setCreateError("Введите название роли");
      return;
    }
    setCreateError("");
    setCreateLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/roles/`, {
        method: "POST",
        body: JSON.stringify({ name, permissions: createPermissions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data.detail ?? data.permissions?.[0] ?? "Ошибка создания");
        setCreateLoading(false);
        return;
      }
      setShowCreateModal(false);
      setCreateName("");
      setCreatePermissions([]);
      loadRoles();
    } catch (err) {
      setCreateError(err.message ?? "Ошибка сети");
    } finally {
      setCreateLoading(false);
    }
  };

  const openEditModal = (role) => {
    if (!role || !role.is_editable) return;
    setEditingRoleId(role.id);
    setEditName(role.name || "");
    setEditPermissions(Array.isArray(role.permissions) ? [...role.permissions] : []);
    setEditError("");
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!organizationId || !editingRoleId) return;
    const name = editName.trim();
    if (!name) {
      setEditError("Введите название роли");
      return;
    }
    setEditError("");
    setEditLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/roles/${editingRoleId}/`,
        {
          method: "PATCH",
          body: JSON.stringify({ name, permissions: editPermissions }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data.detail ?? data.permissions?.[0] ?? "Ошибка сохранения");
        setEditLoading(false);
        return;
      }
      setEditingRoleId(null);
      loadRoles();
    } catch (err) {
      setEditError(err.message ?? "Ошибка сети");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!organizationId || !confirmDeleteRoleId) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/roles/${confirmDeleteRoleId}/`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? "Ошибка удаления");
      } else {
        setConfirmDeleteRoleId(null);
        loadRoles();
      }
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-muted">Роли компании</h1>
        <p className="text-muted">Выберите организацию в контексте.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-muted">Роли компании</h1>
          <p className="text-muted text-sm mt-1">
            Здесь отображаются только ваши роли компании. Вы можете создавать, редактировать и удалять их вручную.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreateModal(true);
            setCreateName("");
            setCreatePermissions([]);
            setCreateError("");
          }}
          className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition"
          aria-label="Создать роль"
        >
          Создать роль
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-muted">Загрузка…</p>
      ) : roles.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted">
          Нет ролей
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <ul className="divide-y divide-border">
            {roles.map((role) => {
              return (
                <li
                  key={role.id}
                  className="px-4 py-3 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-muted flex items-center gap-2 flex-wrap">
                        <span>{role.name || role.code || "—"}</span>
                      </div>
                      {role.description ? (
                        <div className="text-sm text-muted mt-1">{role.description}</div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {role.is_editable ? (
                        <button
                          type="button"
                          onClick={() => openEditModal(role)}
                          className="text-sm px-2 py-1 rounded border border-border text-muted hover:bg-secondary transition"
                          aria-label="Изменить роль"
                        >
                          Изменить
                        </button>
                      ) : null}
                      {role.is_deletable ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteRoleId(role.id)}
                          className="text-sm px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition"
                          aria-label="Удалить роль"
                        >
                          Удалить
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-role-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6">
            <h2 id="create-role-title" className="text-lg font-medium text-muted mb-4">
              Создать роль
            </h2>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label htmlFor="create-name" className={LABEL_CLASS}>
                  Название
                </label>
                <input
                  id="create-name"
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Например: Старший кладовщик"
                  required
                  aria-label="Название роли"
                />
              </div>
              <div>
                <span className={LABEL_CLASS}>Разрешения</span>
                <div className="space-y-3 border border-border rounded-lg p-3 bg-secondary/20">
                  {permissionBlocks.map((block) => (
                    <div key={block.group}>
                      <div className="text-sm font-medium text-muted mb-1.5">{block.label}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {(block.permissions || []).map((p) => (
                          <label key={p.code} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={createPermissions.includes(p.code)}
                              onChange={() =>
                                togglePermission(p.code, createPermissions, setCreatePermissions)
                              }
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                              aria-label={p.label}
                            />
                            <span className="text-sm text-muted">{p.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {createError ? (
                <p className="text-sm text-red-600" role="alert">
                  {createError}
                </p>
              ) : null}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-border text-muted hover:bg-secondary transition"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition"
                >
                  {createLoading ? "Создание…" : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingRoleId !== null && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-role-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6">
            <h2 id="edit-role-title" className="text-lg font-medium text-muted mb-4">
              Редактировать роль
            </h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label htmlFor="edit-name" className={LABEL_CLASS}>
                  Название
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={INPUT_CLASS}
                  required
                  aria-label="Название роли"
                />
              </div>
              <div>
                <span className={LABEL_CLASS}>Разрешения</span>
                <div className="space-y-3 border border-border rounded-lg p-3 bg-secondary/20">
                  {permissionBlocks.map((block) => (
                    <div key={block.group}>
                      <div className="text-sm font-medium text-muted mb-1.5">{block.label}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {(block.permissions || []).map((p) => (
                          <label key={p.code} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editPermissions.includes(p.code)}
                              onChange={() =>
                                togglePermission(p.code, editPermissions, setEditPermissions)
                              }
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                              aria-label={p.label}
                            />
                            <span className="text-sm text-muted">{p.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {editError ? (
                <p className="text-sm text-red-600" role="alert">
                  {editError}
                </p>
              ) : null}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingRoleId(null)}
                  className="px-4 py-2 rounded-lg border border-border text-muted hover:bg-secondary transition"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition"
                >
                  {editLoading ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteRoleId !== null && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-role-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6">
            <h2 id="delete-role-title" className="text-lg font-medium text-muted mb-2">
              Удалить роль?
            </h2>
            <p className="text-sm text-muted mb-4">
              Если роль назначена сотрудникам, удаление будет невозможно. Сначала переназначьте их на другую роль.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDeleteRoleId(null)}
                className="px-4 py-2 rounded-lg border border-border text-muted hover:bg-secondary transition"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition"
              >
                {deleteLoading ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyRoles;
