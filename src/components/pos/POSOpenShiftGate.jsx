import { Link } from "react-router-dom";

const POSOpenShiftGate = () => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Смена не открыта"
  >
    <div className="w-full max-w-md rounded-2xl bg-white border border-border shadow-xl p-6 space-y-4 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-2xl">
        🔒
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted/70">Касса POS</p>
        <h2 className="text-xl font-bold text-primary mt-1">Смена не открыта</h2>
        <p className="text-sm text-muted mt-2">
          Продажи недоступны, пока администратор платформы не откроет смену в панели разработчика.
          Обратитесь к администратору или подождите открытия смены.
        </p>
      </div>
      <Link
        to="/pos/shift"
        className="inline-flex w-full items-center justify-center px-4 py-3 rounded-lg border border-primary text-primary font-medium hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        Статус смены
      </Link>
    </div>
  </div>
);

export default POSOpenShiftGate;
