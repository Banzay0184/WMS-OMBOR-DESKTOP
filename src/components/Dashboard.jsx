import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../api/client";
import { PAYMENT_LABEL, STATUS_CLASS, STATUS_LABEL, formatSalePaymentLabel } from "./pos/posApi";

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

const posStatusLabel = (status) => ({
  label: STATUS_LABEL[status] || status || "—",
  className: STATUS_CLASS[status] || "bg-secondary text-muted border border-border",
});

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
    "rounded-xl bg-white border border-border shadow-soft p-5 flex flex-col gap-1.5 transition min-h-[108px]";
  const interactiveClass = onClick
    ? " hover:border-primary/40 hover:shadow-md cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-primary/30"
    : "";

  const content = (
    <>
      <div className="text-xs uppercase tracking-wide text-muted/80">{title}</div>
      <div className={"text-2xl font-semibold tabular-nums " + accentClass}>{value}</div>
      {hint ? <div className="text-xs text-muted leading-snug">{hint}</div> : null}
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

const ProcessCard = ({ title, description, to, onClick, stat, accent = "primary" }) => {
  const accentBorder =
    accent === "success"
      ? "hover:border-emerald-300"
      : accent === "warning"
      ? "hover:border-amber-300"
      : "hover:border-primary/40";

  const inner = (
    <>
      <div className="text-sm font-semibold text-primary">{title}</div>
      {stat ? <div className="text-lg font-bold text-primary tabular-nums mt-1">{stat}</div> : null}
      <p className="text-xs text-muted mt-1 leading-relaxed">{description}</p>
    </>
  );

  const className =
    "rounded-xl bg-white border border-border shadow-soft p-4 text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 " +
    accentBorder;

  if (to) {
    return (
      <Link to={to} className={className} aria-label={title}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-label={title}>
      {inner}
    </button>
  );
};

const DocumentsList = ({ title, items, emptyText, buildHref, renderSubtitle, footerLink, footerLabel }) => {
  if (!items?.length) {
    return (
      <div className="rounded-xl bg-white border border-border shadow-soft h-full flex flex-col">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
        </div>
        <div className="px-5 py-10 text-center text-sm text-muted flex-1">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-border shadow-soft h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        <span className="text-xs text-muted">последние {items.length}</span>
      </div>
      <ul className="divide-y divide-border flex-1">
        {items.map((doc) => {
          const st = doc.sale_number ? posStatusLabel(doc.status) : statusLabel(doc.status);
          const href = buildHref(doc);
          return (
            <li key={doc.id}>
              <Link
                to={href}
                aria-label={`Открыть документ №${doc.invoice_number || doc.sale_number || doc.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-secondary transition focus:outline-none focus:bg-secondary"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-primary truncate">
                      {doc.invoice_number
                        ? `№ ${doc.invoice_number}`
                        : doc.sale_number
                        ? doc.sale_number
                        : `Документ #${doc.id}`}
                    </span>
                    <span className={"px-2 py-0.5 rounded-full text-xs " + st.className}>{st.label}</span>
                  </div>
                  <div className="text-xs text-muted truncate">{renderSubtitle(doc)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-primary tabular-nums">
                    {formatMoneyUzs(doc.total_with_vat ?? doc.total_amount)}{" "}
                    <span className="text-xs text-muted font-normal">UZS</span>
                  </div>
                  <div className="text-xs text-muted">
                    {formatDate(doc.invoice_date || doc.created_at)}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {footerLink ? (
        <div className="px-5 py-3 border-t border-border">
          <Link to={footerLink} className="text-xs font-medium text-primary hover:underline">
            {footerLabel || "Смотреть все →"}
          </Link>
        </div>
      ) : null}
    </div>
  );
};

const PosSalesList = ({ items }) => (
  <DocumentsList
    title="Последние чеки POS"
    items={items}
    emptyText="Розничных продаж пока нет."
    buildHref={(doc) => `/app/retail-sales/${doc.id}`}
    footerLink="/app/retail-sales"
    footerLabel="Все розничные продажи →"
    renderSubtitle={(doc) => {
      const parts = [
        doc.customer_name || "Без клиента",
        doc.warehouse_name,
        formatSalePaymentLabel(doc),
      ].filter(Boolean);
      return parts.join(" · ");
    }}
  />
);

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, activeContext, availableContexts, setActiveContext } = useAuth();
  const organizationId =
    activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canOpenPos = useMemo(() => {
    if (!organizationId) return false;
    const orgs = availableContexts?.organizations;
    if (!Array.isArray(orgs)) return false;
    const match = orgs.find((o) => Number(o.id) === Number(organizationId));
    if (!match) return false;
    const zones = Array.isArray(match.available_zones) ? match.available_zones : [];
    return zones.includes("pos") || match.has_pos === true;
  }, [availableContexts, organizationId]);

  const handleOpenPos = useCallback(() => {
    if (!organizationId) return;
    setActiveContext("pos", organizationId);
    navigate("/pos", { replace: true });
  }, [organizationId, navigate, setActiveContext]);

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
  const canSeeEmployees = has("employees.view") || has("employees.manage");
  const canPos = features.can_pos === true;

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
        <div className="h-24 rounded-xl bg-white border border-border shadow-soft animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-white border border-border shadow-soft animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-64 rounded-xl bg-white border border-border shadow-soft animate-pulse" />
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

  const { kpi, latest_incoming, latest_outgoing, usd_rate, subscription, alerts, organization, pos } =
    summary;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="rounded-xl bg-gradient-to-br from-white to-secondary/80 border border-border shadow-soft p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted/80">
              {organization?.name || "Компания"}
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-primary mt-1">
              {greeting}
              {user?.username ? `, ${user.username}` : ""}!
            </h1>
            <p className="text-sm text-muted mt-2 max-w-xl">
              Полная сводка: закупки, склад, расходы и розница — всё, что происходит в компании, на одном
              экране.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {subscription?.tariff_name ? (
              <div className="rounded-lg border border-border bg-white px-4 py-3 min-w-[140px]">
                <div className="text-xs text-muted">Тариф</div>
                <div className="text-sm font-semibold text-primary">{subscription.tariff_name}</div>
                {subscription.days_until_expiry != null ? (
                  <div
                    className={
                      "text-xs mt-0.5 " +
                      (subscription.days_until_expiry <= 7 ? "text-amber-700" : "text-muted")
                    }
                  >
                    {subscription.days_until_expiry < 0
                      ? `Истёк ${Math.abs(subscription.days_until_expiry)} дн. назад`
                      : `Осталось ${subscription.days_until_expiry} дн.`}
                  </div>
                ) : null}
              </div>
            ) : null}
            {features.can_currency && usd_rate ? (
              <div className="rounded-lg border border-border bg-white px-4 py-3 min-w-[140px]">
                <div className="text-xs text-muted">USD ({usd_rate.source === "cbu" ? "ЦБ" : "руч."})</div>
                <div className="text-lg font-semibold text-primary tabular-nums">
                  {rateFmt.format(Number(usd_rate.rate))}
                </div>
                <div className="text-xs text-muted">на {formatDate(usd_rate.rate_date)}</div>
              </div>
            ) : null}
            {canPos && pos ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 min-w-[140px]">
                <div className="text-xs text-emerald-800/80">Касса сегодня</div>
                <div className="text-lg font-semibold text-emerald-800 tabular-nums">
                  {formatMoneyUzs(pos.today?.total_uzs)} UZS
                </div>
                <div className="text-xs text-emerald-800/70">{pos.today?.count || 0} чеков</div>
              </div>
            ) : null}
          </div>
        </div>
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
      <section>
        <h2 className="text-sm font-semibold text-primary mb-3">Ключевые показатели</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {canSeePurchases ? (
            <KpiCard
              title="Приходы · 7 дн."
              value={kpi.incoming.count}
              hint={`${formatMoneyUzs(kpi.incoming.total_uzs)} UZS`}
              onClick={() => navigate("/app/invoices")}
              ariaLabel="Приходы за неделю"
            />
          ) : null}
          {canSeeSales ? (
            <KpiCard
              title="Расходы · 7 дн."
              value={kpi.outgoing.count}
              hint={`${formatMoneyUzs(kpi.outgoing.total_uzs)} UZS`}
              accent="success"
              onClick={() => navigate("/app/invoices")}
              ariaLabel="Расходы за неделю"
            />
          ) : null}
          {canPos && pos ? (
            <>
              <KpiCard
                title="Розница · 7 дн."
                value={pos.week?.count || 0}
                hint={`${formatMoneyUzs(pos.week?.total_uzs)} UZS`}
                accent="success"
                onClick={() => navigate("/app/retail-sales")}
                ariaLabel="Розница за неделю"
              />
              <KpiCard
                title="Розница · сегодня"
                value={pos.today?.count || 0}
                hint={`${formatMoneyUzs(pos.today?.total_uzs)} UZS`}
                onClick={() => navigate("/app/retail-sales")}
                ariaLabel="Розница сегодня"
              />
            </>
          ) : null}
          {canSeePurchases && kpi.drafts > 0 ? (
            <KpiCard
              title="Черновики прихода"
              value={kpi.drafts}
              hint="Требуют утверждения"
              accent="warning"
              onClick={() => navigate("/app/invoices")}
            />
          ) : null}
          {canSeeSales && kpi.outgoing_drafts > 0 ? (
            <KpiCard
              title="Черновики расхода"
              value={kpi.outgoing_drafts}
              hint="Не утверждены"
              accent="warning"
              onClick={() => navigate("/app/invoices")}
            />
          ) : null}
          {canPos && pos && Number(pos.total_debt) > 0 ? (
            <KpiCard
              title="Долг клиентов"
              value={formatMoneyUzs(pos.total_debt)}
              hint={`${pos.debt_sales_pending || 0} чеков в долг`}
              accent="danger"
              onClick={() => navigate("/app/retail-sales")}
            />
          ) : null}
          {canPos && pos && Number(pos.total_prepayment) > 0 ? (
            <KpiCard
              title="Предоплаты"
              value={formatMoneyUzs(pos.total_prepayment)}
              hint={`${pos.customers_count || 0} клиентов POS`}
              onClick={() => navigate("/app/retail-sales")}
            />
          ) : null}
          {canSeeProducts ? (
            <KpiCard
              title="Товаров"
              value={kpi.products_count ?? 0}
              hint="В каталоге"
              onClick={() => navigate("/app/products")}
            />
          ) : null}
          {canSeeWarehouses ? (
            <KpiCard
              title="Складов"
              value={warehouses.length}
              hint={warehouses.length === 0 ? "Создайте склад" : "Активные"}
              onClick={() => navigate("/app/warehouses")}
            />
          ) : null}
          {canSeeEmployees ? (
            <KpiCard
              title="Сотрудников"
              value={kpi.employees_count ?? 0}
              hint="В организации"
              onClick={() => navigate("/app/employees")}
            />
          ) : null}
          {canPos && pos && pos.open_shifts > 0 ? (
            <KpiCard
              title="Открытые смены"
              value={pos.open_shifts}
              hint="Касса работает"
              accent="success"
              onClick={canOpenPos ? handleOpenPos : undefined}
            />
          ) : null}
        </div>
      </section>

      {/* Обзор процессов */}
      <section>
        <h2 className="text-sm font-semibold text-primary mb-3">Процессы компании</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {canSeePurchases ? (
            <ProcessCard
              title="Закупки"
              stat={`${kpi.incoming.count} за 7 дн.`}
              description="Приходные счёт‑фактуры, поставщики, утверждение."
              to="/app/invoices"
            />
          ) : null}
          {canSeeWarehouses ? (
            <ProcessCard
              title="Склад"
              stat={`${warehouses.length} склад(ов)`}
              description="Остатки, маркировка, движение товаров."
              to="/app/warehouses"
            />
          ) : null}
          {canSeeSales ? (
            <ProcessCard
              title="Оптовый расход"
              stat={`${kpi.outgoing.count} за 7 дн.`}
              description="Расходные счёт‑фактуры и отгрузки."
              to="/app/invoices"
            />
          ) : null}
          {canPos ? (
            <ProcessCard
              title="Розница"
              stat={pos ? `${pos.week?.count || 0} чеков` : "—"}
              description="Продажи через кассу POS, чеки и Z‑отчёты."
              to="/app/retail-sales"
              accent="success"
            />
          ) : null}
          {canSeeSuppliers ? (
            <ProcessCard
              title="Поставщики"
              stat={kpi.suppliers_count ?? 0}
              description="Контрагенты для закупок."
              to="/app/suppliers"
            />
          ) : null}
          {canSeeEmployees ? (
            <ProcessCard
              title="Команда"
              stat={kpi.employees_count ?? 0}
              description="Сотрудники, роли и доступы."
              to="/app/employees"
            />
          ) : null}
        </div>
      </section>

      {/* Склады */}
      {canSeeWarehouses && warehouses.length > 0 ? (
        <section className="rounded-xl bg-white border border-border shadow-soft p-5">
          <h2 className="text-sm font-semibold text-primary mb-3">Склады</h2>
          <div className="flex flex-wrap gap-2">
            {warehouses.map((wh) => (
              <Link
                key={wh.id}
                to={`/app/warehouses/${wh.id}/unmarked`}
                className="px-3 py-2 rounded-lg border border-border bg-secondary/40 text-sm text-muted hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition"
              >
                {wh.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Быстрые действия */}
      <section className="rounded-xl bg-white border border-border shadow-soft p-5">
        <h2 className="text-sm font-semibold text-primary mb-3">Быстрые действия</h2>
        <div className="flex flex-wrap gap-2">
          {canCreatePurchase ? (
            <QuickActionButton onClick={handleCreatePurchase} primary ariaLabel="Создать приход">
              + Приход
            </QuickActionButton>
          ) : null}
          {canCreateSales ? (
            <QuickActionButton onClick={handleCreateSales} ariaLabel="Создать расход">
              + Расход
            </QuickActionButton>
          ) : null}
          {canPos ? (
            <QuickActionButton to="/app/retail-sales" ariaLabel="Розничные продажи">
              Розничные продажи
            </QuickActionButton>
          ) : null}
          {canOpenPos ? (
            <QuickActionButton onClick={handleOpenPos} ariaLabel="Открыть кассу POS">
              Открыть кассу
            </QuickActionButton>
          ) : null}
          {canSeeProducts ? (
            <QuickActionButton to="/app/products" ariaLabel="Товары">
              Товары
            </QuickActionButton>
          ) : null}
          {canSeeSuppliers ? (
            <QuickActionButton to="/app/suppliers" ariaLabel="Поставщики">
              Поставщики
            </QuickActionButton>
          ) : null}
          {canSeeWarehouses ? (
            <QuickActionButton to="/app/warehouses" ariaLabel="Склады">
              Склады
            </QuickActionButton>
          ) : null}
          {canSeeEmployees ? (
            <QuickActionButton to="/app/employees" ariaLabel="Сотрудники">
              Сотрудники
            </QuickActionButton>
          ) : null}
        </div>
      </section>

      {/* Последние документы */}
      <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {canSeePurchases ? (
          <DocumentsList
            title="Последние приходы"
            items={latest_incoming}
            emptyText="Пока нет приходов."
            buildHref={(doc) => `/app/invoices/${doc.id}`}
            footerLink="/app/invoices"
            footerLabel="Все счёт‑фактуры →"
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
            footerLink="/app/invoices"
            footerLabel="Все документы →"
            renderSubtitle={(doc) =>
              [doc.customer_name || "Без получателя", doc.warehouse_name].filter(Boolean).join(" · ")
            }
          />
        ) : null}
        {canPos && pos?.latest_sales?.length ? (
          <PosSalesList items={pos.latest_sales} />
        ) : canPos ? (
          <PosSalesList items={[]} />
        ) : null}
      </section>
    </div>
  );
};

export default Dashboard;
