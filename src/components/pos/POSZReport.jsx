import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDateTime, formatMoney, posApi } from "./posApi";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const ReportBlock = ({ title, children }) => (
  <section className="rounded-xl border border-border bg-white shadow-soft overflow-hidden">
    <div className="px-4 py-3 border-b border-border bg-secondary/30">
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
    </div>
    <div className="p-4 space-y-2">{children}</div>
  </section>
);

const ReportRow = ({ label, value, accent = false }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-muted">{label}</span>
    <span className={`font-semibold tabular-nums ${accent ? "text-primary text-base" : "text-primary"}`}>
      {value}
    </span>
  </div>
);

const ZReportView = ({ report, shift, onPrint }) => {
  if (!report) return null;
  return (
    <div className="space-y-4" id="pos-z-report-print">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs uppercase tracking-wide text-muted/80">Z-отчёт · смена закрыта</p>
        <h2 className="text-lg font-bold text-primary mt-1">{shift?.shift_number || report.shift_number}</h2>
        <p className="text-sm text-muted mt-1">
          {report.organization_name || "—"} · {report.warehouse_name || "—"}
        </p>
        <p className="text-sm text-muted">
          Кассир: {report.cashier_name || shift?.cashier_name || "—"}
        </p>
        <p className="text-xs text-muted mt-2">
          {formatDateTime(report.period_start)} — {formatDateTime(report.period_end)}
        </p>
      </div>

      <ReportBlock title="Продажи">
        <ReportRow label="Чеков" value={report.sales_count ?? 0} />
        <ReportRow label="Сумма продаж" value={`${formatMoney(report.gross_total)} UZS`} />
        <ReportRow label="Наличные" value={`${formatMoney(report.cash_sales)} UZS`} />
        <ReportRow label="Карта" value={`${formatMoney(report.card_sales)} UZS`} />
        <ReportRow label="В долг (оформлено)" value={`${formatMoney(report.debt_sales)} UZS`} />
      </ReportBlock>

      <ReportBlock title="Погашение долгов">
        <ReportRow label="Платежей" value={report.debt_payments_count ?? 0} />
        <ReportRow label="Наличные" value={`${formatMoney(report.debt_payments_cash)} UZS`} />
        <ReportRow label="Карта" value={`${formatMoney(report.debt_payments_card)} UZS`} />
      </ReportBlock>

      <ReportBlock title="Возвраты">
        <ReportRow label="Документов" value={report.returns_count ?? 0} />
        <ReportRow label="Сумма возвратов" value={`${formatMoney(report.returns_total)} UZS`} />
      </ReportBlock>

      <ReportBlock title="Итоги по кассе">
        <ReportRow label="Наличные на начало" value={`${formatMoney(report.opening_cash)} UZS`} />
        <ReportRow label="Получено наличными" value={`${formatMoney(report.cash_received)} UZS`} accent />
        <ReportRow label="Получено картой" value={`${formatMoney(report.card_received)} UZS`} />
        <ReportRow label="Всего получено" value={`${formatMoney(report.total_received)} UZS`} accent />
        <ReportRow label="Ожидается в кассе" value={`${formatMoney(report.expected_cash)} UZS`} accent />
        {report.closing_cash != null ? (
          <ReportRow label="Фактически в кассе" value={`${formatMoney(report.closing_cash)} UZS`} />
        ) : null}
        {report.cash_difference != null ? (
          <ReportRow
            label="Разница"
            value={`${formatMoney(report.cash_difference)} UZS`}
            accent
          />
        ) : null}
      </ReportBlock>

      <div className="flex gap-2 print:hidden">
        <button
          type="button"
          onClick={onPrint}
          tabIndex={0}
          aria-label="Печать Z-отчёта"
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          Печать
        </button>
      </div>
    </div>
  );
};

