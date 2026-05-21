import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { hasMultipleContextDoors } from "../../utils/contextZones";
import POSOpenShiftGate from "./POSOpenShiftGate";
import POSShiftClosedGate from "./POSShiftClosedGate";
import { POS_STORAGE_KEYS, posApi } from "./posApi";

const tabLinkClass = ({ isActive }) =>
  "px-4 py-2 rounded-lg text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/40 " +
  (isActive
    ? "bg-primary text-white shadow-soft"
    : "text-muted hover:bg-secondary hover:text-primary");

const POSContext = ({ overview, organizationId, warehouseId, setWarehouseId, onReload }) => {
  if (!overview) return null;
  const warehouses = Array.isArray(overview.warehouses) ? overview.warehouses : [];
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-muted whitespace-nowrap" htmlFor="pos-warehouse-select">
        Склад:
      </label>
      <select
        id="pos-warehouse-select"
        value={warehouseId ?? ""}
        onChange={(e) => setWarehouseId(Number(e.target.value))}
        aria-label="Выбрать склад кассы"
        className="px-3 py-1.5 rounded-lg border border-border bg-white text-sm text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {warehouses.length === 0 ? <option value="">Нет складов</option> : null}
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onReload}
        aria-label="Обновить сводку"
        tabIndex={0}
        className="text-xs text-muted hover:text-primary transition focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-2 py-1"
      >
        Обновить
      </button>
    </div>
  );
};

const POSLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, activeContext, availableContexts, fetchContexts } = useAuth();
  const organizationId =
    activeContext?.type === "pos" ? activeContext.organizationId : null;

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warehouseId, setWarehouseIdState] = useState(null);
  const [shiftState, setShiftState] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const data = await posApi.overview(organizationId);
      setOverview(data);

      const stored = Number(localStorage.getItem(POS_STORAGE_KEYS.warehouseId(organizationId)));
      const warehouses = Array.isArray(data?.warehouses) ? data.warehouses : [];
      const validId = warehouses.find((w) => Number(w.id) === stored)?.id ?? warehouses[0]?.id ?? null;
      setWarehouseIdState(validId);
      if (validId) {
        localStorage.setItem(POS_STORAGE_KEYS.warehouseId(organizationId), String(validId));
      }
    } catch (err) {
      setError(err.message || "Не удалось загрузить кассу");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const loadShift = useCallback(async () => {
    if (!organizationId || !warehouseId) {
      setShiftState(null);
      return;
    }
    setShiftLoading(true);
    try {
      const data = await posApi.getCurrentShift(organizationId, warehouseId);
      setShiftState(data);
    } catch {
      setShiftState(null);
    } finally {
      setShiftLoading(false);
    }
  }, [organizationId, warehouseId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    void loadShift();
  }, [loadShift]);

  useEffect(() => {
    if (availableContexts == null) {
      void fetchContexts();
    }
  }, [availableContexts, fetchContexts]);

  const canSwitchContext = useMemo(
    () => hasMultipleContextDoors(availableContexts),
    [availableContexts]
  );

  const setWarehouseId = useCallback(
    (id) => {
      setWarehouseIdState(id);
      if (organizationId && id != null) {
        localStorage.setItem(POS_STORAGE_KEYS.warehouseId(organizationId), String(id));
      }
    },
    [organizationId]
  );

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleSwitchContext = () => {
    navigate("/select-context", { replace: true });
  };

  const isShiftRoute = location.pathname === "/pos/shift" || location.pathname.startsWith("/pos/shift/");
  const isShiftOpen = Boolean(shiftState?.is_shift_open);
  const canOpenToday = shiftState?.can_open_today !== false;
  const showOpenGate =
    !loading && !shiftLoading && warehouseId != null && !isShiftOpen && canOpenToday && !isShiftRoute;
  const showClosedGate =
    !loading && !shiftLoading && warehouseId != null && !isShiftOpen && !canOpenToday && !isShiftRoute;

  const ctxValue = useMemo(
    () => ({
      organizationId,
      warehouseId,
      overview,
      permissions: overview?.permissions || { can_use: true, can_refund: false, can_view_cost: false },
      reloadOverview: loadOverview,
      shiftState,
      isShiftOpen,
      canOpenToday,
      reloadShift: loadShift,
    }),
    [organizationId, warehouseId, overview, loadOverview, shiftState, isShiftOpen, canOpenToday, loadShift]
  );

  if (!organizationId) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center text-muted">
        Контекст POS не выбран.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-border shadow-soft">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center font-bold">
              К
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-primary truncate">
                Касса · {overview?.organization?.name || "—"}
              </h1>
              <p className="text-xs text-muted truncate">
                Кассир: {user?.username || "—"}
              </p>
            </div>
          </div>
          <POSContext
            overview={overview}
            organizationId={organizationId}
            warehouseId={warehouseId}
            setWarehouseId={setWarehouseId}
            onReload={loadOverview}
          />
          <div className="flex items-center gap-2">
            {canSwitchContext ? (
              <button
                type="button"
                onClick={handleSwitchContext}
                aria-label="Сменить контекст"
                tabIndex={0}
                className="px-3 py-1.5 rounded-lg border border-border text-muted text-sm hover:bg-secondary hover:text-primary transition focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                Сменить
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Выйти"
              tabIndex={0}
              className="px-3 py-1.5 rounded-lg border border-border text-muted text-sm hover:bg-red-50 hover:text-red-600 transition focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              Выход
            </button>
          </div>
        </div>
        <nav className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-2">
          <NavLink to="/pos" end className={tabLinkClass}>
            Касса
          </NavLink>
          <NavLink to="/pos/history" className={tabLinkClass}>
            История
          </NavLink>
          <NavLink to="/pos/shift" className={tabLinkClass}>
            Z-отчёт
          </NavLink>
          <NavLink to="/pos/customers" className={tabLinkClass}>
            Клиенты {overview?.total_debt && Number(overview.total_debt) > 0 ? `· долг ${Math.round(Number(overview.total_debt)).toLocaleString("ru-RU")}` : ""}
          </NavLink>
          <NavLink to="/pos/settings" className={tabLinkClass}>
            Принтер
          </NavLink>
        </nav>
      </header>

      <main className="flex-1">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          {loading ? (
            <div className="rounded-xl bg-white border border-border shadow-soft p-8 text-center text-muted">
              Загрузка кассы…
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm">
              {error}
            </div>
          ) : warehouseId == null ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-4 text-sm">
              В организации нет складов. Создайте склад через основную рабочую зону.
            </div>
          ) : (
            <>
              <Outlet context={ctxValue} />
              {showOpenGate ? <POSOpenShiftGate /> : null}
              {showClosedGate ? (
                <POSShiftClosedGate closedShift={shiftState?.closed_today} />
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default POSLayout;
