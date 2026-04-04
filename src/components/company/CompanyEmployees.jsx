import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../../utils/phone";

const CompanyEmployees = () => {
  const { activeContext, markForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addFullName, setAddFullName] = useState("");
  const [addRoleId, setAddRoleId] = useState("");
  const [addIsActive, setAddIsActive] = useState(true);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [addTemporaryPassword, setAddTemporaryPassword] = useState("");
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editMemberRoleId, setEditMemberRoleId] = useState("");
  const [editMemberLoading, setEditMemberLoading] = useState(false);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState(null);
  const [removeMemberLoading, setRemoveMemberLoading] = useState(false);
  const [forbiddenOrganization, setForbiddenOrganization] = useState(false);
  const [forbiddenMembers, setForbiddenMembers] = useState(false);
  const [forbiddenRoles, setForbiddenRoles] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    setForbiddenMembers(false);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/members/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setForbiddenMembers(true);
          markForbiddenAppPage?.(organizationId, "employees");
          setError("Нет прав.");
          setMembers([]);
          return;
        }
        setError(data.detail ?? "Ошибка загрузки");
        setMembers([]);
        return;
      }
      setMembers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const loadRoles = useCallback(async () => {
    if (!organizationId) return;
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/roles/`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setForbiddenRoles(true);
        markForbiddenAppPage?.(organizationId, "roles");
        setRoles([]);
        return;
      }
      setForbiddenRoles(false);
      if (res.ok) setRoles(Array.isArray(data.roles) ? data.roles : []);
      else setRoles([]);
    } catch {
      setRoles([]);
    }
  }, [organizationId]);

  const loadOrganization = useCallback(async () => {
    if (!organizationId) return;
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setForbiddenOrganization(true);
        markForbiddenAppPage?.(organizationId, "employees");
        setOrganization(null);
        return;
      }
      setForbiddenOrganization(false);
      if (res.ok) setOrganization(data);
      else setOrganization(null);
    } catch {
      setOrganization(null);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      loadMembers();
      loadRoles();
      loadOrganization();
    } else {
      setMembers([]);
      setOrganization(null);
      setLoading(false);
    }
  }, [organizationId, loadMembers, loadRoles, loadOrganization]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!organizationId) return;
    if (forbiddenMembers || forbiddenRoles || forbiddenOrganization) {
      setAddError("Нет прав.");
      return;
    }
    const rolePayload = addRoleId ? (roles.find((r) => r.id === parseInt(addRoleId, 10))?.code ?? addRoleId) : null;
    if (!rolePayload) {
      setAddError("Выберите роль");
      return;
    }
    setAddError("");
    setAddSuccess("");
    setAddLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/members/`, {
        method: "POST",
        body: JSON.stringify({
          phone: getPhoneDigits(addPhone) || addPhone.trim(),
          full_name: addFullName.trim() || undefined,
          role: rolePayload,
          is_active: addIsActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(data.phone?.[0] ?? data.detail ?? "Ошибка добавления");
        setAddLoading(false);
        return;
      }
      if (data.type === "user_created") {
        setAddSuccess("Аккаунт создан. Передайте сотруднику временный пароль для входа:");
        setAddTemporaryPassword(data.temporary_password ?? "");
      } else {
        setAddSuccess("Сотрудник добавлен в компанию.");
        setAddTemporaryPassword("");
      }
      setAddPhone("");
      setAddFullName("");
      setAddRoleId(roles[0]?.id?.toString() ?? "");
      setAddIsActive(true);
      loadMembers();
      loadOrganization();
      if (data.type !== "user_created") {
        setTimeout(() => {
          setShowAddModal(false);
          setAddSuccess("");
        }, 2000);
      }
    } catch (err) {
      setAddError(err.message ?? "Ошибка сети");
    } finally {
      setAddLoading(false);
    }
  };

  const openAddModal = () => {
    if (forbiddenMembers || forbiddenRoles || forbiddenOrganization) {
      setAddError("Нет прав.");
      return;
    }
    setShowAddModal(true);
    setAddPhone("");
    setAddFullName("");
    setAddRoleId(roles[0]?.id?.toString() ?? "");
    setAddIsActive(true);
    setAddError("");
    setAddSuccess("");
    setAddTemporaryPassword("");
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddError("");
    setAddSuccess("");
    setAddTemporaryPassword("");
  };

  const handleMemberRoleSubmit = async (e) => {
    e.preventDefault();
    if (!organizationId || !editingMemberId) return;
    const rolePayload = roles.find((r) => r.id === parseInt(editMemberRoleId, 10))?.code ?? editMemberRoleId;
    if (!rolePayload) return;
    setEditMemberLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/members/${editingMemberId}/`,
        { method: "PATCH", body: JSON.stringify({ role: rolePayload }) }
      );
      if (res.ok) {
        setEditingMemberId(null);
        loadMembers();
      }
    } catch {
      // ignore
    } finally {
      setEditMemberLoading(false);
    }
  };

  const handleMemberToggleActive = async (member) => {
    if (!organizationId) return;
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/members/${member.id}/`,
        { method: "PATCH", body: JSON.stringify({ is_active: !member.is_active }) }
      );
      if (res.ok) loadMembers();
    } catch {
      // ignore
    }
  };

  const handleMemberRemoveConfirm = async () => {
    if (!organizationId || !confirmRemoveMemberId) return;
    setRemoveMemberLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/members/${confirmRemoveMemberId}/`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setConfirmRemoveMemberId(null);
        loadMembers();
      }
    } catch {
      // ignore
    } finally {
      setRemoveMemberLoading(false);
    }
  };

  const maxUsers = organization?.subscription?.tariff_max_users ?? null;
  const membersCount = organization?.members_count ?? members.length;
  const limitReached =
    maxUsers != null && typeof maxUsers === "number" && membersCount >= maxUsers;

  const inputClassName =
    "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
  const labelClassName = "block text-sm font-medium text-muted mb-1.5";

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-muted">Сотрудники</h1>
        <p className="text-muted">Выберите организацию в контексте.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-muted">Сотрудники</h1>
        {!forbiddenMembers && !forbiddenOrganization ? (
          <button
            type="button"
            onClick={openAddModal}
            disabled={limitReached}
            className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Добавить сотрудника"
          >
            Добавить сотрудника
          </button>
        ) : null}
      </div>

      {limitReached ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2" role="alert">
          Достигнут лимит пользователей по вашему тарифу ({maxUsers}). Чтобы добавить сотрудников, смените тариф в настройках подписки.
        </p>
      ) : null}

      {forbiddenMembers || forbiddenOrganization ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          Нет прав для управления сотрудниками.
        </p>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-muted">Загрузка…</p>
      ) : members.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted">
          Нет сотрудников.
          {!forbiddenMembers && !forbiddenOrganization ? (
            <>
              {" "}
              Нажмите «Добавить сотрудника», чтобы указать ФИО, телефон и роль.
            </>
          ) : null}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-sm font-medium text-muted">Телефон</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">ФИО</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">Роль</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">Статус</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted">{m.user_phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{m.user_full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{m.role_name ?? m.role_code ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{m.is_active ? "Активен" : "Доступ отключён"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {!forbiddenMembers && !forbiddenRoles && m.role_code !== "organization_owner" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMemberId(m.id);
                                setEditMemberRoleId(m.role_id?.toString() ?? "");
                              }}
                              className="text-sm px-2 py-1 rounded border border-border text-muted hover:bg-secondary transition"
                            >
                              Изменить роль
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMemberToggleActive(m)}
                              className="text-sm px-2 py-1 rounded border border-border text-muted hover:bg-secondary transition"
                            >
                              {m.is_active ? "Отключить доступ" : "Включить доступ"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveMemberId(m.id)}
                              className="text-sm px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition"
                            >
                              Удалить сотрудника
                            </button>
                          </>
                        ) : null}
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
          aria-labelledby="add-employee-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6">
            <h2 id="add-employee-title" className="text-lg font-medium text-muted mb-4">
              Добавить сотрудника
            </h2>
            <p className="text-sm text-muted mb-4">
              Укажите ФИО, номер телефона и роль. Если пользователь уже есть в системе — он будет добавлен в компанию. Если нет — для него будет создан аккаунт (временный пароль появится после добавления).
            </p>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label htmlFor="add-fullname" className={labelClassName}>
                  ФИО
                </label>
                <input
                  id="add-fullname"
                  type="text"
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                  className={inputClassName}
                  placeholder="Иван Иванов"
                  aria-label="ФИО сотрудника"
                />
              </div>
              <div>
                <label htmlFor="add-phone" className={labelClassName}>
                  Телефон
                </label>
                <input
                  id="add-phone"
                  type="tel"
                  inputMode="numeric"
                  value={addPhone}
                  onChange={(e) => setAddPhone(formatPhoneDisplay(e.target.value))}
                  className={inputClassName}
                  placeholder={PHONE_PLACEHOLDER}
                  required
                  aria-label="Телефон сотрудника"
                />
              </div>
              <div>
                <label htmlFor="add-role" className={labelClassName}>
                  Роль
                </label>
                <select
                  id="add-role"
                  value={addRoleId}
                  onChange={(e) => setAddRoleId(e.target.value)}
                  className={`${inputClassName} input-select`}
                  required
                  aria-label="Роль"
                >
                  <option value="">Выберите роль</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name || r.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="add-is-active"
                  type="checkbox"
                  checked={addIsActive}
                  onChange={(e) => setAddIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  aria-label="Доступ активен"
                />
                <label htmlFor="add-is-active" className="text-sm font-medium text-muted cursor-pointer">
                  Доступ активен
                </label>
              </div>
              {addError ? (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
                  {addError}
                </p>
              ) : null}
              {addSuccess ? (
                <div className="space-y-2" role="status">
                  <p className="text-sm text-green-600">{addSuccess}</p>
                  {addTemporaryPassword ? (
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Временный пароль</label>
                      <input
                        type="text"
                        readOnly
                        value={addTemporaryPassword}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 font-mono text-sm"
                        aria-label="Временный пароль для сотрудника"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none transition"
                >
                  {addLoading ? "Отправка…" : "Добавить"}
                </button>
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition"
                >
                  Закрыть
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingMemberId && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-role-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6">
            <h2 id="edit-role-title" className="text-lg font-medium text-muted mb-4">
              Изменить роль
            </h2>
            <form onSubmit={handleMemberRoleSubmit} className="space-y-4">
              <div>
                <label htmlFor="edit-member-role" className={labelClassName}>
                  Роль
                </label>
                <select
                  id="edit-member-role"
                  value={editMemberRoleId}
                  onChange={(e) => setEditMemberRoleId(e.target.value)}
                  className={`${inputClassName} input-select`}
                  required
                  aria-label="Роль"
                >
                  <option value="">Выберите роль</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name || r.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={editMemberLoading}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition disabled:opacity-50"
                >
                  {editMemberLoading ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingMemberId(null)}
                  className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary transition"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmRemoveMemberId && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-member-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6">
            <h2 id="remove-member-title" className="text-lg font-medium text-muted mb-2">
              Удалить сотрудника?
            </h2>
            <p className="text-sm text-muted mb-4">
              Сотрудник будет удалён из компании. Его аккаунт в системе сохранится.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleMemberRemoveConfirm}
                disabled={removeMemberLoading}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {removeMemberLoading ? "Удаление…" : "Удалить"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemoveMemberId(null)}
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

export default CompanyEmployees;