const LiveShiftPanel = ({ shift, onClose, closing, setClosingCash, onSubmitClose, error }) => {
  const report = shift?.live_report;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs uppercase tracking-wide text-emerald-800/70">Смена открыта</p>
        <h2 className="text-lg font-bold text-emerald-900 mt-1">{shift.shift_number}</h2>
        <p className="text-sm text-emerald-800/80 mt-1">
          С {formatDateTime(shift.opened_at)} · в кассе на начало: {formatMoney(shift.opening_cash)} UZS
        </p>
      </div>

      {report ? (
        <ReportBlock title="Текущие итоги смены">
          <ReportRow label="Чеков" value={report.sales_count ?? 0} />
          <ReportRow label="Наличные (продажи)" value={`${formatMoney(report.cash_sales)} UZS`} />
          <ReportRow label="Карта (продажи)" value={`${formatMoney(report.card_sales)} UZS`} />
          <ReportRow label="Получено наличными" value={`${formatMoney(report.cash_received)} UZS`} accent />
          <ReportRow label="Ожидается в кассе" value={`${formatMoney(report.expected_cash)} UZS`} accent />
        </ReportBlock>
      ) : null}

      <ReportBlock title="Закрыть смену (Z-отчёт)">
        <p className="text-sm text-muted mb-3">
          Пересчитайте наличные в кассе и укажите фактическую сумму. После закрытия Z-отчёта
          повторно открыть смену сегодня сможет только администратор платформы.
        </p>
        <label htmlFor="closing-cash" className="block text-sm font-medium text-muted mb-1.5">
          Наличные в кассе (UZS)
        </label>
        <input
          id="closing-cash"
          type="number"
          min="0"
          step="100"
          value={closing}
          onChange={(e) => setClosingCash(e.target.value)}
          className={INPUT_CLASS}
          aria-label="Наличные в кассе на конец смены"
        />
        {error ? (
          <p className="text-sm text-red-600 mt-2" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onSubmitClose}
          tabIndex={0}
          aria-label="Закрыть смену и сформировать Z-отчёт"
          className="mt-4 w-full px-4 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          Закрыть смену · Z-отчёт
        </button>
      </ReportBlock>
    </div>
  );
};

const OpenShiftPanel = ({ openingCash, setOpeningCash, onSubmit, loading, error }) => (
  <ReportBlock title="Открыть смену">
    <p className="text-sm text-muted mb-3">
      Укажите сумму наличных в кассе на начало смены и нажмите «Открыть смену».
    </p>
    <label htmlFor="open-opening-cash" className="block text-sm font-medium text-muted mb-1.5">
      Наличные в кассе (UZS)
    </label>
    <input
      id="open-opening-cash"
      type="number"
      min="0"
      step="100"
      value={openingCash}
      onChange={(e) => setOpeningCash(e.target.value)}
      className={INPUT_CLASS}
      aria-label="Наличные в кассе на начало смены"
    />
    {error ? (
      <p className="text-sm text-red-600 mt-2" role="alert">
        {error}
      </p>
    ) : null}
    <button
      type="button"
      onClick={onSubmit}
      disabled={loading}
      tabIndex={0}
      aria-label="Открыть смену"
      className="mt-4 w-full px-4 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
    >
      {loading ? "Открытие…" : "Открыть смену"}
    </button>
  </ReportBlock>
);

