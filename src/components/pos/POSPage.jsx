import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getImageUrl } from "../../config";
import POSProductCostHistory from "./POSProductCostHistory";
import POSReceiptModal from "./POSReceiptModal";
import { printSaleReceipt } from "./receiptPdf";
import { getReceiptPrintSettings } from "./receiptPrintSettings";
import { formatMoney, MAX_POS_TICKETS, posApi, POS_STORAGE_KEYS } from "./posApi";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const createTicket = (num) => ({
  id: `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  label: `Чек ${num}`,
  cart: [],
});

const cartTotal = (items) =>
  (Array.isArray(items) ? items : []).reduce(
    (sum, it) => sum + Number(it.unit_price || 0) * (it.quantity || 0),
    0
  );

const loadParkedTickets = (organizationId, warehouseId) => {
  if (!organizationId || !warehouseId) return null;
  try {
    const raw = sessionStorage.getItem(POS_STORAGE_KEYS.parkedTickets(organizationId, warehouseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tickets) || parsed.tickets.length === 0) return null;
    if (parsed.tickets.length > MAX_POS_TICKETS) return null;
    const activeTicketId = parsed.tickets.some((t) => t.id === parsed.activeTicketId)
      ? parsed.activeTicketId
      : parsed.tickets[0].id;
    return { tickets: parsed.tickets, activeTicketId };
  } catch {
    return null;
  }
};

const saveParkedTickets = (organizationId, warehouseId, tickets, activeTicketId) => {
  if (!organizationId || !warehouseId) return;
  try {
    sessionStorage.setItem(
      POS_STORAGE_KEYS.parkedTickets(organizationId, warehouseId),
      JSON.stringify({ tickets, activeTicketId })
    );
  } catch {
    // sessionStorage недоступен
  }
};

const TicketTabs = ({
  tickets,
  activeTicketId,
  onSwitch,
  onNew,
  onClose,
  maxTickets,
}) => (
  <div className="px-2 py-2 border-b border-border flex items-center gap-1 overflow-x-auto">
    {tickets.map((ticket) => {
      const isActive = ticket.id === activeTicketId;
      const count = ticket.cart.length;
      const total = cartTotal(ticket.cart);
      return (
        <div key={ticket.id} className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => onSwitch(ticket.id)}
            aria-label={`Переключиться на ${ticket.label}`}
            aria-pressed={isActive}
            tabIndex={0}
            className={
              "px-2.5 py-1.5 rounded-lg text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/30 " +
              (isActive
                ? "bg-primary text-white shadow-soft"
                : "bg-secondary text-muted hover:bg-secondary/80 hover:text-primary")
            }
          >
            <span>{ticket.label}</span>
            {count > 0 ? (
              <span className={"ml-1 tabular-nums " + (isActive ? "text-white/90" : "text-muted")}>
                ({count})
              </span>
            ) : null}
            {total > 0 ? (
              <span
                className={
                  "ml-1 hidden sm:inline tabular-nums " + (isActive ? "text-white/80" : "text-muted/80")
                }
              >
                · {formatMoney(total)}
              </span>
            ) : null}
          </button>
          {tickets.length > 1 ? (
            <button
              type="button"
              onClick={(e) => onClose(ticket.id, e)}
              aria-label={`Закрыть ${ticket.label}`}
              tabIndex={0}
              className="ml-0.5 w-6 h-6 rounded text-muted hover:text-red-600 hover:bg-red-50 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              ×
            </button>
          ) : null}
        </div>
      );
    })}
    {tickets.length < maxTickets ? (
      <button
        type="button"
        onClick={onNew}
        aria-label="Новый чек"
        tabIndex={0}
        className="shrink-0 w-8 h-8 rounded-lg border border-dashed border-border text-muted hover:border-primary hover:text-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30 text-lg leading-none"
      >
        +
      </button>
    ) : null}
  </div>
);

const ProductCard = ({ product, onAdd, onViewCostHistory, disabled, canViewCost }) => {
  const lowStock = product.stock <= 3 && product.stock > 0;
  const outOfStock = product.stock <= 0;
  const imageUrl = getImageUrl(product.image);
  const salePrice = Number(product.sale_price);
  const hasSalePrice = Number.isFinite(salePrice) && salePrice > 0;
  const longPressTimerRef = useRef(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleImagePointerDown = (e) => {
    if (!canViewCost || !onViewCostHistory) return;
    e.stopPropagation();
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      onViewCostHistory(product);
      longPressTimerRef.current = null;
    }, 600);
  };

  const handleImageContextMenu = (e) => {
    if (!canViewCost || !onViewCostHistory) return;
    e.preventDefault();
    e.stopPropagation();
    onViewCostHistory(product);
  };

  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      disabled={disabled || outOfStock}
      tabIndex={0}
      aria-label={`Добавить ${product.name} в чек`}
      className={
        "text-left rounded-xl border bg-white p-3 shadow-soft transition focus:outline-none focus:ring-2 focus:ring-primary/40 flex flex-col gap-2 " +
        (outOfStock
          ? "border-border opacity-50 cursor-not-allowed"
          : "border-border hover:border-primary hover:shadow-md")
      }
    >
      <div
        className="aspect-square w-full rounded-lg bg-secondary overflow-hidden flex items-center justify-center relative"
        onPointerDown={handleImagePointerDown}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        onContextMenu={handleImageContextMenu}
        role="presentation"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover pointer-events-none"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span className="text-2xl text-muted/40 pointer-events-none" aria-hidden="true">
            📦
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-primary truncate" title={product.name}>
        {product.name}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">{product.upc || product.ikpu_code || "—"}</span>
        <span
          className={
            outOfStock
              ? "text-red-600 font-semibold shrink-0"
              : lowStock
              ? "text-amber-600 font-semibold shrink-0"
              : "shrink-0"
          }
        >
          {outOfStock ? "Нет" : `${product.stock} ${product.unit || "шт"}`}
        </span>
      </div>
      {hasSalePrice ? (
        <div className="text-sm font-semibold text-primary tabular-nums">
          {formatMoney(salePrice)} <span className="text-xs font-normal text-muted">UZS</span>
        </div>
      ) : (
        <div className="text-xs text-muted">Цена не задана</div>
      )}
    </button>
  );
};

const CartRow = ({ item, onChangeQty, onRemove, onChangePrice, onViewCostHistory, canViewCost }) => (
  <li className="flex items-start gap-2 px-3 py-2 border-b border-border last:border-b-0">
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-primary truncate" title={item.name}>
        {item.name}
      </div>
      <div className="text-xs text-muted truncate">
        {item.upc || "—"} · остаток {item.stock}
        {canViewCost ? (
          <button
            type="button"
            onClick={() => onViewCostHistory?.({ id: item.product_id, name: item.name })}
            className="ml-2 text-[10px] text-muted/60 hover:text-primary underline decoration-dotted underline-offset-2"
            aria-label={`История прихода ${item.name}`}
            tabIndex={0}
          >
            приход
          </button>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChangeQty(item.product_id, item.quantity - 1)}
          aria-label="Уменьшить количество"
          tabIndex={0}
          className="w-7 h-7 rounded border border-border text-muted hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          −
        </button>
        <input
          type="number"
          min="1"
          max={item.stock}
          value={item.quantity}
          onChange={(e) => onChangeQty(item.product_id, Number(e.target.value))}
          aria-label="Количество"
          className="w-14 text-center px-2 py-1 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={() => onChangeQty(item.product_id, item.quantity + 1)}
          aria-label="Увеличить количество"
          tabIndex={0}
          className="w-7 h-7 rounded border border-border text-muted hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          +
        </button>
        <input
          type="number"
          step="100"
          min="0"
          value={item.unit_price}
          onChange={(e) => onChangePrice(item.product_id, e.target.value)}
          aria-label="Цена за единицу"
          className="w-24 text-right px-2 py-1 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <span className="text-xs text-muted">UZS</span>
      </div>
    </div>
    <div className="text-right shrink-0">
      <div className="text-sm font-semibold text-primary">
        {formatMoney(Number(item.unit_price) * item.quantity)}
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.product_id)}
        aria-label="Удалить позицию"
        tabIndex={0}
        className="mt-1 text-xs text-red-600 hover:underline focus:outline-none focus:ring-2 focus:ring-red-300 rounded"
      >
        Убрать
      </button>
    </div>
  </li>
);

const PaymentModal = ({ open, total, onClose, onConfirm, customers, onReloadCustomers, onCreateCustomer }) => {
  const [paymentType, setPaymentType] = useState("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [receivedCash, setReceivedCash] = useState("");
  const [receivedCard, setReceivedCard] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [usePrepayment, setUsePrepayment] = useState(true);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPaymentType("cash");
      setCashAmount("");
      setCardAmount("");
      setReceivedCash("");
      setReceivedCard("");
      setCustomerId("");
      setUsePrepayment(true);
      setNewCustomer({ name: "", phone: "" });
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const selectedCustomer = customerId
    ? customers.find((c) => Number(c.id) === Number(customerId))
    : null;
  const prepaymentBalance = Number(selectedCustomer?.prepayment_balance || 0);
  const customerDebt = Number(selectedCustomer?.total_debt || 0);
  const prepaymentApplied =
    selectedCustomer && usePrepayment ? Math.min(prepaymentBalance, total) : 0;
  const amountDue = Math.max(total - prepaymentApplied, 0);

  const parsedCash = Number(cashAmount) || 0;
  const parsedCard = Number(cardAmount) || 0;
  const parsedReceivedCash = receivedCash.trim() === "" ? amountDue : Number(receivedCash) || 0;
  const parsedReceivedCard = receivedCard.trim() === "" ? amountDue : Number(receivedCard) || 0;
  const mixedTotalPaid = parsedCash + parsedCard;
  const debtAmount = Math.max(amountDue - parsedCash - parsedCard, 0);
  const mixedSurplus = paymentType === "mixed" && customerId ? Math.max(mixedTotalPaid - amountDue, 0) : 0;
  const cashSurplus =
    paymentType === "cash" && customerId && parsedReceivedCash > amountDue
      ? parsedReceivedCash - amountDue
      : 0;
  const cardSurplus =
    paymentType === "card" && customerId && parsedReceivedCard > amountDue
      ? parsedReceivedCard - amountDue
      : 0;
  const paymentSurplus = mixedSurplus || cashSurplus || cardSurplus;
  const debtPaidFromSurplus = customerId ? Math.min(paymentSurplus, customerDebt) : 0;
  const prepaymentDeposit = customerId ? Math.max(paymentSurplus - debtPaidFromSurplus, 0) : 0;
  const changeAmount =
    paymentType === "cash" && !customerId && parsedReceivedCash > amountDue
      ? parsedReceivedCash - amountDue
      : 0;
  const insufficientCash = paymentType === "cash" && amountDue > 0 && parsedReceivedCash < amountDue;
  const insufficientCard = paymentType === "card" && amountDue > 0 && parsedReceivedCard < amountDue;
  const mixedOverpayWithoutCustomer =
    paymentType === "mixed" && !customerId && mixedTotalPaid > amountDue;
  const cardOverpayWithoutCustomer =
    paymentType === "card" && !customerId && parsedReceivedCard > amountDue;
  const requireCustomer =
    paymentType === "debt" ||
    (paymentType === "mixed" && debtAmount > 0) ||
    cashSurplus > 0 ||
    cardSurplus > 0 ||
    mixedSurplus > 0;
  const showOptionalCustomer =
    paymentType === "cash" || paymentType === "card" || paymentType === "mixed";

  const handleConfirm = async () => {
    setError("");
    if (mixedOverpayWithoutCustomer) {
      setError("При переплате укажите клиента — остаток зачисляется на предоплату.");
      return;
    }
    if (cardOverpayWithoutCustomer) {
      setError("При переплате картой укажите клиента — остаток зачисляется на предоплату.");
      return;
    }
    if (insufficientCash) {
      setError("Недостаточно наличных для оплаты.");
      return;
    }
    if (insufficientCard) {
      setError("Недостаточно средств по карте для оплаты.");
      return;
    }
    if (requireCustomer && !customerId && !newCustomer.name.trim()) {
      setError("Выберите или создайте клиента.");
      return;
    }
    setSubmitting(true);
    try {
      let finalCustomerId = customerId ? Number(customerId) : null;
      if (requireCustomer && !finalCustomerId) {
        setCreating(true);
        const created = await onCreateCustomer({
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim(),
        });
        setCreating(false);
        finalCustomerId = created?.id;
        await onReloadCustomers();
      }
      await onConfirm({
        paymentType,
        customerId: finalCustomerId || (customerId ? Number(customerId) : null),
        cashAmount: parsedCash,
        cardAmount: parsedCard,
        receivedCash: paymentType === "cash" ? parsedReceivedCash : null,
        receivedCard: paymentType === "card" ? parsedReceivedCard : null,
        usePrepayment: Boolean((finalCustomerId || customerId) && usePrepayment),
      });
    } catch (err) {
      setError(err.message || "Не удалось оформить");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Оформление продажи"
    >
      <div className="bg-white rounded-2xl shadow-soft w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-primary">Оплата</h2>
          <p className="text-sm text-muted">
            Итог: <span className="font-semibold text-primary">{formatMoney(total)} UZS</span>
          </p>
          {prepaymentApplied > 0 ? (
            <p className="text-xs text-emerald-700 mt-1">
              Зачтено с предоплаты: {formatMoney(prepaymentApplied)} UZS · к оплате{" "}
              {formatMoney(amountDue)} UZS
            </p>
          ) : selectedCustomer && prepaymentBalance > 0 && !usePrepayment ? (
            <p className="text-xs text-muted mt-1">
              Баланс предоплаты не списывается · к оплате {formatMoney(amountDue)} UZS
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "cash", label: "Наличные" },
            { id: "card", label: "Карта" },
            { id: "debt", label: "В долг" },
            { id: "mixed", label: "Смешанная" },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPaymentType(opt.id)}
              tabIndex={0}
              aria-label={`Выбрать оплату: ${opt.label}`}
              aria-pressed={paymentType === opt.id}
              className={
                "px-3 py-2.5 rounded-lg text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/30 " +
                (paymentType === opt.id
                  ? "bg-primary text-white shadow-soft"
                  : "bg-white border border-border text-muted hover:bg-secondary")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {paymentType === "cash" ? (
          <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
            <div>
              <label className="text-xs text-muted block mb-1" htmlFor="payment-received-cash">
                Получено наличными (UZS)
              </label>
              <input
                id="payment-received-cash"
                type="number"
                min="0"
                step="1000"
                value={receivedCash}
                onChange={(e) => setReceivedCash(e.target.value)}
                placeholder={String(amountDue || total)}
                aria-label="Сумма полученная от клиента"
                className={INPUT_CLASS}
              />
            </div>
            {prepaymentDeposit > 0 && paymentType === "cash" ? (
              <p className="text-xs text-emerald-700">
                На предоплату: {formatMoney(prepaymentDeposit)} UZS
              </p>
            ) : null}
            {debtPaidFromSurplus > 0 && paymentType === "cash" ? (
              <p className="text-xs text-amber-700">
                Погашение долга: −{formatMoney(debtPaidFromSurplus)} UZS
              </p>
            ) : null}
            {changeAmount > 0 ? (
              <p className="text-xs text-muted">Сдача: {formatMoney(changeAmount)} UZS</p>
            ) : null}
            {insufficientCash ? (
              <p className="text-xs text-red-600">Недостаточно наличных для оплаты.</p>
            ) : null}
          </div>
        ) : null}

        {paymentType === "card" ? (
          <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
            <div>
              <label className="text-xs text-muted block mb-1" htmlFor="payment-received-card">
                Получено картой (UZS)
              </label>
              <input
                id="payment-received-card"
                type="number"
                min="0"
                step="1000"
                value={receivedCard}
                onChange={(e) => setReceivedCard(e.target.value)}
                placeholder={String(amountDue || total)}
                aria-label="Сумма списанная с карты клиента"
                className={INPUT_CLASS}
              />
            </div>
            {prepaymentDeposit > 0 && paymentType === "card" ? (
              <p className="text-xs text-emerald-700">
                На предоплату: {formatMoney(prepaymentDeposit)} UZS
              </p>
            ) : null}
            {debtPaidFromSurplus > 0 && paymentType === "card" ? (
              <p className="text-xs text-amber-700">
                Погашение долга: −{formatMoney(debtPaidFromSurplus)} UZS
              </p>
            ) : null}
            {cardOverpayWithoutCustomer ? (
              <p className="text-xs text-amber-700">Укажите клиента для зачисления переплаты на баланс.</p>
            ) : null}
            {insufficientCard ? (
              <p className="text-xs text-red-600">Недостаточно средств по карте для оплаты.</p>
            ) : null}
          </div>
        ) : null}

        {paymentType === "mixed" ? (
          <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted block mb-1" htmlFor="payment-cash-amount">
                  Наличные (UZS)
                </label>
                <input
                  id="payment-cash-amount"
                  type="number"
                  min="0"
                  step="1000"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0"
                  aria-label="Сумма наличными"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1" htmlFor="payment-card-amount">
                  Карта (UZS)
                </label>
                <input
                  id="payment-card-amount"
                  type="number"
                  min="0"
                  step="1000"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                  placeholder="0"
                  aria-label="Сумма картой"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-muted">Остаток в долг:</span>
              <span className={debtAmount > 0 ? "font-semibold text-amber-700" : "font-medium text-primary"}>
                {formatMoney(debtAmount)} UZS
              </span>
            </div>
            {mixedSurplus > 0 ? (
              <p className="text-xs text-emerald-700">
                Переплата {formatMoney(mixedSurplus)} UZS
                {prepaymentDeposit > 0 ? ` · на предоплату ${formatMoney(prepaymentDeposit)}` : ""}
                {debtPaidFromSurplus > 0 ? ` · на долг ${formatMoney(debtPaidFromSurplus)}` : ""}
              </p>
            ) : null}
            {mixedOverpayWithoutCustomer ? (
              <p className="text-xs text-amber-700">Укажите клиента для зачисления переплаты на баланс.</p>
            ) : null}
          </div>
        ) : null}

        {(requireCustomer || showOptionalCustomer) ? (
          <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
            <label className="text-xs text-muted block" htmlFor="payment-customer">
              {showOptionalCustomer && !requireCustomer
                ? "Клиент (необязательно, для предоплаты)"
                : "Выберите клиента"}
            </label>
            <select
              id="payment-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">— {requireCustomer ? "новый клиент" : "без клиента"} —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ""}
                  {Number(c.total_debt) > 0 ? ` · долг ${formatMoney(c.total_debt)}` : ""}
                  {Number(c.prepayment_balance) > 0
                    ? ` · предоплата ${formatMoney(c.prepayment_balance)}`
                    : ""}
                </option>
              ))}
            </select>
            {selectedCustomer ? (
              <div className="rounded-lg bg-white border border-border px-3 py-2 text-xs space-y-2">
                {customerDebt > 0 ? (
                  <p className="text-amber-800">
                    Долг клиента: <span className="font-semibold">{formatMoney(customerDebt)} UZS</span>
                  </p>
                ) : null}
                {prepaymentBalance > 0 ? (
                  <p className="text-emerald-800">
                    Предоплата: <span className="font-semibold">{formatMoney(prepaymentBalance)} UZS</span>
                  </p>
                ) : null}
                {prepaymentBalance > 0 ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usePrepayment}
                      onChange={(e) => setUsePrepayment(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary/30"
                      aria-label="Списать с баланса предоплаты"
                    />
                    <span className="text-muted">Списать с баланса предоплаты</span>
                  </label>
                ) : null}
                {paymentSurplus > 0 && customerDebt > 0 ? (
                  <p className="text-muted">
                    Переплата сначала погашает долг, остаток — на предоплату.
                  </p>
                ) : null}
              </div>
            ) : null}
            {requireCustomer && !customerId ? (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Имя"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                  aria-label="Имя клиента"
                  className={INPUT_CLASS}
                />
                <input
                  type="text"
                  placeholder="Телефон"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                  aria-label="Телефон клиента"
                  className={INPUT_CLASS}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-2">{error}</div>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            tabIndex={0}
            aria-label="Отмена"
            className="px-4 py-2 rounded-lg border border-border text-muted text-sm hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || creating || insufficientCash || insufficientCard || mixedOverpayWithoutCustomer || cardOverpayWithoutCustomer}
            tabIndex={0}
            aria-label="Завершить продажу"
            className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            {submitting ? "Сохранение…" : "Завершить"}
          </button>
        </div>
      </div>
    </div>
  );
};

const POSPage = () => {
  const { organizationId, warehouseId, reloadOverview, permissions, isShiftOpen, overview } =
    useOutletContext();
  const storeName = overview?.organization?.name || "Магазин";
  const canViewCost = Boolean(permissions?.can_view_cost);
  const salesEnabled = isShiftOpen !== false;

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState("");

  const [tickets, setTickets] = useState(() => [createTicket(1)]);
  const [activeTicketId, setActiveTicketId] = useState(() => tickets[0]?.id);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [costHistoryProduct, setCostHistoryProduct] = useState(null);

  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!organizationId || !warehouseId) return;
    const saved = loadParkedTickets(organizationId, warehouseId);
    if (saved) {
      setTickets(saved.tickets);
      setActiveTicketId(saved.activeTicketId);
      return;
    }
    const initial = createTicket(1);
    setTickets([initial]);
    setActiveTicketId(initial.id);
  }, [organizationId, warehouseId]);

  useEffect(() => {
    saveParkedTickets(organizationId, warehouseId, tickets, activeTicketId);
  }, [organizationId, warehouseId, tickets, activeTicketId]);

  const activeTicket = useMemo(
    () => tickets.find((t) => t.id === activeTicketId) ?? tickets[0],
    [tickets, activeTicketId]
  );
  const cart = activeTicket?.cart ?? [];

  const setActiveCart = useCallback(
    (updater) => {
      setTickets((prev) =>
        prev.map((t) =>
          t.id === activeTicketId
            ? {
                ...t,
                cart: typeof updater === "function" ? updater(t.cart) : updater,
              }
            : t
        )
      );
    },
    [activeTicketId]
  );

  // Debounce поиск
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadProducts = useCallback(async () => {
    if (!organizationId || !warehouseId) return;
    setLoadingProducts(true);
    setProductsError("");
    try {
      const data = await posApi.listProducts(organizationId, {
        warehouseId,
        q: debouncedSearch,
      });
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setProductsError(err.message || "Не удалось загрузить товары");
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [organizationId, warehouseId, debouncedSearch]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const loadCustomers = useCallback(async () => {
    if (!organizationId) return;
    try {
      const data = await posApi.listCustomers(organizationId);
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setCustomers([]);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const handleViewCostHistory = useCallback((product) => {
    if (!canViewCost || !product?.id) return;
    setCostHistoryProduct(product);
  }, [canViewCost]);

  const handleAddProduct = useCallback(
    (product) => {
      if (!salesEnabled) return;
      if (product.stock <= 0) return;
      const defaultPrice = Number(product.sale_price);
      const unitPrice = Number.isFinite(defaultPrice) && defaultPrice > 0 ? defaultPrice : 0;

      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== activeTicketId) return t;

          const reservedElsewhere = prev
            .filter((other) => other.id !== activeTicketId)
            .reduce((sum, other) => {
              const line = other.cart.find((it) => it.product_id === product.id);
              return sum + (line?.quantity || 0);
            }, 0);
          const maxAvailable = Math.max(product.stock - reservedElsewhere, 0);
          if (maxAvailable <= 0) return t;

          const existing = t.cart.find((it) => it.product_id === product.id);
          if (existing) {
            const nextQty = Math.min(existing.quantity + 1, maxAvailable);
            if (nextQty === existing.quantity) return t;
            return {
              ...t,
              cart: t.cart.map((it) =>
                it.product_id === product.id
                  ? {
                      ...it,
                      quantity: nextQty,
                      stock: product.stock,
                      unit_price: Number(it.unit_price) > 0 ? it.unit_price : unitPrice,
                    }
                  : it
              ),
            };
          }

          return {
            ...t,
            cart: [
              ...t.cart,
              {
                product_id: product.id,
                name: product.name,
                upc: product.upc,
                unit: product.unit,
                stock: product.stock,
                quantity: 1,
                unit_price: unitPrice,
              },
            ],
          };
        })
      );
    },
    [salesEnabled, activeTicketId]
  );

  const handleChangeQty = useCallback(
    (productId, qty) => {
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== activeTicketId) return t;
          return {
            ...t,
            cart: t.cart
              .map((it) => {
                if (it.product_id !== productId) return it;
                const reservedElsewhere = prev
                  .filter((other) => other.id !== activeTicketId)
                  .reduce((sum, other) => {
                    const line = other.cart.find((c) => c.product_id === productId);
                    return sum + (line?.quantity || 0);
                  }, 0);
                const maxAvailable = Math.max(it.stock - reservedElsewhere, 1);
                return {
                  ...it,
                  quantity: Math.max(1, Math.min(Number(qty) || 1, maxAvailable)),
                };
              }),
          };
        })
      );
    },
    [activeTicketId]
  );

  const handleChangePrice = useCallback(
    (productId, price) => {
      setActiveCart((prev) =>
        prev.map((it) => (it.product_id === productId ? { ...it, unit_price: price } : it))
      );
    },
    [setActiveCart]
  );

  const handleRemove = useCallback(
    (productId) => {
      setActiveCart((prev) => prev.filter((it) => it.product_id !== productId));
    },
    [setActiveCart]
  );

  const handleClearCart = useCallback(() => {
    setActiveCart([]);
  }, [setActiveCart]);

  const handleSwitchTicket = useCallback((ticketId) => {
    setActiveTicketId(ticketId);
    if (searchInputRef.current) searchInputRef.current.focus();
  }, []);

  const handleNewTicket = useCallback(() => {
    if (tickets.length >= MAX_POS_TICKETS) return;
    const ticket = createTicket(tickets.length + 1);
    setTickets((prev) => [...prev, ticket]);
    setActiveTicketId(ticket.id);
    if (searchInputRef.current) searchInputRef.current.focus();
  }, [tickets.length]);

  const handleCloseTicket = useCallback(
    (ticketId, event) => {
      event?.stopPropagation();
      const target = tickets.find((t) => t.id === ticketId);
      if (target?.cart?.length > 0) {
        const ok = window.confirm(`${target.label}: удалить чек с товарами?`);
        if (!ok) return;
      }

      setTickets((prev) => {
        if (prev.length <= 1) {
          const fresh = createTicket(1);
          setActiveTicketId(fresh.id);
          return [fresh];
        }
        const next = prev.filter((t) => t.id !== ticketId).map((t, index) => ({
          ...t,
          label: `Чек ${index + 1}`,
        }));
        if (activeTicketId === ticketId) {
          setActiveTicketId(next[0]?.id ?? "");
        }
        return next;
      });
    },
    [tickets, activeTicketId]
  );

  const total = useMemo(
    () =>
      cart.reduce((sum, it) => sum + Number(it.unit_price || 0) * (it.quantity || 0), 0),
    [cart]
  );

  const handleConfirmPayment = useCallback(
    async ({ paymentType, customerId, cashAmount, cardAmount, receivedCash, receivedCard, usePrepayment }) => {
      if (cart.length === 0) return;
      if (cart.some((it) => Number(it.unit_price) <= 0)) {
        throw new Error("Укажите цену для каждой позиции.");
      }
      const payload = {
        warehouse_id: warehouseId,
        payment_type: paymentType,
        customer_id: customerId,
        items: cart.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: String(Number(it.unit_price).toFixed(2)),
        })),
      };
      if (paymentType === "mixed") {
        payload.cash_amount = String(Number(cashAmount || 0).toFixed(2));
        payload.card_amount = String(Number(cardAmount || 0).toFixed(2));
      }
      if (paymentType === "cash" && receivedCash != null) {
        payload.received_cash = String(Number(receivedCash || 0).toFixed(2));
      }
      if (paymentType === "card" && receivedCard != null) {
        payload.received_card = String(Number(receivedCard || 0).toFixed(2));
      }
      if (customerId) {
        payload.use_prepayment = usePrepayment !== false;
      }
      const sale = await posApi.createSale(organizationId, payload);
      setPaymentOpen(false);
      setTickets((prev) => {
        const next = prev.filter((t) => t.id !== activeTicketId).map((t, index) => ({
          ...t,
          label: `Чек ${index + 1}`,
        }));
        if (next.length === 0) {
          const fresh = createTicket(1);
          setActiveTicketId(fresh.id);
          return [fresh];
        }
        if (!next.some((t) => t.id === activeTicketId)) {
          setActiveTicketId(next[0].id);
        }
        return next;
      });
      setReceiptSale(sale);
      const printSettings = getReceiptPrintSettings(organizationId);
      if (printSettings.autoPrintOnSale) {
        try {
          await printSaleReceipt({ sale, storeName, organizationId });
        } catch {
          // Печать недоступна — чек остаётся в модальном окне
        }
      }
      await loadProducts();
      await loadCustomers();
      await reloadOverview();
      if (searchInputRef.current) searchInputRef.current.focus();
    },
    [cart, warehouseId, organizationId, storeName, loadProducts, loadCustomers, reloadOverview, activeTicketId]
  );

  const handleCreateCustomer = useCallback(
    async (payload) => posApi.createCustomer(organizationId, payload),
    [organizationId]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
      {/* Левая колонка: товары */}
      <section className="space-y-3">
        <div className="rounded-xl bg-white border border-border shadow-soft p-3">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Поиск по названию, UPC или ИКПУ…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Поиск товара"
            className={INPUT_CLASS}
            autoFocus
          />
        </div>

        {productsError ? (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-3 text-sm">
            {productsError}
          </div>
        ) : null}

        {loadingProducts ? (
          <div className="rounded-xl bg-white border border-border shadow-soft p-6 text-center text-muted text-sm">
            Загрузка товаров…
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl bg-white border border-border shadow-soft p-6 text-center text-muted text-sm">
            Товары не найдены.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onAdd={handleAddProduct}
                onViewCostHistory={handleViewCostHistory}
                canViewCost={canViewCost}
                disabled={!salesEnabled}
              />
            ))}
          </div>
        )}
      </section>

      {/* Правая колонка: корзина */}
      <aside className="rounded-xl bg-white border border-border shadow-soft flex flex-col h-fit lg:sticky lg:top-32">
        <TicketTabs
          tickets={tickets}
          activeTicketId={activeTicketId}
          onSwitch={handleSwitchTicket}
          onNew={handleNewTicket}
          onClose={handleCloseTicket}
          maxTickets={MAX_POS_TICKETS}
        />
        <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-primary truncate">
            {activeTicket?.label ?? "Чек"} ({cart.length})
          </h2>
          <span className="text-[10px] text-muted shrink-0">
            {tickets.length}/{MAX_POS_TICKETS}
          </span>
          {cart.length > 0 ? (
            <button
              type="button"
              onClick={handleClearCart}
              aria-label="Очистить чек"
              tabIndex={0}
              className="text-xs text-muted hover:text-red-600 transition focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-1 shrink-0"
            >
              Очистить
            </button>
          ) : null}
        </div>
        {cart.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted space-y-1">
            <p>Добавьте товар, нажав на карточку слева.</p>
            <p className="text-xs">До {MAX_POS_TICKETS} чеков — кнопка «+» сверху.</p>
          </div>
        ) : (
          <ul className="max-h-[50vh] overflow-y-auto">
            {cart.map((item) => (
              <CartRow
                key={item.product_id}
                item={item}
                onChangeQty={handleChangeQty}
                onChangePrice={handleChangePrice}
                onRemove={handleRemove}
                onViewCostHistory={handleViewCostHistory}
                canViewCost={canViewCost}
              />
            ))}
          </ul>
        )}
        <div className="border-t border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Итого:</span>
            <span className="text-xl font-bold text-primary">{formatMoney(total)} UZS</span>
          </div>
          <button
            type="button"
            onClick={() => setPaymentOpen(true)}
            disabled={!salesEnabled || cart.length === 0 || total <= 0}
            tabIndex={0}
            aria-label="Перейти к оплате"
            className="w-full px-4 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Оплатить
          </button>
        </div>
      </aside>

      <PaymentModal
        open={paymentOpen}
        total={total}
        onClose={() => setPaymentOpen(false)}
        onConfirm={handleConfirmPayment}
        customers={customers}
        onReloadCustomers={loadCustomers}
        onCreateCustomer={handleCreateCustomer}
      />

      <POSReceiptModal
        sale={receiptSale}
        storeName={storeName}
        organizationId={organizationId}
        onClose={() => setReceiptSale(null)}
      />

      {costHistoryProduct ? (
        <POSProductCostHistory
          organizationId={organizationId}
          warehouseId={warehouseId}
          product={costHistoryProduct}
          onClose={() => setCostHistoryProduct(null)}
        />
      ) : null}
    </div>
  );
};

export default POSPage;
