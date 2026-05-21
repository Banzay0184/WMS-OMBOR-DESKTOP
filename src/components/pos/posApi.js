import { authFetch } from "../../api/client";

const base = (orgId) => `platform/organizations/${orgId}/pos`;

const parseJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const ensureOk = async (res, fallbackMessage = "Ошибка запроса") => {
  if (res.ok) return parseJson(res);
  const data = await parseJson(res);
  const message = data?.detail || fallbackMessage;
  const error = new Error(message);
  error.code = data?.code || `http_${res.status}`;
  error.status = res.status;
  throw error;
};

export const posApi = {
  async overview(orgId) {
    const res = await authFetch(`${base(orgId)}/overview/`);
    return ensureOk(res, "Не удалось загрузить сводку POS");
  },

  async listProducts(orgId, { warehouseId, q = "" }) {
    const params = new URLSearchParams({ warehouse_id: String(warehouseId) });
    if (q.trim()) params.set("q", q.trim());
    const res = await authFetch(`${base(orgId)}/products/?${params.toString()}`);
    return ensureOk(res, "Не удалось загрузить товары");
  },

  async getProductCostHistory(orgId, productId, { warehouseId } = {}) {
    const params = new URLSearchParams();
    if (warehouseId != null) params.set("warehouse_id", String(warehouseId));
    const qs = params.toString();
    const res = await authFetch(
      `${base(orgId)}/products/${productId}/cost-history/${qs ? `?${qs}` : ""}`
    );
    return ensureOk(res, "Не удалось загрузить историю прихода");
  },

  async listSales(orgId, query = {}) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v != null && v !== "") params.set(k, String(v));
    });
    const res = await authFetch(`${base(orgId)}/sales/?${params.toString()}`);
    return ensureOk(res, "Не удалось загрузить чеки");
  },

  async getSale(orgId, saleId) {
    const res = await authFetch(`${base(orgId)}/sales/${saleId}/`);
    return ensureOk(res, "Не удалось загрузить чек");
  },

  async createSale(orgId, payload) {
    const res = await authFetch(`${base(orgId)}/sales/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return ensureOk(res, "Не удалось создать продажу");
  },

  async listCustomers(orgId, { q = "" } = {}) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const res = await authFetch(`${base(orgId)}/customers/?${params.toString()}`);
    return ensureOk(res, "Не удалось загрузить клиентов");
  },

  async getCustomer(orgId, customerId) {
    const res = await authFetch(`${base(orgId)}/customers/${customerId}/`);
    return ensureOk(res, "Не удалось загрузить клиента");
  },

  async createCustomer(orgId, payload) {
    const res = await authFetch(`${base(orgId)}/customers/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return ensureOk(res, "Не удалось создать клиента");
  },

  async createPayment(orgId, payload) {
    const res = await authFetch(`${base(orgId)}/payments/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return ensureOk(res, "Не удалось провести платёж");
  },

  async createReturn(orgId, payload) {
    const res = await authFetch(`${base(orgId)}/returns/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return ensureOk(res, "Не удалось оформить возврат");
  },

  async getCurrentShift(orgId, warehouseId, cashierId = null) {
    const params = new URLSearchParams({ warehouse_id: String(warehouseId) });
    if (cashierId != null) params.set("cashier_id", String(cashierId));
    const res = await authFetch(`${base(orgId)}/shifts/current/?${params.toString()}`);
    return ensureOk(res, "Не удалось загрузить текущую смену");
  },

  async openShift(orgId, { warehouseId, openingCash = 0, cashierId }) {
    const res = await authFetch(`${base(orgId)}/shifts/open/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouse_id: warehouseId,
        cashier_id: cashierId,
        opening_cash: String(Number(openingCash) || 0),
      }),
    });
    return ensureOk(res, "Не удалось открыть смену");
  },

  async closeShift(orgId, shiftId, payload = {}) {
    const res = await authFetch(`${base(orgId)}/shifts/${shiftId}/close/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return ensureOk(res, "Не удалось закрыть смену");
  },

  async getShift(orgId, shiftId) {
    const res = await authFetch(`${base(orgId)}/shifts/${shiftId}/`);
    return ensureOk(res, "Не удалось загрузить смену");
  },

  async listShifts(orgId, { warehouseId, limit = 30 } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (warehouseId != null) params.set("warehouse_id", String(warehouseId));
    const res = await authFetch(`${base(orgId)}/shifts/?${params.toString()}`);
    return ensureOk(res, "Не удалось загрузить историю смен");
  },
};

export const POS_STORAGE_KEYS = {
  warehouseId: (orgId) => `pos.warehouseId.${orgId}`,
};

export const moneyFmt = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return moneyFmt.format(Math.round(num));
};

export const formatDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const PAYMENT_LABEL = {
  cash: "Наличные",
  card: "Карта",
  debt: "В долг",
  mixed: "Смешанная",
};

export const STATUS_LABEL = {
  completed: "Завершена",
  debt_pending: "Ожидает оплаты",
  partially_refunded: "Частичный возврат",
  refunded: "Возврат",
  cancelled: "Отменена",
};

export const STATUS_CLASS = {
  completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  debt_pending: "bg-amber-50 text-amber-800 border border-amber-200",
  partially_refunded: "bg-sky-50 text-sky-800 border border-sky-200",
  refunded: "bg-slate-100 text-slate-700 border border-slate-200",
  cancelled: "bg-red-50 text-red-700 border border-red-200",
};