const POSZReport = () => {
  const { organizationId, warehouseId, reloadShift, canOpenToday, isShiftOpen } = useOutletContext();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shift, setShift] = useState(null);
  const [closedToday, setClosedToday] = useState(null);
  const [canOpen, setCanOpen] = useState(true);
  const [closedShift, setClosedShift] = useState(null);
  const [history, setHistory] = useState([]);
  const [closingCash, setClosingCash] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [actionLoading, setActionLoading] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [openError, setOpenError] = useState("");

  const loadData = useCallback(async () => {
    if (!organizationId || !warehouseId) return;
    setLoading(true);
    setError("");
    try {
      const [current, past] = await Promise.all([
        posApi.getCurrentShift(organizationId, warehouseId),
        posApi.listShifts(organizationId, { warehouseId, limit: 20 }),
      ]);
      setShift(current?.shift ?? null);
      setClosedToday(current?.closed_today ?? null);
      setCanOpen(current?.can_open_today !== false);
      setHistory(Array.isArray(past) ? past : []);
      setClosedShift(null);
    } catch (err) {
      setError(err.message || "Не удалось загрузить смену");
      setShift(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, warehouseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleOpenShift = async () => {
    if (!organizationId || !warehouseId) return;
    setActionLoading(true);
    setOpenError("");
    try {
      const data = await posApi.openShift(organizationId, {
        warehouseId,
        openingCash: Number(openingCash) || 0,
      });
      setShift(data);
      setCanOpen(true);
      await loadData();
      await reloadShift?.();
    } catch (err) {
      setOpenError(err.message || "Не удалось открыть смену");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!organizationId || !shift?.id) return;

    const confirmed = window.confirm(
      "Вы закрываете смену на сегодня.\n\nПосле закрытия Z-отчёта повторно открыть смену сегодня сможет только администратор платформы.\n\nЗакрыть смену?"
    );
    if (!confirmed) return;

    setActionLoading(true);
    setCloseError("");
    try {
      const payload =
        closingCash.trim() === "" ? {} : { closing_cash: String(Number(closingCash)) };
      const data = await posApi.closeShift(organizationId, shift.id, payload);
      setClosedShift(data);
      setShift(null);
      await loadData();
      await reloadShift?.();
    } catch (err) {
      setCloseError(err.message || "Не удалось закрыть смену");
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewPastShift = async (shiftId) => {
    if (!organizationId) return;
    setActionLoading(true);
    setError("");
    try {
      const data = await posApi.getShift(organizationId, shiftId);
      setClosedShift(data);
    } catch (err) {
      setError(err.message || "Не удалось загрузить Z-отчёт");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="rounded-xl bg-white border border-border shadow-soft p-8 text-center text-muted text-sm">
        Загрузка смены…
      </div>
    );
  }

  if (closedShift?.z_report) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <ZReportView report={closedShift.z_report} shift={closedShift} onPrint={handlePrint} />
        <button
          type="button"
          onClick={() => setClosedShift(null)}
          tabIndex={0}
          className="w-full px-4 py-2 rounded-lg border border-border text-muted text-sm hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 print:hidden"
        >
          Назад
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        {error ? (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-3 text-sm" role="alert">
            {error}
          </div>
        ) : null}

        {shift ? (
          <LiveShiftPanel
            shift={shift}
            closing={closingCash}
            setClosingCash={setClosingCash}
            onSubmitClose={handleCloseShift}
            error={closeError}
          />
        ) : (
          <ReportBlock title="Смена не открыта">
            {!canOpen && !isShiftOpen ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                На этом складе смена на сегодня уже закрыта. Повторно открыть смену могут только
                администраторы платформы. Обычные пользователи смогут работать завтра или на другом
                складе.
                {closedToday?.shift_number ? (
                  <p className="mt-2 text-xs text-amber-800/80">{closedToday.shift_number}</p>
                ) : null}
              </div>
            ) : (
              <OpenShiftPanel
                openingCash={openingCash}
                setOpeningCash={setOpeningCash}
                onSubmit={handleOpenShift}
                loading={actionLoading}
                error={openError}
              />
            )}
          </ReportBlock>
        )}
      </div>

      <ReportBlock title="История Z-отчётов">
        {history.length === 0 ? (
          <p className="text-sm text-muted">Закрытых смен пока нет.</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleViewPastShift(item.id)}
                  disabled={actionLoading}
                  tabIndex={0}
                  aria-label={`Открыть Z-отчёт смены ${item.shift_number}`}
                  className="w-full text-left py-3 hover:bg-secondary/40 transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/30 rounded-lg px-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-primary">{item.shift_number}</span>
                    <span className="text-xs text-muted">{formatDateTime(item.closed_at)}</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {item.cashier_name || "—"} · получено{" "}
                    {formatMoney(item.z_report?.total_received)} UZS
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ReportBlock>
    </div>
  );
};

export default POSZReport;
