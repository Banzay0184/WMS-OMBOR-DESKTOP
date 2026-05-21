import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  PAYMENT_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  formatDateTime,
  formatMoney,
  posApi,
} from "./posApi";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const CreateCustomerForm = ({ onCreated, onClose }) => {
  const [form, setForm] = useState({ name: "", phone: "", telegram_id: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onCreated(form);
      onClose();
    } catch (err) {
      setError(err.message || "Не удалось создать клиента");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border shadow-soft p-4 space-y-3">
      <h2 className="text-sm font-semibold text-primary">Новый клиент</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="Имя *"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
          aria-label="Имя клиента"
          className={INPUT_CLASS}
        />
        <input
          type="text"
          placeholder="Телефон"
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          aria-label="Телефон клиента"
          className={INPUT_CLASS}
        />
        <input
          type="text"
          placeholder="Telegram ID"
          value={form.telegram_id}
          onChange={(e) => setForm((p) => ({ ...p, telegram_id: e.target.value }))}
          aria-label="Telegram ID клиента"
          className={INPUT_CLASS}
        />
        <input
          type="text"
          placeholder="Заметка"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          aria-label="Заметка о клиенте"
          className={INPUT_CLASS}
        />
      </div>
      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-2">{error}</div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          tabIndex={0}
          aria-label="Отменить"
          className="px-4 py-2 rounded-lg border border-border text-muted text-sm hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={submitting}
          tabIndex={0}
          aria-label="Создать клиента"
          className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
        >
          {submitting ? "Сохранение…" : "Создать"}
        </button>
      </div>
    </form>
  );
};

const DebtModal = ({ customer, organizationId, onClose, onPaid }) => {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentSale, setPaymentSale] = useState(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    setError("");
    try {
      const data = await posApi.getCustomer(organizationId, customer.id);
      setDetail(data);
    } catch (err) {
      setError(err.message || "Не удалось загрузить клиента");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [customer, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!customer) return null;

  const handlePay = async () => {
    setActionError("");
    if (!paymentSale) {
      setActionError("Выберите чек.");
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setActionError("Введите корректную сумму.");
      return;
    }
    setSubmitting(true);
    try {
      await posApi.createPayment(organizationId, {
        sale_id: paymentSale,
        amount: String(num.toFixed(2)),
        method,
      });
      setAmount("");
      setPaymentSale(null);
      await load();
      await onPaid();
    } catch (err) {
      setActionError(err.message || "Не удалось провести платёж");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Долги клиента ${customer.name}`}
    >
      <div className="bg-white rounded-2xl shadow-soft w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-primary">{customer.name}</h2>
            <p className="text-sm text-muted">
              {customer.phone || "Без телефона"} {customer.telegram_id ? `· @${customer.telegram_id}` : ""}
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Текущий долг:{" "}
              <span className="font-bold">{formatMoney(detail?.total_debt ?? customer.total_debt)} UZS</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            tabIndex={0}
            className="text-muted hover:text-primary p-1 focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-muted text-center py-6">Загрузка…</div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div>
        ) : detail?.debt_sales?.length ? (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted">
                <tr>
                  <th className="text-left px-3 py-2">№</th>
                  <th className="text-left px-3 py-2">Дата</th>
                  <th className="text-right px-3 py-2">Сумма</th>
                  <th className="text-right px-3 py-2">Оплачено</th>
                  <th className="text-right px-3 py-2">Остаток</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {detail.debt_sales.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-primary">{s.sale_number}</td>
                    <td className="px-3 py-2 text-muted">{formatDateTime(s.created_at)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(s.total_amount)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(s.paid_amount)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-amber-700">
                      {formatMoney(s.remaining_debt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setPaymentSale(s.id)}
                        aria-label={`Внести платёж по чеку ${s.sale_number}`}
                        tabIndex={0}
                        className={
                          "px-3 py-1 rounded-lg text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/30 " +
                          (paymentSale === s.id
                            ? "bg-primary text-white"
                            : "border border-border text-muted hover:bg-secondary")
                        }
                      >
                        {paymentSale === s.id ? "Выбран" : "Платёж"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl bg-secondary p-4 text-sm text-muted text-center">
            Нет открытых долгов.
          </div>
        )}

        {paymentSale ? (
          <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="number"
                step="100"
                min="0"
                placeholder="Сумма UZS"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Сумма платежа"
                className={INPUT_CLASS + " sm:w-40"}
              />
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                aria-label="Способ оплаты"
                className={INPUT_CLASS + " sm:w-40"}
              >
                <option value="cash">Наличные</option>
                <option value="card">Карта</option>
              </select>
              <button
                type="button"
                onClick={handlePay}
                disabled={submitting}
                tabIndex={0}
                aria-label="Принять оплату"
                className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              >
                {submitting ? "…" : "Принять"}
              </button>
              <button
                type="button"
                onClick={() => setPaymentSale(null)}
                tabIndex={0}
                aria-label="Отмена выбора чека"
                className="px-3 py-2 rounded-lg border border-border text-muted text-sm hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                Сброс
              </button>
            </div>
            {actionError ? (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-2">{actionError}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const POSCustomers = () => {
  const { organizationId, reloadOverview } = useOutletContext();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [activeDebt, setActiveDebt] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await posApi.listCustomers(organizationId, { q: debounced });
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить клиентов");
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(
    async (payload) => {
      await posApi.createCustomer(organizationId, payload);
      await load();
    },
    [organizationId, load]
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-border shadow-soft p-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Поиск по имени или телефону…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск клиентов"
          className={INPUT_CLASS + " sm:max-w-md"}
        />
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          aria-label="Добавить клиента"
          tabIndex={0}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          + Клиент
        </button>
      </div>

      {showCreate ? (
        <CreateCustomerForm onCreated={handleCreate} onClose={() => setShowCreate(false)} />
      ) : null}

      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div>
      ) : null}

      <div className="rounded-xl bg-white border border-border shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-muted text-sm">Загрузка клиентов…</div>
        ) : customers.length === 0 ? (
          <div className="p-6 text-center text-muted text-sm">Клиенты не найдены.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted">
                <tr>
                  <th className="text-left px-3 py-2">Имя</th>
                  <th className="text-left px-3 py-2">Телефон</th>
                  <th className="text-left px-3 py-2">Telegram</th>
                  <th className="text-right px-3 py-2">Долг</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-medium text-primary">{c.name}</td>
                    <td className="px-3 py-2 text-muted">{c.phone || "—"}</td>
                    <td className="px-3 py-2 text-muted">{c.telegram_id || "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold text-amber-700">
                      {Number(c.total_debt) > 0 ? formatMoney(c.total_debt) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveDebt(c)}
                        aria-label={`Открыть долги клиента ${c.name}`}
                        tabIndex={0}
                        className="text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
                      >
                        Долги / платежи
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DebtModal
        customer={activeDebt}
        organizationId={organizationId}
        onClose={() => setActiveDebt(null)}
        onPaid={async () => {
          await load();
          await reloadOverview();
        }}
      />
    </div>
  );
};

export default POSCustomers;
