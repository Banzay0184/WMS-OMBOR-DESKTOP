import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../../utils/phone";

const CompanySettings = () => {
  const { activeContext, markForbiddenAppPage, clearForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [canViewCompany, setCanViewCompany] = useState(false);
  const [canEditCompany, setCanEditCompany] = useState(false);

  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [comment, setComment] = useState("");

  const [companyStatus, setCompanyStatus] = useState("draft");
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const COMPANY_STATUS_LABELS = {
    draft: "Черновик",
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
    if (endDate && today && endDate < today) return "expired";

    return sub.subscription_status ?? null;
  };

  const effectiveSubscriptionStatusKey = getEffectiveSubscriptionStatusKey(subscriptionInfo);

  const loadMyPermissions = useCallback(async () => {
    if (!organizationId) return;
    setPermissionsLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/me/permissions/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCanViewCompany(false);
        setCanEditCompany(false);
        return;
      }
      const perms = Array.isArray(data?.permissions) ? data.permissions : [];
      const canView = perms.includes("company.view");
      const canEdit = perms.includes("company.edit");
      setCanViewCompany(canView);
      setCanEditCompany(canEdit);
      setIsReadOnly(!canEdit);
      if (canView) {
        clearForbiddenAppPage?.(organizationId, "company_settings");
      }
    } catch {
      setCanViewCompany(false);
      setCanEditCompany(false);
    } finally {
      setPermissionsLoading(false);
    }
  }, [organizationId]);

  const loadOrganization = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "company_settings");
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
      setInn(data.inn ?? "");
      setPhone(formatPhoneDisplay(data.phone ?? ""));
      setEmail(data.email ?? "");
      setAddress(data.address ?? "");
      setContactPerson(data.contact_person ?? "");
      setComment(data.comment ?? "");
      setCompanyStatus(data.company_status ?? "draft");
      setSubscriptionInfo(data.subscription ?? null);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadMyPermissions();
  }, [loadMyPermissions]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!organizationId) return;
    if (!canViewCompany) {
      markForbiddenAppPage?.(organizationId, "company_settings");
      setError("Нет прав.");
      setOrganization(null);
      setLoading(false);
      return;
    }
    loadOrganization();
  }, [permissionsLoading, organizationId, canViewCompany, loadOrganization]);

  const handleSaveSubmit = async (e) => {
    e.preventDefault();
    if (!organizationId) return;
    if (isReadOnly) {
      setSaveError("Нет прав.");
      setSaveSuccess("");
      return;
    }
    setSaveError("");
    setSaveSuccess("");
    setSaveLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || null,
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
        if (res.status === 403) {
          setIsReadOnly(true);
          setSaveError("Нет прав.");
          setSaveLoading(false);
          return;
        }
        setSaveError(data.name?.[0] ?? data.detail ?? "Ошибка сохранения");
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

  const inputClassName =
    "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
  const labelClassName = "block text-sm font-medium text-muted mb-1.5";
  const disabledHint = isReadOnly ? "Форма доступна только для чтения." : null;

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-muted">Настройки компании</h1>
        <p className="text-muted">Выберите организацию в контексте.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-muted">Настройки компании</h1>
        <p className="text-muted">Загрузка…</p>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-muted">Настройки компании</h1>
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error || "Организация не найдена."}
        </p>
        <Link
          to="/app"
          className="inline-block px-4 py-2.5 rounded-lg border border-border text-muted hover:bg-secondary hover:border-primary hover:text-primary transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Назад
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-muted">Настройки компании</h1>

      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-4">Основные данные</h2>

        {disabledHint ? (
          <p className="text-sm text-muted mb-4" role="status" aria-label="Форма в режиме чтения">
            {disabledHint}
          </p>
        ) : null}

        <form onSubmit={handleSaveSubmit} className="space-y-4 max-w-xl">
          <div>
            <label htmlFor="company-name" className={labelClassName}>
              Название
            </label>
            <input
              id="company-name"
              type="text"
              value={name}
              disabled={isReadOnly}
              onChange={(e) => setName(e.target.value)}
              className={inputClassName}
              placeholder="Название организации"
              aria-label="Название организации"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="company-inn" className={labelClassName}>
                ИНН
              </label>
              <input
                id="company-inn"
                type="text"
                value={inn}
                disabled={isReadOnly}
                onChange={(e) => setInn(e.target.value)}
                className={inputClassName}
                placeholder="ИНН"
                aria-label="ИНН"
              />
            </div>

            <div>
              <label htmlFor="company-phone" className={labelClassName}>
                Телефон
              </label>
              <input
                id="company-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                disabled={isReadOnly}
                onChange={(e) => setPhone(formatPhoneDisplay(e.target.value))}
                className={inputClassName}
                placeholder={PHONE_PLACEHOLDER}
                aria-label="Телефон компании"
              />
            </div>

            <div>
              <label htmlFor="company-email" className={labelClassName}>
                Email
              </label>
              <input
                id="company-email"
                type="email"
                value={email}
                disabled={isReadOnly}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClassName}
                placeholder="email@example.com"
                aria-label="Email компании"
              />
            </div>

            <div>
              <label htmlFor="company-contact-person" className={labelClassName}>
                Контактное лицо
              </label>
              <input
                id="company-contact-person"
                type="text"
                value={contactPerson}
                disabled={isReadOnly}
                onChange={(e) => setContactPerson(e.target.value)}
                className={inputClassName}
                placeholder="Контактное лицо"
                aria-label="Контактное лицо"
              />
            </div>
          </div>

          <div>
            <label htmlFor="company-address" className={labelClassName}>
              Адрес
            </label>
            <input
              id="company-address"
              type="text"
              value={address}
              disabled={isReadOnly}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClassName}
              placeholder="Адрес"
              aria-label="Адрес компании"
            />
          </div>

          <div>
            <label htmlFor="company-comment" className={labelClassName}>
              Комментарий
            </label>
            <textarea
              id="company-comment"
              value={comment}
              disabled={isReadOnly}
              onChange={(e) => setComment(e.target.value)}
              className={inputClassName + " min-h-[96px] resize-y"}
              placeholder="Комментарий"
              aria-label="Комментарий компании"
            />
          </div>

          <div className="pt-2 border-t border-border">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted mb-1">Статус компании</p>
                <p className="font-medium text-muted">
                  {COMPANY_STATUS_LABELS[companyStatus] ?? companyStatus}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm text-muted mb-1">Подписка</p>
                <p className="font-medium text-muted">
                  {effectiveSubscriptionStatusKey
                    ? SUBSCRIPTION_STATUS_LABELS[effectiveSubscriptionStatusKey] ?? effectiveSubscriptionStatusKey
                    : "—"}
                </p>
                <p className="text-sm text-muted">
                  {subscriptionInfo?.end_date ?? "—"}
                </p>
              </div>
            </div>
          </div>

          {saveError ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {saveError}
            </p>
          ) : null}

          {saveSuccess ? (
            <p className="text-sm text-green-600" role="status">
              {saveSuccess}
            </p>
          ) : null}

          {!isReadOnly ? (
            <button
              type="submit"
              disabled={saveLoading}
              className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none transition"
              aria-label="Сохранить изменения компании"
            >
              {saveLoading ? "Сохранение…" : "Сохранить"}
            </button>
          ) : null}
        </form>
      </section>

    </div>
  );
};

export default CompanySettings;
