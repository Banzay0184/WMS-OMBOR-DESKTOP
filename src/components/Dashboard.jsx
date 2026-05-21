import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../api/client";

const moneyFmt = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const rateFmt = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatDate = (iso) => {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
};

const formatMoneyUzs = (raw) => {
  const num = Number(raw);
  if (!Number.isFinite(num)) return "0";
  return moneyFmt.format(Math.round(num));
};

const statusLabel = (status) => {
  if (status === "draft") return { label: "Черновик", className: "bg-amber-50 text-amber-700 border border-amber-200" };
  if (status === "approved") return { label: "Утверждено", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" };
  return { label: status || "—", className: "bg-secondary text-muted border border-border" };
};

const ALERT_STYLES = {
  error: "bg-red-50 text-red-700 border border-red-200",
  warning: "bg-amber-50 text-amber-800 border border-amber-200",
  info: "bg-sky-50 text-sky-800 border border-sky-200",
};

const KpiCard = ({ title, value, hint, accent = "primary", onClick, ariaLabel }) => {
  const accentClass =
    accent === "success"
      ? "text-emerald-600"
      : accent === "warning"
      ? "text-amber-600"
      : accent === "danger"
      ? "text-red-600"
      : "text-primary";

  const baseClass =
    "rounded-xl bg-white border border-border shadow-soft p-5 flex flex-col gap-1.5 transition";
  const interactiveClass = onClick
    ? " hover:border-primary/40 hover:shadow-md cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-primary/30"
    : "";

  const content = (
    <>
      <div className="text-xs uppercase tracking-wide text-muted/80">{title}</div>
      <div className={"text-2xl font-semibold " + accentClass}>{value}</div>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </>
  );

  if (!onClick) {
    return <div className={baseClass}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || title}
      tabIndex={0}
      className={baseClass + interactiveClass}
    >
      {content}
    </button>
  );
};

