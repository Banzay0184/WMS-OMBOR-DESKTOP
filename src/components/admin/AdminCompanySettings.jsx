import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { authFetch } from "../../api/client";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../../utils/phone";

const TABS = [
  { id: "main", label: "Основная информация" },
  { id: "subscription", label: "Подписка" },
  { id: "admin", label: "Главный администратор" },
  { id: "recovery", label: "Восстановление данных" },
  { id: "activity", label: "Активность" },
  { id: "access", label: "Доступ / блокировка" },
];

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
    // Ожидаемый формат: "YYYY-MM-DD"
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

const AdminCompanySettings = () => {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [companyStatus, setCompanyStatus] = useState("active");
  const [inn, setInn] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [comment, setComment] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [tariffs, setTariffs] = useState([]);
  const [subPatchLoading, setSubPatchLoading] = useState(false);
  const [subExtendDays, setSubExtendDays] = useState("30");
  const [subNewTariffId, setSubNewTariffId] = useState("");
  const [subEndDateEdit, setSubEndDateEdit] = useState("");
  const [assignAdminPhone, setAssignAdminPhone] = useState("");
  const [assignAdminLoading, setAssignAdminLoading] = useState(false);
  const [assignAdminError, setAssignAdminError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [roles, setRoles] = useState([]);
  const [editingAdminId, setEditingAdminId] = useState(null);
  const [editAdminRoleId, setEditAdminRoleId] = useState("");
  const [editAdminLoading, setEditAdminLoading] = useState(false);
  const [confirmRemoveAdminId, setConfirmRemoveAdminId] = useState(null);
  const [removeAdminLoading, setRemoveAdminLoading] = useState(false);
  const [forbiddenOrganization, setForbiddenOrganization] = useState(false);
  const [forbiddenMembers, setForbiddenMembers] = useState(false);
  const [forbiddenRoles, setForbiddenRoles] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState("");
  const [recoveryRestoringKey, setRecoveryRestoringKey] = useState("");
  const [recoveryDeletingKey, setRecoveryDeletingKey] = useState("");
  const [pendingRecoveryDelete, setPendingRecoveryDelete] = useState(null);
  const [archivedMembers, setArchivedMembers] = useState([]);
  const [archivedWarehouses, setArchivedWarehouses] = useState([]);
  const [archivedSuppliers, setArchivedSuppliers] = useState([]);
  const [archivedProducts, setArchivedProducts] = useState([]);
  const [archivedInvoices, setArchivedInvoices] = useState([]);
  const [deletedMarkings, setDeletedMarkings] = useState([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const activeTab = TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : "main";

  const setActiveTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tabId);
    setSearchParams(next);
  };

  const loadOrganization = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError("");
    setForbiddenOrganization(false);
    try {
      const res = await authFetch(`platform/organizations/${companyId}/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setForbiddenOrganization(true);
          setError("Нет прав.");
          setOrganization(null);
          return;
        }
        setError(data.detail ?? "Организация не найдена.");
        setOrganization(null);
        return;
      }
      setOrganization(data);
      setName(data.name ?? "");
      setCompanyStatus(data.company_status ?? "active");
      setInn(data.inn ?? "");
      setPhone(formatPhoneDisplay(data.phone ?? ""));
      setEmail(data.email ?? "");
      setAddress(data.address ?? "");
      setContactPerson(data.contact_person ?? "");
      setComment(data.comment ?? "");
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const loadMembers = useCallback(async () => {
    if (!companyId) return;
    setMembersLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${companyId}/members/`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setForbiddenMembers(true);
        setMembers([]);
        return;
      }
      setForbiddenMembers(false);
      if (res.ok) setMembers(Array.isArray(data) ? data : []);
      else setMembers([]);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [companyId]);

  const loadAudit = useCallback(async () => {
    if (!companyId) return;
    setAuditLoading(true);
    try {
      const res = await authFetch(`platform/audit/?organization=${companyId}&page_size=50`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setAuditLogs(data.results ?? []);
      else setAuditLogs([]);
    } catch {
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (activeTab === "activity" && organization) loadAudit();
  }, [activeTab, organization, loadAudit]);

  useEffect(() => {
    loadOrganization();
  }, [loadOrganization]);

  const effectiveSubscriptionStatusKey = getEffectiveSubscriptionStatusKey(organization?.subscription);
  const subscriptionLooksExpired =
    effectiveSubscriptionStatusKey === "expired" || effectiveSubscriptionStatusKey === "cancelled";

  const loadRoles = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await authFetch(`platform/organizations/${companyId}/roles/`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setForbiddenRoles(true);
        setRoles([]);
        return;
      }
      setForbiddenRoles(false);
      if (res.ok) setRoles(Array.isArray(data.roles) ? data.roles : []);
      else setRoles([]);
    } catch {
      setRoles([]);
    }
  }, [companyId]);

  useEffect(() => {
    if (activeTab === "admin" && organization) {
      loadMembers();
      loadRoles();
    }
  }, [activeTab, organization, loadMembers, loadRoles]);

  const loadRecoveryData = useCallback(async () => {
    if (!companyId) return;
    setRecoveryLoading(true);
    setRecoveryError("");
    try {
      const [membersRes, warehousesRes, suppliersRes, productsRes, invoicesRes, markingsRes] = await Promise.all([
        authFetch(`platform/organizations/${companyId}/members/?archived=true`),
        authFetch(`platform/organizations/${companyId}/warehouses/?archived=true`),
        authFetch(`platform/organizations/${companyId}/suppliers/?archived=true`),
        authFetch(`platform/organizations/${companyId}/products/?archived=true`),
        authFetch(`platform/organizations/${companyId}/invoices/?archived=true&page_size=100`),
        authFetch(`platform/organizations/${companyId}/deleted-markings/`),
      ]);

      const [membersData, warehousesData, suppliersData, productsData, invoicesData, markingsData] = await Promise.all([
        membersRes.json().catch(() => []),
        warehousesRes.json().catch(() => []),
        suppliersRes.json().catch(() => []),
        productsRes.json().catch(() => []),
        invoicesRes.json().catch(() => ({})),
        markingsRes.json().catch(() => []),
      ]);

      if (!membersRes.ok || !warehousesRes.ok || !suppliersRes.ok || !productsRes.ok || !invoicesRes.ok || !markingsRes.ok) {
        const detail =
          membersData?.detail ??
          warehousesData?.detail ??
          suppliersData?.detail ??
          productsData?.detail ??
          invoicesData?.detail ??
          markingsData?.detail ??
          "Не удалось загрузить архивные данные.";
        setRecoveryError(detail);
        setArchivedMembers([]);
        setArchivedWarehouses([]);
        setArchivedSuppliers([]);
        setArchivedProducts([]);
        setArchivedInvoices([]);
        setDeletedMarkings([]);
        return;
      }

      setArchivedMembers(Array.isArray(membersData) ? membersData : []);
      setArchivedWarehouses(Array.isArray(warehousesData) ? warehousesData : []);
      setArchivedSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
      setArchivedProducts(Array.isArray(productsData) ? productsData : []);
      setArchivedInvoices(Array.isArray(invoicesData?.results) ? invoicesData.results : []);
      setDeletedMarkings(Array.isArray(markingsData) ? markingsData : []);
    } catch (err) {
      setRecoveryError(err.message ?? "Ошибка сети");
      setArchivedMembers([]);
      setArchivedWarehouses([]);
      setArchivedSuppliers([]);
      setArchivedProducts([]);
      setArchivedInvoices([]);
      setDeletedMarkings([]);
    } finally {
      setRecoveryLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (activeTab === "recovery" && organization) {
      loadRecoveryData();
    }
  }, [activeTab, organization, loadRecoveryData]);

  const handleSaveSubmit = async (e) => {
    e.preventDefault();
    if (!companyId) return;
    setSaveError("");
    setSaveSuccess("");
    setSaveLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${companyId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || null,
          company_status: companyStatus,
          inn: inn.trim() || null,
          phone: getPhoneDigits(phone) || null,
          email: email.trim() || null,
          address: address.trim() || null,
          contact_person: contactPerson.trim() || null,
          comment: comment.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.name?.[0] ?? data.inn?.[0] ?? data.detail ?? "Ошибка сохранения");
        setSaveLoading(false);
        return;
      }
      setOrganization(data);
      setSaveSuccess("Изменения сохранены.");
      setTimeout(() => setSaveSuccess(""), 3000);
    } catch (err) {
      setSaveError(err.message ?? "Ошибка сети");
    } finally {
      setSaveLoading(false);
    }
  };

  const loadTariffs = useCallback(async () => {
    try {
      const res = await authFetch("platform/tariffs/?is_active=true");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data)) setTariffs(data);
      else setTariffs([]);
    } catch {
      setTariffs([]);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "subscription") loadTariffs();
  }, [activeTab, loadTariffs]);

  useEffect(() => {
    if (activeTab === "subscription" && organization?.subscription?.end_date) {
      const d = organization.subscription.end_date;
      setSubEndDateEdit(typeof d === "string" ? d.slice(0, 10) : d);
    } else if (activeTab === "subscription") {
      setSubEndDateEdit("");
    }
  }, [activeTab, organization?.subscription?.end_date]);

  const handleSubscriptionPatch = async (payload) => {
    const sub = organization?.subscription;
    if (!sub?.id) return;
    setSubPatchLoading(true);
    try {
      const res = await authFetch(`platform/subscriptions/${sub.id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrganization((prev) => (prev ? { ...prev, subscription: data } : null));
      }
    } finally {
      setSubPatchLoading(false);
    }
  };

  const handleAccessStatusChange = async (newStatus) => {
    if (!companyId) return;
    setAccessLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${companyId}/`, {
        method: "PATCH",
        body: JSON.stringify({ company_status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrganization(data);
        setCompanyStatus(data.company_status ?? companyStatus);
      }
    } finally {
      setAccessLoading(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!companyId) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${companyId}/`, {
        method: "DELETE",
      });
      if (res.ok) {
        setShowDeleteConfirm(false);
        navigate("/panel/companies");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAssignFirstAdmin = async (e) => {
    e.preventDefault();
    if (!companyId) return;
    if (forbiddenOrganization || forbiddenMembers || forbiddenRoles) {
      setAssignAdminError("Нет прав.");
      return;
    }
    const ph = getPhoneDigits(assignAdminPhone).trim();
    if (!ph) {
      setAssignAdminError("Укажите номер телефона.");
      return;
    }
    setAssignAdminError("");
    setAssignAdminLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${companyId}/assign-first-admin/`, {
        method: "POST",
        body: JSON.stringify({
          phone: ph,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssignAdminError(data.detail ?? data.phone?.[0] ?? "Ошибка назначения");
        setAssignAdminLoading(false);
        return;
      }
      loadMembers();
      loadOrganization();
      setAssignAdminPhone("");
    } catch (err) {
      setAssignAdminError(err.message ?? "Ошибка сети");
    } finally {
      setAssignAdminLoading(false);
    }
  };

  const adminRoles = roles.filter((r) => ["organization_owner", "organization_admin"].includes(r.code));

  const handleAdminRoleSubmit = async (e) => {
    e.preventDefault();
    if (!companyId || !editingAdminId) return;
    if (forbiddenMembers || forbiddenRoles) return;
    const rolePayload = adminRoles.find((r) => r.id === parseInt(editAdminRoleId, 10))?.code ?? editAdminRoleId;
    if (!rolePayload) return;
    setEditAdminLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${companyId}/members/${editingAdminId}/`,
        { method: "PATCH", body: JSON.stringify({ role: rolePayload }) }
      );
      if (res.ok) {
        setEditingAdminId(null);
        loadMembers();
      }
    } catch {
      // ignore
    } finally {
      setEditAdminLoading(false);
    }
  };

  const handleAdminToggleActive = async (member) => {
    if (!companyId) return;
    if (forbiddenMembers || forbiddenRoles) return;
    try {
      const res = await authFetch(
        `platform/organizations/${companyId}/members/${member.id}/`,
        { method: "PATCH", body: JSON.stringify({ is_active: !member.is_active }) }
      );
      if (res.ok) loadMembers();
    } catch {
      // ignore
    }
  };

  const handleAdminRemoveConfirm = async () => {
    if (!companyId || !confirmRemoveAdminId) return;
    if (forbiddenMembers || forbiddenRoles) return;
    setRemoveAdminLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${companyId}/members/${confirmRemoveAdminId}/`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setConfirmRemoveAdminId(null);
        loadMembers();
        loadOrganization();
      }
    } catch {
      // ignore
    } finally {
      setRemoveAdminLoading(false);
    }
  };

  const handleRestoreData = async (entity, id) => {
    if (!companyId || !entity || !id) return;
    setRecoveryError("");
    setRecoverySuccess("");
    const key = `${entity}-${id}`;
    setRecoveryRestoringKey(key);
    try {
      const res = await authFetch(`platform/organizations/${companyId}/restore-data/`, {
        method: "POST",
        body: JSON.stringify({ entity, id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRecoveryError(data.detail ?? "Не удалось восстановить запись.");
        setRecoveryRestoringKey("");
        return;
      }
      setRecoverySuccess("Запись успешно восстановлена.");
      setTimeout(() => setRecoverySuccess(""), 2500);
      await loadRecoveryData();
      if (entity === "member") loadMembers();
    } catch (err) {
      setRecoveryError(err.message ?? "Ошибка сети");
    } finally {
      setRecoveryRestoringKey("");
    }
  };

  const handleDeleteDataForever = async (entity, id) => {
    if (!companyId || !entity || !id) return;
    setPendingRecoveryDelete({ entity, id });
  };

  const handleConfirmDeleteDataForever = async () => {
    if (!companyId || !pendingRecoveryDelete?.entity || !pendingRecoveryDelete?.id) return;
    const { entity, id } = pendingRecoveryDelete;
    setPendingRecoveryDelete(null);

    setRecoveryError("");
    setRecoverySuccess("");
    const key = `${entity}-${id}`;
    setRecoveryDeletingKey(key);
    try {
      const res = await authFetch(`platform/organizations/${companyId}/delete-data-forever/`, {
        method: "POST",
        body: JSON.stringify({ entity, id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRecoveryError(data.detail ?? "Не удалось удалить запись навсегда.");
        setRecoveryDeletingKey("");
        return;
      }
      setRecoverySuccess("Запись удалена навсегда.");
      setTimeout(() => setRecoverySuccess(""), 2500);
      await loadRecoveryData();
    } catch (err) {
      setRecoveryError(err.message ?? "Ошибка сети");
    } finally {
      setRecoveryDeletingKey("");
    }
  };

  const inputClassName =
    "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
  const labelClassName = "block text-sm font-medium text-muted mb-1.5";

  if (loading) {
    return (
      <div className="space-y-6">
        <p className="text-muted">Загрузка…</p>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error || "Организация не найдена."}
        </p>
        <button
          type="button"
          onClick={() => navigate("/panel/companies")}
          className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition"
        >
          К списку компаний
        </button>
      </div>
    );
  }

  const auditActionLabels = {
    organization_created: "Создана компания",
    organization_updated: "Обновлена компания",
    organization_deleted: "Компания удалена",
    first_admin_assigned: "Назначен первый админ",
    member_added: "Добавлен участник",
    member_updated: "Обновлён участник",
    member_removed: "Удалён из компании",
    invitation_created: "Создано приглашение",
    warehouse_created: "Создан склад",
    warehouse_updated: "Обновлён склад",
    warehouse_deleted: "Удалён склад",
    member_restored: "Восстановлен участник",
    warehouse_restored: "Восстановлен склад",
    supplier_restored: "Восстановлен поставщик",
    catalog_product_restored: "Восстановлен товар",
    invoice_restored: "Счёт‑фактура восстановлена",
    marking_restored: "Маркировка восстановлена",
    member_hard_deleted: "Участник удалён навсегда",
    warehouse_hard_deleted: "Склад удалён навсегда",
    supplier_hard_deleted: "Поставщик удалён навсегда",
    catalog_product_hard_deleted: "Товар удалён навсегда",
    invoice_hard_deleted: "Счёт‑фактура удалена навсегда",
    marking_hard_deleted: "Маркировка удалена навсегда",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => navigate("/panel/companies")}
          className="text-muted hover:text-primary transition"
          aria-label="Назад к списку компаний"
        >
          ← Компании
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-muted">
          {organization.name || "—"}
        </h1>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Вкладки">
        {TABS.map((tab) => (
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

      {activeTab === "main" && (
      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-4">Основная информация</h2>
        <dl className="grid gap-3 sm:grid-cols-2 max-w-2xl mb-6">
          <div>
            <dt className="text-sm text-muted">Тариф</dt>
            <dd className="font-medium text-muted">{organization.subscription?.tariff_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Статус подписки</dt>
            <dd className="font-medium text-muted">
              {effectiveSubscriptionStatusKey
                ? SUBSCRIPTION_STATUS_LABELS[effectiveSubscriptionStatusKey] ?? effectiveSubscriptionStatusKey
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Подписка до</dt>
            <dd className="font-medium text-muted">{organization.subscription?.end_date ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Сотрудников</dt>
            <dd className="font-medium text-muted">{organization.members_count ?? 0}</dd>
          </div>
        </dl>
        <form onSubmit={handleSaveSubmit} className="space-y-4 max-w-md">
          <div>
            <label htmlFor="company-name" className={labelClassName}>Название</label>
            <input id="company-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClassName} placeholder="Название организации" />
          </div>
          <div>
            <label htmlFor="company-inn" className={labelClassName}>ИНН</label>
            <input id="company-inn" type="text" value={inn} onChange={(e) => setInn(e.target.value)} className={inputClassName} placeholder="ИНН" />
          </div>
          <div>
            <label htmlFor="company-phone" className={labelClassName}>Телефон</label>
            <input id="company-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(formatPhoneDisplay(e.target.value))} className={inputClassName} placeholder={PHONE_PLACEHOLDER} aria-label="Телефон компании" />
          </div>
          <div>
            <label htmlFor="company-email" className={labelClassName}>Email</label>
            <input id="company-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClassName} placeholder="email@example.com" />
          </div>
          <div>
            <label htmlFor="company-address" className={labelClassName}>Адрес</label>
            <input id="company-address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClassName} placeholder="Адрес" />
          </div>
          <div>
            <label htmlFor="company-contact-person" className={labelClassName}>Контактное лицо</label>
            <input id="company-contact-person" type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={inputClassName} placeholder="ФИО" />
          </div>
          <div>
            <label htmlFor="company-comment" className={labelClassName}>Комментарий</label>
            <textarea id="company-comment" value={comment} onChange={(e) => setComment(e.target.value)} className={inputClassName} placeholder="Комментарий" rows={2} />
          </div>
          <div>
            <label htmlFor="company-status" className={labelClassName}>Статус компании</label>
            <select id="company-status" value={companyStatus} onChange={(e) => setCompanyStatus(e.target.value)} className={`${inputClassName} input-select`} aria-label="Статус компании">
              {Object.entries(COMPANY_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          {saveError ? <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">{saveError}</p> : null}
          {saveSuccess ? <p className="text-sm text-green-600" role="status">{saveSuccess}</p> : null}
          <button type="submit" disabled={saveLoading} className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none transition">
            {saveLoading ? "Сохранение…" : "Сохранить"}
          </button>
        </form>
      </section>
      )}

      {activeTab === "admin" && (
      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-4">Главный администратор</h2>
        <p className="text-sm text-muted mb-4">
          Введите номер телефона. Если пользователь уже есть в системе — он будет назначен администратором компании. Если нет — создаётся приглашение; после регистрации он станет администратором.
        </p>
        {!forbiddenOrganization && !forbiddenMembers && !forbiddenRoles ? (
          <form onSubmit={handleAssignFirstAdmin} className="space-y-4 max-w-md">
            <div>
              <label htmlFor="assign-admin-phone" className={labelClassName}>Телефон</label>
              <input
                id="assign-admin-phone"
                type="tel"
                inputMode="numeric"
                value={assignAdminPhone}
                onChange={(e) => setAssignAdminPhone(formatPhoneDisplay(e.target.value))}
                className={inputClassName}
                placeholder={PHONE_PLACEHOLDER}
                required
                aria-label="Телефон администратора"
              />
            </div>
            {assignAdminError ? <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">{assignAdminError}</p> : null}
            <button type="submit" disabled={assignAdminLoading} className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50">
              {assignAdminLoading ? "Назначение…" : "Назначить администратора компании"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
            Нет прав для управления администраторами компании.
          </p>
        )}
        {forbiddenMembers || forbiddenRoles ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-6" role="alert">
            Нет прав для управления участниками/ролями.
          </p>
        ) : membersLoading ? (
          <p className="text-muted text-sm mt-6">Загрузка…</p>
        ) : members.filter((m) => ["organization_owner", "organization_admin"].includes(m.role_code)).length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted mb-2">Текущие администраторы</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-sm font-medium text-muted">Телефон</th>
                    <th className="px-3 py-2 text-sm font-medium text-muted">ФИО</th>
                    <th className="px-3 py-2 text-sm font-medium text-muted">Роль</th>
                    <th className="px-3 py-2 text-sm font-medium text-muted">Статус</th>
                    <th className="px-3 py-2 text-sm font-medium text-muted">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {members.filter((m) => ["organization_owner", "organization_admin"].includes(m.role_code)).map((m) => (
                    <tr key={m.id} className="border-b border-border">
                      <td className="px-3 py-2 text-muted">{m.user_phone ?? "—"}</td>
                      <td className="px-3 py-2 text-muted">{m.user_full_name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted">{m.role_name ?? m.role_code ?? "—"}</td>
                      <td className="px-3 py-2 text-muted">{m.is_active ? "Активен" : "Доступ отключён"}</td>
                      <td className="px-3 py-2">
                        {!forbiddenMembers && !forbiddenRoles ? (
                          <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (forbiddenMembers || forbiddenRoles) return;
                              setEditingAdminId(m.id);
                              setEditAdminRoleId(m.role_id?.toString() ?? "");
                            }}
                            className="text-sm px-2 py-1 rounded border border-border text-muted hover:bg-secondary transition"
                          >
                            Изменить роль
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdminToggleActive(m)}
                            className="text-sm px-2 py-1 rounded border border-border text-muted hover:bg-secondary transition"
                          >
                            {m.is_active ? "Отключить доступ" : "Включить доступ"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (forbiddenMembers || forbiddenRoles) return;
                              setConfirmRemoveAdminId(m.id);
                            }}
                            className="text-sm px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition"
                          >
                            Удалить из компании
                          </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
      )}

      {activeTab === "subscription" && (
      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-4">Подписка</h2>
        {organization.subscription ? (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 max-w-2xl mb-6">
              <div>
                <dt className="text-sm text-muted">Тариф</dt>
                <dd className="font-medium text-muted">{organization.subscription.tariff_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Статус подписки</dt>
                <dd className="font-medium text-muted">
                  {effectiveSubscriptionStatusKey
                    ? SUBSCRIPTION_STATUS_LABELS[effectiveSubscriptionStatusKey] ?? effectiveSubscriptionStatusKey
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Дата начала</dt>
                <dd className="font-medium text-muted">{organization.subscription.start_date ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Дата окончания</dt>
                <dd className="font-medium text-muted">{organization.subscription.end_date ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Пробный период</dt>
                <dd className="font-medium text-muted">{organization.subscription.is_trial ? "Да" : "Нет"}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-4 items-end border-t border-border pt-4">
              <div>
                <label htmlFor="sub-extend-days" className={labelClassName}>Продлить на (дней)</label>
                <div className="flex gap-2">
                  <input
                    id="sub-extend-days"
                    type="number"
                    min={1}
                    value={subExtendDays}
                    onChange={(e) => setSubExtendDays(e.target.value)}
                    className={inputClassName + " w-24"}
                  />
                  <button
                    type="button"
                    disabled={subPatchLoading}
                    onClick={() => handleSubscriptionPatch({ extend_days: Number(subExtendDays) || 30 })}
                    className="px-4 py-2.5 rounded-lg border border-border text-muted hover:bg-primary hover:text-white hover:border-primary transition disabled:opacity-50"
                  >
                    Продлить
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="sub-end-date-edit" className={labelClassName}>Изменить дату окончания</label>
                <p className="text-xs text-muted mb-1">Если ошибочно продлили — укажите нужную дату и нажмите «Применить».</p>
                <div className="flex gap-2">
                  <input
                    id="sub-end-date-edit"
                    type="date"
                    value={subEndDateEdit}
                    onChange={(e) => setSubEndDateEdit(e.target.value)}
                    className={inputClassName + " w-44"}
                    aria-label="Дата окончания подписки"
                  />
                  <button
                    type="button"
                    disabled={subPatchLoading || !subEndDateEdit}
                    onClick={() => handleSubscriptionPatch({ end_date: subEndDateEdit })}
                    className="px-4 py-2.5 rounded-lg border border-border text-muted hover:bg-primary hover:text-white hover:border-primary transition disabled:opacity-50"
                  >
                    Применить
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="sub-new-tariff" className={labelClassName}>Сменить тариф</label>
                <div className="flex gap-2">
                  <select
                    id="sub-new-tariff"
                    value={subNewTariffId}
                    onChange={(e) => setSubNewTariffId(e.target.value)}
                    className={`${inputClassName} input-select min-w-[140px]`}
                    aria-label="Сменить тариф"
                  >
                    <option value="">— Выберите тариф —</option>
                    {tariffs.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={subPatchLoading || !subNewTariffId}
                    onClick={() => handleSubscriptionPatch({ tariff_id: Number(subNewTariffId) })}
                    className="px-4 py-2.5 rounded-lg border border-border text-muted hover:bg-primary hover:text-white hover:border-primary transition disabled:opacity-50"
                  >
                    Сменить тариф
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {subscriptionLooksExpired ? (
                  <button
                    type="button"
                    disabled={subPatchLoading}
                    onClick={() => handleSubscriptionPatch({ subscription_status: "active" })}
                    className="px-4 py-2.5 rounded-lg border border-border text-muted hover:bg-primary hover:text-white hover:border-primary transition disabled:opacity-50"
                  >
                    Включить подписку
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={subPatchLoading}
                    onClick={() => handleSubscriptionPatch({ subscription_status: "cancelled" })}
                    className="px-4 py-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                  >
                    Отключить подписку
                  </button>
                )}
                {effectiveSubscriptionStatusKey !== "cancelled" && effectiveSubscriptionStatusKey !== "expired" && (
                  <button
                    type="button"
                    disabled={subPatchLoading}
                    onClick={() => handleSubscriptionPatch({ is_trial: !organization.subscription?.is_trial })}
                    className="px-4 py-2.5 rounded-lg border border-border text-muted hover:bg-secondary transition disabled:opacity-50"
                  >
                    {organization.subscription?.is_trial ? "Снять trial" : "Включить trial"}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-muted text-sm">Подписка не найдена.</p>
        )}
      </section>
      )}

      {activeTab === "activity" && (
      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-4">Активность</h2>
        {auditLoading ? (
          <p className="text-muted text-sm">Загрузка…</p>
        ) : auditLogs.length === 0 ? (
          <p className="text-muted text-sm">Нет записей.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-sm font-medium text-muted">Дата</th>
                  <th className="px-3 py-2 text-sm font-medium text-muted">Пользователь</th>
                  <th className="px-3 py-2 text-sm font-medium text-muted">Действие</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((row) => (
                  <tr key={row.id} className="border-b border-border">
                    <td className="px-3 py-2 text-muted text-sm">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">{row.user_phone ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{auditActionLabels[row.action] ?? row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {activeTab === "recovery" && (
      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-2">Восстановление удалённых данных</h2>
        <p className="text-sm text-muted mb-4">
          Здесь можно восстановить данные, удалённые компанией: сотрудников, склады, поставщиков и товары.
        </p>

        {recoveryError ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4" role="alert">
            {recoveryError}
          </p>
        ) : null}
        {recoverySuccess ? (
          <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 mb-4" role="status">
            {recoverySuccess}
          </p>
        ) : null}

        {recoveryLoading ? (
          <p className="text-sm text-muted">Загрузка архивных данных…</p>
        ) : (
          <div className="space-y-6">
            <div className="border border-border rounded-lg p-4">
              <h3 className="text-base font-medium text-muted mb-3">Сотрудники ({archivedMembers.length})</h3>
              {archivedMembers.length === 0 ? (
                <p className="text-sm text-muted">Нет удалённых сотрудников.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-2 text-sm font-medium text-muted">Телефон</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">ФИО</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Роль</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedMembers.map((row) => {
                        const rowKey = `member-${row.id}`;
                        return (
                          <tr key={row.id} className="border-b border-border">
                            <td className="px-2 py-2 text-sm text-muted">{row.user_phone ?? "—"}</td>
                            <td className="px-2 py-2 text-sm text-muted">{row.user_full_name ?? "—"}</td>
                            <td className="px-2 py-2 text-sm text-muted">{row.role_name ?? row.role_code ?? "—"}</td>
                            <td className="px-2 py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRestoreData("member", row.id)}
                                  disabled={recoveryRestoringKey === rowKey || recoveryDeletingKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary hover:text-white transition disabled:opacity-50"
                                >
                                  {recoveryRestoringKey === rowKey ? "Восстановление…" : "Восстановить"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDataForever("member", row.id)}
                                  disabled={recoveryDeletingKey === rowKey || recoveryRestoringKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                >
                                  {recoveryDeletingKey === rowKey ? "Удаление…" : "Удалить навсегда"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg p-4">
              <h3 className="text-base font-medium text-muted mb-3">Склады ({archivedWarehouses.length})</h3>
              {archivedWarehouses.length === 0 ? (
                <p className="text-sm text-muted">Нет удалённых складов.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-2 text-sm font-medium text-muted">Название</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Адрес</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedWarehouses.map((row) => {
                        const rowKey = `warehouse-${row.id}`;
                        return (
                          <tr key={row.id} className="border-b border-border">
                            <td className="px-2 py-2 text-sm text-muted">{row.name ?? "—"}</td>
                            <td className="px-2 py-2 text-sm text-muted">{row.address ?? "—"}</td>
                            <td className="px-2 py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRestoreData("warehouse", row.id)}
                                  disabled={recoveryRestoringKey === rowKey || recoveryDeletingKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary hover:text-white transition disabled:opacity-50"
                                >
                                  {recoveryRestoringKey === rowKey ? "Восстановление…" : "Восстановить"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDataForever("warehouse", row.id)}
                                  disabled={recoveryDeletingKey === rowKey || recoveryRestoringKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                >
                                  {recoveryDeletingKey === rowKey ? "Удаление…" : "Удалить навсегда"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg p-4">
              <h3 className="text-base font-medium text-muted mb-3">Поставщики ({archivedSuppliers.length})</h3>
              {archivedSuppliers.length === 0 ? (
                <p className="text-sm text-muted">Нет удалённых поставщиков.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-2 text-sm font-medium text-muted">Название</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">ИНН</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedSuppliers.map((row) => {
                        const rowKey = `supplier-${row.id}`;
                        return (
                          <tr key={row.id} className="border-b border-border">
                            <td className="px-2 py-2 text-sm text-muted">{row.name ?? "—"}</td>
                            <td className="px-2 py-2 text-sm text-muted">{row.inn ?? "—"}</td>
                            <td className="px-2 py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRestoreData("supplier", row.id)}
                                  disabled={recoveryRestoringKey === rowKey || recoveryDeletingKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary hover:text-white transition disabled:opacity-50"
                                >
                                  {recoveryRestoringKey === rowKey ? "Восстановление…" : "Восстановить"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDataForever("supplier", row.id)}
                                  disabled={recoveryDeletingKey === rowKey || recoveryRestoringKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                >
                                  {recoveryDeletingKey === rowKey ? "Удаление…" : "Удалить навсегда"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg p-4">
              <h3 className="text-base font-medium text-muted mb-3">Товары ({archivedProducts.length})</h3>
              {archivedProducts.length === 0 ? (
                <p className="text-sm text-muted">Нет удалённых товаров.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-2 text-sm font-medium text-muted">Название</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">ИКПУ</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedProducts.map((row) => {
                        const rowKey = `product-${row.id}`;
                        return (
                          <tr key={row.id} className="border-b border-border">
                            <td className="px-2 py-2 text-sm text-muted">{row.name ?? "—"}</td>
                            <td className="px-2 py-2 text-sm text-muted">{row.ikpu_code ?? "—"}</td>
                            <td className="px-2 py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRestoreData("product", row.id)}
                                  disabled={recoveryRestoringKey === rowKey || recoveryDeletingKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary hover:text-white transition disabled:opacity-50"
                                >
                                  {recoveryRestoringKey === rowKey ? "Восстановление…" : "Восстановить"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDataForever("product", row.id)}
                                  disabled={recoveryDeletingKey === rowKey || recoveryRestoringKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                >
                                  {recoveryDeletingKey === rowKey ? "Удаление…" : "Удалить навсегда"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg p-4">
              <h3 className="text-base font-medium text-muted mb-3">Счёт‑фактуры прихода ({archivedInvoices.length})</h3>
              {archivedInvoices.length === 0 ? (
                <p className="text-sm text-muted">Нет удалённых счёт‑фактур.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-2 text-sm font-medium text-muted">Номер счёта</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Номер договора</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Поставщик</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedInvoices.map((row) => {
                        const rowKey = `invoice-${row.id}`;
                        return (
                          <tr key={row.id} className="border-b border-border">
                            <td className="px-2 py-2 text-sm text-muted">{row.invoice_number || "—"}</td>
                            <td className="px-2 py-2 text-sm text-muted">{row.contract_number || "—"}</td>
                            <td className="px-2 py-2 text-sm text-muted">{row.supplier_name || "—"}</td>
                            <td className="px-2 py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRestoreData("invoice", row.id)}
                                  disabled={recoveryRestoringKey === rowKey || recoveryDeletingKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary hover:text-white transition disabled:opacity-50"
                                >
                                  {recoveryRestoringKey === rowKey ? "Восстановление…" : "Восстановить"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDataForever("invoice", row.id)}
                                  disabled={recoveryDeletingKey === rowKey || recoveryRestoringKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                >
                                  {recoveryDeletingKey === rowKey ? "Удаление…" : "Удалить навсегда"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg p-4">
              <h3 className="text-base font-medium text-muted mb-3">Удалённая маркировка ({deletedMarkings.length})</h3>
              {deletedMarkings.length === 0 ? (
                <p className="text-sm text-muted">Нет удалённых кодов маркировки.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-2 text-sm font-medium text-muted">Код маркировки</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Счёт</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Товар</th>
                        <th className="px-2 py-2 text-sm font-medium text-muted">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedMarkings.map((row) => {
                        const rowKey = `marking-${row.id}`;
                        return (
                          <tr key={row.id} className="border-b border-border">
                            <td className="px-2 py-2 text-sm text-muted">{row.marking_code || "—"}</td>
                            <td className="px-2 py-2 text-sm text-muted">{row.invoice_number || row.contract_number || "—"}</td>
                            <td className="px-2 py-2 text-sm text-muted">{row.our_name || row.ikpu_code || "—"}</td>
                            <td className="px-2 py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRestoreData("marking", row.id)}
                                  disabled={recoveryRestoringKey === rowKey || recoveryDeletingKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary hover:text-white transition disabled:opacity-50"
                                >
                                  {recoveryRestoringKey === rowKey ? "Восстановление…" : "Восстановить"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDataForever("marking", row.id)}
                                  disabled={recoveryDeletingKey === rowKey || recoveryRestoringKey === rowKey}
                                  className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                >
                                  {recoveryDeletingKey === rowKey ? "Удаление…" : "Удалить навсегда"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
      )}

      {activeTab === "access" && (
      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-4">Доступ / блокировка</h2>
        <p className="text-sm text-muted mb-4">
          Текущий статус: <strong>{COMPANY_STATUS_LABELS[organization.company_status] ?? organization.company_status}</strong>
        </p>
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            type="button"
            disabled={accessLoading || organization.company_status === "blocked"}
            onClick={() => handleAccessStatusChange("blocked")}
            className="px-4 py-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Заблокировать компанию"
          >
            Заблокировать
          </button>
          <button
            type="button"
            disabled={accessLoading || organization.company_status === "active"}
            onClick={() => handleAccessStatusChange("active")}
            className="px-4 py-2.5 rounded-lg border border-border text-muted hover:bg-primary hover:text-white hover:border-primary transition disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Разблокировать компанию"
          >
            Разблокировать
          </button>
        </div>
        <div className="border-t border-border pt-6">
          <h3 className="text-sm font-medium text-muted mb-2">Удаление компании</h3>
          <p className="text-sm text-muted mb-3">
            Компания будет помечена как удалённая и исчезнет из списка. Данные сохраняются в системе.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition"
            aria-label="Удалить компанию"
          >
            Удалить компанию
          </button>
        </div>
      </section>
      )}

      {editingAdminId && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-admin-role-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6">
            <h2 id="edit-admin-role-title" className="text-lg font-medium text-muted mb-4">
              Изменить роль администратора
            </h2>
            <form onSubmit={handleAdminRoleSubmit} className="space-y-4">
              <div>
                <label htmlFor="edit-admin-role" className={labelClassName}>
                  Роль
                </label>
                <select
                  id="edit-admin-role"
                  value={editAdminRoleId}
                  onChange={(e) => setEditAdminRoleId(e.target.value)}
                  className={inputClassName}
                  required
                  aria-label="Роль"
                >
                  <option value="">Выберите роль</option>
                  {adminRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name || r.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={editAdminLoading}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition disabled:opacity-50"
                >
                  {editAdminLoading ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAdminId(null)}
                  className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary transition"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmRemoveAdminId && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-admin-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6">
            <h2 id="remove-admin-title" className="text-lg font-medium text-muted mb-2">
              Удалить администратора из компании?
            </h2>
            <p className="text-sm text-muted mb-4">
              Он потеряет доступ к этой компании. Аккаунт в системе сохранится.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAdminRemoveConfirm}
                disabled={removeAdminLoading}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {removeAdminLoading ? "Удаление…" : "Удалить"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemoveAdminId(null)}
                disabled={removeAdminLoading}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary transition"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-company-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6">
            <h2 id="delete-company-title" className="text-lg font-medium text-muted mb-2">
              Удалить компанию?
            </h2>
            <p className="text-sm text-muted mb-4">
              Компания «{organization?.name || "—"}» будет помечена как удалённая и исчезнет из списка компаний. Отменить действие можно только через админку.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeleteCompany}
                disabled={deleteLoading}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:pointer-events-none"
              >
                {deleteLoading ? "Удаление…" : "Удалить"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary transition disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRecoveryDelete ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recovery-delete-forever-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6">
            <h2 id="recovery-delete-forever-title" className="text-lg font-medium text-muted mb-2">
              Удалить навсегда?
            </h2>
            <p className="text-sm text-muted mb-4">
              Запись будет удалена окончательно без возможности восстановления.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmDeleteDataForever}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Удалить навсегда
              </button>
              <button
                type="button"
                onClick={() => setPendingRecoveryDelete(null)}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary transition"
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

export default AdminCompanySettings;
