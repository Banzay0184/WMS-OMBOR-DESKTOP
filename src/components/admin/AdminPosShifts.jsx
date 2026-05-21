import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { authFetch } from "../../api/client";
import { formatMoney, formatDateTime } from "../pos/posApi";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const formatCashierLabel = (cashier) => {
  const name = cashier.full_name || cashier.username || cashier.phone || `ID ${cashier.user_id}`;
  const extra = cashier.phone && cashier.full_name !== cashier.phone ? ` (${cashier.phone})` : "";
  const role = cashier.role_name ? ` · ${cashier.role_name}` : "";
  return `${name}${extra}${role}`;
};

const AdminPosShifts = () => {
  const { companyId } = useParams();
  const organizationId = Number(companyId);

  const [organization, setOrganization] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [shiftState, setShiftState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBase = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const [orgRes, whRes, cashiersRes] = await Promise.all([
        authFetch(`platform/organizations/${organizationId}/`),
        authFetch(`platform/organizations/${organizationId}/warehouses/`),
        authFetch(`platform/organizations/${organizationId}/pos/cashiers/`),
      ]);
      const [orgData, whData, cashiersData] = await Promise.all([
        orgRes.json().catch(() => ({})),
        whRes.json().catch(() => []),
        cashiersRes.json().catch(() => []),
      ]);
      if (!orgRes.ok) throw new Error(orgData.detail || "Не удалось загрузить организацию");
      if (!cashiersRes.ok) {
        throw new Error(cashiersData.detail || "Не удалось загрузить список кассиров");
      }
      setOrganization(orgData);
      const whList = Array.isArray(whData) ? whData : [];
      setWarehouses(whList);
      setCashiers(Array.isArray(cashiersData) ? cashiersData : []);
      if (!warehouseId && whList[0]?.id) setWarehouseId(String(whList[0].id));
    } catch (err) {
      setError(err.message || "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const loadShiftState = useCallback(async () => {
    if (!organizationId || !warehouseId || !cashierId) {
      setShiftState(null);
      return;
    }
    try {
      const params = new URLSearchParams({
        warehouse_id: warehouseId,
        cashier_id: cashierId,
      });
      const res = await authFetch(
        `platform/organizations/${organizationId}/pos/shifts/current/?${params.toString()}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Не удалось загрузить смену");
      setShiftState(data);
    } catch (err) {
      setShiftState(null);
      setError(err.message || "Не удалось загрузить смену");
    }
  }, [organizationId, warehouseId, cashierId]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!cashierId && cashiers.length > 0) {
      setCashierId(String(cashiers[0].user_id));
    }
  }, [cashiers, cashierId]);

  useEffect(() => {
    void loadShiftState();
  }, [loadShiftState]);

  const handleOpenShift = async () => {
    if (!organizationId || !warehouseId || !cashierId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/pos/shifts/open/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_id: Number(warehouseId),
          cashier_id: Number(cashierId),
          opening_cash: String(Number(openingCash) || 0),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Не удалось открыть смену");
      setSuccess(
        shiftState?.can_force_reopen
          ? `Смена ${data.shift_number} повторно открыта для кассира.`
          : `Смена ${data.shift_number} открыта для кассира.`
      );
      await loadShiftState();
    } catch (err) {
      setError(err.message || "Не удалось открыть смену");
    } finally {
      setActionLoading(false);
    }
  };

  const canPos = organization?.subscription?.tariff_can_pos === true;
  const isShiftOpen = Boolean(shiftState?.is_shift_open);
  const canOpenToday = shiftState?.can_open_today !== false;
  const canForceReopen = Boolean(shiftState?.can_force_reopen);
  const canShowOpenForm = !isShiftOpen && canOpenToday;

  if (loading) {
    return <div className="p-6 text-muted text-sm">Загрузка…</div>;
  }

  if (!canPos) {
    return (
      <div className="p-6 space-y-4">
        <Link to={`/panel/companies/${companyId}`} className="text-sm text-primary hover:underline">
          ← Назад к компании
        </Link>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          POS не включён в тарифе этой организации.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      <div>
        <Link to={`/panel/companies/${companyId}`} className="text-sm text-primary hover:underline">
          ← {organization?.name || "Компания"}
        </Link>
        <h1 className="text-xl font-semibold text-primary mt-2">Смены POS</h1>
        <p className="text-sm text-muted mt-1">
          Открытие смены доступно только администратору платформы. Закрытие смены на складе блокирует
          новые открытия на этом складе до завтра для всех кассиров. Другие склады работают отдельно.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3" role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3" role="status">
          {success}
        </div>
      ) : null}

      <section className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-medium text-primary">Открыть смену для кассира</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="admin-pos-warehouse" className="block text-sm text-muted mb-1">
              Склад
            </label>
            <select
              id="admin-pos-warehouse"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={INPUT_CLASS}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="admin-pos-cashier" className="block text-sm text-muted mb-1">
              Кассир ({cashiers.length})
            </label>
            <select
              id="admin-pos-cashier"
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              className={INPUT_CLASS}
            >
              {cashiers.length === 0 ? (
                <option value="">Нет сотрудников с доступом к POS</option>
              ) : null}
              {cashiers.map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {formatCashierLabel(c)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isShiftOpen && shiftState?.shift ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Смена уже открыта: <strong>{shiftState.shift.shift_number}</strong>
            {shiftState.shift.opened_at ? (
              <span className="text-emerald-800/80"> · с {formatDateTime(shiftState.shift.opened_at)}</span>
            ) : null}
          </div>
        ) : canShowOpenForm ? (
          <>
            {canForceReopen ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Смена на сегодня уже была закрыта на этом складе
                {shiftState?.closed_today?.shift_number ? (
                  <span> ({shiftState.closed_today.shift_number})</span>
                ) : null}
                . Вы можете повторно открыть смену для этого кассира.
              </div>
            ) : null}
            <div>
              <label htmlFor="admin-pos-opening-cash" className="block text-sm text-muted mb-1">
                Наличные в кассе на начало (UZS)
              </label>
              <input
                id="admin-pos-opening-cash"
                type="number"
                min="0"
                step="100"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <button
              type="button"
              onClick={handleOpenShift}
              disabled={actionLoading || !warehouseId || !cashierId}
              className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {actionLoading
                ? "Открытие…"
                : canForceReopen
                  ? "Повторно открыть смену"
                  : "Открыть смену"}
            </button>
          </>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Смену сейчас открыть нельзя. Выберите другого кассира или проверьте статус смены.
          </div>
        )}
      </section>

      {isShiftOpen && shiftState?.shift?.live_report ? (
        <section className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-2 text-sm">
          <h2 className="text-lg font-medium text-primary">Текущие итоги</h2>
          <div className="flex justify-between">
            <span className="text-muted">Продаж</span>
            <span>{shiftState.shift.live_report.sales_count ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Наличные</span>
            <span>{formatMoney(shiftState.shift.live_report.cash_sales)} UZS</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Карта</span>
            <span>{formatMoney(shiftState.shift.live_report.card_sales)} UZS</span>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default AdminPosShifts;
