import { Link } from "react-router-dom";
import { formatDateTime } from "./posApi";

const POSShiftClosedGate = ({ closedShift }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Смена закрыта"
  >
    <div className="w-full max-w-md rounded-2xl bg-white border border-border shadow-xl p-6 space-y-4 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl">
        ⏸
      </div>
      <div>
        <h2 className="text-xl font-bold text-primary">Смена на сегодня закрыта</h2>
        <p className="text-sm text-muted mt-2">
          На выбранном складе Z-отчёт уже сформирован. Новую смену на этом складе можно открыть только
          завтра. Выберите другой склад или обратитесь к администратору платформы.
        </p>
        {closedShift?.shift_number ? (
          <p className="text-xs text-muted mt-3">
            {closedShift.shift_number}
            {closedShift.closed_at ? ` · закрыта ${formatDateTime(closedShift.closed_at)}` : null}
          </p>
        ) : null}
      </div>
      <Link
        to="/pos/shift"
        className="inline-flex w-full items-center justify-center px-4 py-3 rounded-lg border border-primary text-primary font-medium hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        Посмотреть Z-отчёт
      </Link>
    </div>
  </div>
);

export default POSShiftClosedGate;
