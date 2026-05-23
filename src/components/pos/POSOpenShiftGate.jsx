import { useState } from "react";
import { Link } from "react-router-dom";
import { posApi } from "./posApi";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const POSOpenShiftGate = ({ organizationId, warehouseId, onShiftOpened }) => {
  const [openingCash, setOpeningCash] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleOpenShift = async (e) => {
    e.preventDefault();
    if (!organizationId || !warehouseId) return;
    setLoading(true);
    setError("");
    try {
      await posApi.openShift(organizationId, {
        warehouseId,
        openingCash: Number(openingCash) || 0,
      });
      await onShiftOpened?.();
    } catch (err) {
      setError(err.message || "Не удалось открыть смену");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Смена не открыта"
    >
      <div className="w-full max-w-md rounded-2xl bg-white border border-border shadow-xl p-6 space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-2xl">
            🔒
          </div>
          <p className="text-xs uppercase tracking-wide text-muted/70 mt-3">Касса POS</p>
          <h2 className="text-xl font-bold text-primary mt-1">Смена не открыта</h2>
          <p className="text-sm text-muted mt-2">
            Откройте смену, чтобы начать продажи. После закрытия Z-отчёта повторно открыть смену
            сегодня сможет только администратор платформы.
          </p>
        </div>

        <form onSubmit={handleOpenShift} className="space-y-3">
          <div>
            <label htmlFor="gate-opening-cash" className="block text-sm font-medium text-muted mb-1.5">
              Наличные в кассе на начало (UZS)
            </label>
            <input
              id="gate-opening-cash"
              type="number"
              min="0"
              step="100"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className={INPUT_CLASS}
              aria-label="Наличные в кассе на начало смены"
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            tabIndex={0}
            aria-label="Открыть смену"
            className="w-full px-4 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            {loading ? "Открытие…" : "Открыть смену"}
          </button>
        </form>

        <Link
          to="/pos/shift"
          className="inline-flex w-full items-center justify-center px-4 py-2.5 rounded-lg border border-border text-muted text-sm hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          Подробнее о смене
        </Link>
      </div>
    </div>
  );
};

export default POSOpenShiftGate;
