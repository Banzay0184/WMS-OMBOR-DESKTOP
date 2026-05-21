import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getImageUrl } from "../../config";
import POSProductCostHistory from "./POSProductCostHistory";
import POSReceiptModal from "./POSReceiptModal";
import { printSaleReceipt } from "./receiptPdf";
import { getReceiptPrintSettings } from "./receiptPrintSettings";
import { formatMoney, posApi } from "./posApi";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

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
  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPaymentType("cash");
      setCashAmount("");
      setCardAmount("");
      setCustomerId("");
      setNewCustomer({ name: "", phone: "" });
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const parsedCash = Number(cashAmount) || 0;
  const parsedCard = Number(cardAmount) || 0;
  const debtAmount = Math.max(total - parsedCash - parsedCard, 0);
  const requireCustomer = paymentType === "debt" || (paymentType === "mixed" && debtAmount > 0);
  const paymentExceedsTotal = paymentType === "mixed" && parsedCash + parsedCard > total;

  const handleConfirm = async () => {
    setError("");
    if (paymentType === "mixed" && paymentExceedsTotal) {
      setError("Сумма наличных и карты не может превышать итог чека.");
      return;
    }
    if (requireCustomer && !customerId && !newCustomer.name.trim()) {
      setError("Для продажи с долгом нужно выбрать или создать клиента.");
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
        customerId: finalCustomerId,
        cashAmount: parsedCash,
        cardAmount: parsedCard,
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
          <p className="text-sm text-muted">К оплате: <span className="font-semibold text-primary">{formatMoney(total)} UZS</span></p>
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
            {paymentExceedsTotal ? (
              <p className="text-xs text-red-600">Сумма наличных и карты превышает итог чека.</p>
            ) : null}
          </div>
        ) : null}

        {requireCustomer ? (
          <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
            <label className="text-xs text-muted block" htmlFor="payment-customer">
              Выберите клиента
            </label>
            <select
              id="payment-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">— новый клиент —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ""} {Number(c.total_debt) > 0 ? `· долг ${formatMoney(c.total_debt)}` : ""}
                </option>
              ))}
            </select>
            {!customerId ? (
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
            disabled={submitting || creating || paymentExceedsTotal}
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

  const [cart, setCart] = useState([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [costHistoryProduct, setCostHistoryProduct] = useState(null);

  const searchInputRef = useRef(null);

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

  const handleAddProduct = useCallback((product) => {
    if (!salesEnabled) return;
    if (product.stock <= 0) return;
    const defaultPrice = Number(product.sale_price);
    const unitPrice =
      Number.isFinite(defaultPrice) && defaultPrice > 0 ? defaultPrice : 0;
    setCart((prev) => {
      const existing = prev.find((it) => it.product_id === product.id);
      if (existing) {
        const nextQty = Math.min(existing.quantity + 1, product.stock);
        if (nextQty === existing.quantity) return prev;
        return prev.map((it) =>
          it.product_id === product.id
            ? {
                ...it,
                quantity: nextQty,
                unit_price:
                  Number(it.unit_price) > 0 ? it.unit_price : unitPrice,
              }
            : it
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          upc: product.upc,
          unit: product.unit,
          stock: product.stock,
          quantity: 1,
          unit_price: unitPrice,
        },
      ];
    });
  }, [salesEnabled]);

  const handleChangeQty = useCallback((productId, qty) => {
    setCart((prev) =>
      prev
        .map((it) =>
          it.product_id === productId
            ? { ...it, quantity: Math.max(1, Math.min(Number(qty) || 1, it.stock)) }
            : it
        )
    );
  }, []);

  const handleChangePrice = useCallback((productId, price) => {
    setCart((prev) =>
      prev.map((it) =>
        it.product_id === productId ? { ...it, unit_price: price } : it
      )
    );
  }, []);

  const handleRemove = useCallback((productId) => {
    setCart((prev) => prev.filter((it) => it.product_id !== productId));
  }, []);

  const handleClearCart = () => setCart([]);

  const total = useMemo(
    () =>
      cart.reduce((sum, it) => sum + Number(it.unit_price || 0) * (it.quantity || 0), 0),
    [cart]
  );

  const handleConfirmPayment = useCallback(
    async ({ paymentType, customerId, cashAmount, cardAmount }) => {
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
      const sale = await posApi.createSale(organizationId, payload);
      setPaymentOpen(false);
      setCart([]);
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
    [cart, warehouseId, organizationId, storeName, loadProducts, loadCustomers, reloadOverview]
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
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary">Чек ({cart.length})</h2>
          {cart.length > 0 ? (
            <button
              type="button"
              onClick={handleClearCart}
              aria-label="Очистить чек"
              tabIndex={0}
              className="text-xs text-muted hover:text-red-600 transition focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-1"
            >
              Очистить
            </button>
          ) : null}
        </div>
        {cart.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">
            Добавьте товар, нажав на карточку слева.
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