const QuickActionButton = ({ to, onClick, children, primary = false, disabled = false, ariaLabel }) => {
  const baseClass =
    "inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-1";
  const variantClass = primary
    ? " bg-primary text-white hover:bg-primary/90 focus:ring-primary/40"
    : " bg-white border border-border text-muted hover:bg-secondary hover:text-primary focus:ring-primary/30";
  const disabledClass = disabled ? " opacity-50 cursor-not-allowed pointer-events-none" : "";

  if (to && !disabled) {
    return (
      <Link to={to} className={baseClass + variantClass + disabledClass} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={0}
      aria-label={ariaLabel}
      className={baseClass + variantClass + disabledClass}
    >
      {children}
    </button>
  );
};

const DocumentsList = ({ title, items, emptyText, buildHref, renderSubtitle }) => {
  if (!items?.length) {
    return (
      <div className="rounded-xl bg-white border border-border shadow-soft">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
        </div>
        <div className="px-5 py-10 text-center text-sm text-muted">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-border shadow-soft">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        <span className="text-xs text-muted">последние {items.length}</span>
      </div>
      <ul className="divide-y divide-border">
        {items.map((doc) => {
          const st = statusLabel(doc.status);
          const href = buildHref(doc);
          return (
            <li key={doc.id}>
              <Link
                to={href}
                aria-label={`Открыть документ №${doc.invoice_number || doc.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-secondary transition focus:outline-none focus:bg-secondary"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary truncate">
                      {doc.invoice_number ? `№ ${doc.invoice_number}` : `Документ #${doc.id}`}
                    </span>
                    <span className={"px-2 py-0.5 rounded-full text-xs " + st.className}>{st.label}</span>
                  </div>
                  <div className="text-xs text-muted truncate">{renderSubtitle(doc)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-primary">
                    {formatMoneyUzs(doc.total_with_vat)} <span className="text-xs text-muted font-normal">UZS</span>
                  </div>
                  <div className="text-xs text-muted">{formatDate(doc.invoice_date || doc.created_at)}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, activeContext } = useAuth();
  const organizationId =
    activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/dashboard-summary/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.detail || "Не удалось загрузить сводку.");
        setSummary(null);
        return;
      }
      setSummary(data);
    } catch {
      setError("Не удалось загрузить сводку.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const features = summary?.features ?? {};
  const permissions = useMemo(
    () => (Array.isArray(summary?.permissions) ? summary.permissions : []),
    [summary?.permissions]
  );

  const has = useCallback((perm) => permissions.includes(perm), [permissions]);

  const canCreatePurchase = has("purchase.create");
  const canCreateSales = has("sales.create") && features.can_warehouse_outgoing !== false;
  const canSeePurchases = has("purchase.view") || canCreatePurchase;
  const canSeeSales = (has("sales.view") || canCreateSales) && features.can_warehouse_outgoing !== false;
  const canSeeProducts = has("products.view") || has("products.manage");
  const canSeeSuppliers = has("suppliers.view") || has("suppliers.manage");
  const canSeeWarehouses = has("warehouses.view") || has("warehouses.manage");

  const warehouses = Array.isArray(summary?.warehouses) ? summary.warehouses : [];
  const firstWarehouseId = warehouses[0]?.id;

  const handleCreatePurchase = useCallback(() => {
    if (!firstWarehouseId) {
      navigate("/app/warehouses");
      return;
    }
    navigate(`/app/warehouses/${firstWarehouseId}/receipt`);
  }, [firstWarehouseId, navigate]);

  const handleCreateSales = useCallback(() => {
    if (!firstWarehouseId) {
      navigate("/app/warehouses");
      return;
    }
    navigate(`/app/warehouses/${firstWarehouseId}/outgoing`);
  }, [firstWarehouseId, navigate]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "Доброй ночи";
    if (hour < 12) return "Доброе утро";
    if (hour < 18) return "Добрый день";
    return "Добрый вечер";
  }, []);

  if (!organizationId) {
    return (
      <div className="rounded-xl bg-white border border-border shadow-soft p-8 text-center text-muted">
        Выберите организацию, чтобы увидеть сводку.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-20 rounded-xl bg-white border border-border shadow-soft animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white border border-border shadow-soft animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-xl bg-white border border-border shadow-soft animate-pulse" />
          <div className="h-64 rounded-xl bg-white border border-border shadow-soft animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-6 text-sm">
        {error}
      </div>
    );
  }

  if (!summary) return null;

  const { kpi, latest_incoming, latest_outgoing, usd_rate, subscription, alerts, organization } = summary;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="rounded-xl bg-white border border-border shadow-soft p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted/80">{organization?.name || "Компания"}</div>
          <h1 className="text-2xl font-semibold text-primary mt-1">
            {greeting}{user?.username ? `, ${user.username}` : ""}!
          </h1>
          <p className="text-sm text-muted mt-1">
            Сводка по организации за последние 7 дней
            {subscription?.tariff_name ? ` · тариф «${subscription.tariff_name}»` : ""}
          </p>
        </div>
        {features.can_currency && usd_rate ? (
          <div className="rounded-lg border border-border bg-secondary px-4 py-3 text-right">
            <div className="text-xs text-muted">Курс USD ({usd_rate.source === "cbu" ? "ЦБ РУз" : "вручную"})</div>
            <div className="text-lg font-semibold text-primary">
              {rateFmt.format(Number(usd_rate.rate))} <span className="text-xs text-muted font-normal">UZS</span>
            </div>
            <div className="text-xs text-muted">на {formatDate(usd_rate.rate_date)}</div>
          </div>
        ) : null}
      </section>

      {/* Алёрты */}
      {Array.isArray(alerts) && alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.map((alert, idx) => (
            <div
              key={`${alert.kind}-${idx}`}
              className={"rounded-lg px-4 py-3 text-sm " + (ALERT_STYLES[alert.level] || ALERT_STYLES.info)}
            >
              {alert.message}
            </div>
          ))}
        </div>
      ) : null}

      {/* KPI */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {canSeePurchases ? (
          <KpiCard
            title="Приходы за 7 дн."
            value={kpi.incoming.count}
            hint={`${formatMoneyUzs(kpi.incoming.total_uzs)} UZS`}
            accent="primary"
            onClick={() => navigate("/app/invoices")}
            ariaLabel="Перейти к счёт‑фактурам"
          />
        ) : null}
        {canSeeSales ? (
          <KpiCard
            title="Расходы за 7 дн."
            value={kpi.outgoing.count}
            hint={`${formatMoneyUzs(kpi.outgoing.total_uzs)} UZS`}
            accent="success"
            onClick={() => navigate("/app/invoices")}
            ariaLabel="Перейти к расходным документам"
          />
        ) : null}
        {canSeePurchases ? (
          <KpiCard
            title="Черновики прихода"
            value={kpi.drafts}
            hint={kpi.drafts > 0 ? "Требуют утверждения" : "Все документы утверждены"}
            accent={kpi.drafts > 0 ? "warning" : "primary"}
            onClick={() => navigate("/app/invoices")}
            ariaLabel="Открыть черновики"
          />
        ) : null}
        {canSeeWarehouses ? (
          <KpiCard
            title="Складов"
            value={warehouses.length}
            hint={warehouses.length === 0 ? "Создайте склад, чтобы начать" : "Активные склады"}
            accent="primary"
            onClick={() => navigate("/app/warehouses")}
            ariaLabel="Перейти к складам"
          />
        ) : null}
      </section>

      {/* Быстрые действия */}
      {canCreatePurchase || canCreateSales || canSeeProducts || canSeeSuppliers ? (
        <section className="rounded-xl bg-white border border-border shadow-soft p-5">
          <h2 className="text-sm font-semibold text-primary mb-3">Быстрые действия</h2>
          <div className="flex flex-wrap gap-2">
            {canCreatePurchase ? (
              <QuickActionButton
                onClick={handleCreatePurchase}
                primary
                ariaLabel="Создать приход"
              >
                + Создать приход
              </QuickActionButton>
            ) : null}
            {canCreateSales ? (
              <QuickActionButton
                onClick={handleCreateSales}
                ariaLabel="Создать расход"
              >
                + Создать расход
              </QuickActionButton>
            ) : null}
            {canSeeProducts ? (
              <QuickActionButton to="/app/products" ariaLabel="Перейти к товарам">
                Товары
              </QuickActionButton>
            ) : null}
            {canSeeSuppliers ? (
              <QuickActionButton to="/app/suppliers" ariaLabel="Перейти к поставщикам">
                Поставщики
              </QuickActionButton>
            ) : null}
            {canSeeWarehouses ? (
              <QuickActionButton to="/app/warehouses" ariaLabel="Перейти к складам">
                Склады
              </QuickActionButton>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Последние документы */}
      <section
        className={
          canSeeSales
            ? "grid grid-cols-1 lg:grid-cols-2 gap-4"
            : "grid grid-cols-1 gap-4"
        }
      >
        {canSeePurchases ? (
          <DocumentsList
            title="Последние приходы"
            items={latest_incoming}
            emptyText="Пока нет приходов. Создайте первый документ."
            buildHref={(doc) => `/app/invoices/${doc.id}`}
            renderSubtitle={(doc) =>
              [doc.supplier_name || "Без поставщика", doc.warehouse_name].filter(Boolean).join(" · ")
            }
          />
        ) : null}
        {canSeeSales ? (
          <DocumentsList
            title="Последние расходы"
            items={latest_outgoing}
            emptyText="Пока нет расходных документов."
            buildHref={(doc) => `/app/outgoing-invoices/${doc.id}`}
            renderSubtitle={(doc) =>
              [doc.customer_name || "Без получателя", doc.warehouse_name].filter(Boolean).join(" · ")
            }
          />
        ) : null}
      </section>
    </div>
  );
};

export default Dashboard;
