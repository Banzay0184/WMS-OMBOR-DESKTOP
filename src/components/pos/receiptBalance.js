import { formatMoney } from "./posApi";

/** Сколько фактически списано с карты клиента. */
export const getCardReceivedFromCustomer = (sale) => {
  if (!sale) return 0;
  const tendered =
    sale.card_tendered != null && sale.card_tendered !== ""
      ? Number(sale.card_tendered)
      : null;
  const cardAmount = Number(sale.card_amount || 0);
  if (tendered != null && !Number.isNaN(tendered) && tendered >= 0) {
    return tendered;
  }
  if (sale.payment_type === "card" || sale.payment_type === "mixed") {
    return cardAmount > 0 ? cardAmount : 0;
  }
  return 0;
};

/** Сколько наличных фактически получено от клиента (передано в кассу). */
export const getCashReceivedFromCustomer = (sale) => {
  if (!sale) return 0;
  const tendered =
    sale.cash_tendered != null && sale.cash_tendered !== ""
      ? Number(sale.cash_tendered)
      : null;
  const cashAmount = Number(sale.cash_amount || 0);
  if (tendered != null && !Number.isNaN(tendered) && tendered >= 0) {
    return tendered;
  }
  if (sale.payment_type === "cash" || sale.payment_type === "mixed") {
    return cashAmount > 0 ? cashAmount : 0;
  }
  return 0;
};

/**
 * Блок «Баланс клиента» на чеке — только движения по операции и итоговые суммы.
 */
export const buildCustomerBalanceRows = (sale) => {
  if (!sale?.customer_name && !sale?.customer) return [];

  const debtBefore = Number(sale.customer_debt_before);
  const debtAfter = Number(sale.customer_debt_after);
  const prepBefore = Number(sale.customer_prepayment_before);
  const prepAfter = Number(sale.customer_prepayment_after);
  const hasSnapshot = Number.isFinite(debtBefore) || Number.isFinite(prepBefore);
  if (!hasSnapshot) return [];

  const debtPaid = Number(sale.debt_paid_from_payment || 0);
  const debtAdded = Number(sale.debt_amount_at_sale || 0);
  const prepApplied = Number(sale.prepayment_applied || 0);
  const prepDeposited = Number(sale.prepayment_deposited || 0);
  const rows = [];

  if (prepApplied > 0) {
    rows.push({
      label: "Оплата с баланса",
      value: formatMoney(prepApplied),
      tone: "minus",
    });
  }

  if (debtPaid > 0 && !(getCashReceivedFromCustomer(sale) > 0 || getCardReceivedFromCustomer(sale) > 0)) {
    rows.push({
      label: "Погашено старого долга",
      value: formatMoney(debtPaid),
      tone: "minus",
    });
  }

  if (debtAdded > 0) {
    rows.push({
      label: "Новый долг по чеку",
      value: formatMoney(debtAdded),
      tone: "plus",
    });
  }

  if (prepDeposited > 0) {
    rows.push({
      label: "Зачислено на предоплату",
      value: formatMoney(prepDeposited),
      tone: "plus",
    });
  }

  if (Number.isFinite(debtAfter)) {
    const debtUnchanged =
      Number.isFinite(debtBefore) &&
      debtBefore === debtAfter &&
      debtPaid === 0 &&
      debtAdded === 0;
    rows.push({
      label: debtUnchanged && debtAfter > 0 ? "Долг (без изменений)" : "Долг клиента",
      value: formatMoney(debtAfter),
      tone: "total",
    });
  }

  if (Number.isFinite(prepAfter)) {
    rows.push({
      label: "Предоплата клиента",
      value: formatMoney(prepAfter),
      tone: "total",
    });
  }

  return rows;
};
