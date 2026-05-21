/**
 * Web Bluetooth + ESC/POS для термопринтеров (58/50 мм).
 * Chrome/Edge, HTTPS или localhost.
 */

import { PAYMENT_LABEL, formatDate, formatMoney } from "./posApi";
import { getReceiptPrintSettings, getResolvedReceiptLayout } from "./receiptPrintSettings";

const ESC = 0x1b;
const GS = 0x1d;

const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73c3-11d3-0bc4-00e04bbfc099",
];

const CMD = {
  INIT: () => u8([ESC, 0x40]),
  CENTER: () => u8([ESC, 0x61, 0x01]),
  LEFT: () => u8([ESC, 0x61, 0x00]),
  BOLD_ON: () => u8([ESC, 0x45, 0x01]),
  BOLD_OFF: () => u8([ESC, 0x45, 0x00]),
  DOUBLE_ON: () => u8([ESC, 0x21, 0x10]),
  NORMAL: () => u8([ESC, 0x21, 0x00]),
  CUT: () => u8([GS, 0x56, 0x00]),
  FEED: (n = 3) => u8([ESC, 0x64, n]),
};

const u8 = (arr) => new Uint8Array(arr);

const connection = {
  device: null,
  characteristic: null,
};

export const isBluetoothSupported = () =>
  typeof navigator !== "undefined" && Boolean(navigator.bluetooth);

export const isBluetoothConnected = () =>
  Boolean(connection.characteristic && connection.device?.gatt?.connected);

export const getBluetoothDeviceName = () => connection.device?.name || "";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const sendRaw = async (data) => {
  if (!connection.characteristic) {
    throw new Error("Bluetooth-принтер не подключён");
  }
  const chunkSize = 20;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await connection.characteristic.writeValue(chunk);
    await delay(30);
  }
};

const sendCmd = async (fn) => {
  await sendRaw(fn());
  await delay(40);
};

const sendText = async (text) => {
  const encoder = new TextEncoder();
  await sendRaw(encoder.encode(text));
  await delay(40);
};

const concatBuffers = (parts) => {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

/** Ширина строки в символах по размеру бумаги */
const lineWidthForPaper = (paperSizeId) => {
  if (paperSizeId === "80") return 48;
  if (paperSizeId === "58") return 36;
  return 32;
};

const padLine = (left, right, width) => {
  const l = String(left);
  const r = String(right);
  const space = Math.max(1, width - l.length - r.length);
  return l + " ".repeat(space) + r;
};

const truncate = (s, max) => {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
};

const formatReceiptTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

const buildItemQtyLine = (it) => {
  const qty = Number(it.quantity) || 0;
  const unit = Number(it.unit_price);
  if (unit > 0) return `${qty} x ${formatMoney(unit)}`;
  if (qty > 1) return `${qty} шт`;
  return qty === 1 ? "1 шт" : "";
};

const ornamentLine = (width) => {
  const dot = "· ";
  const count = Math.max(4, Math.floor(width / dot.length));
  return dot.repeat(count).slice(0, width);
};

const onDisconnected = () => {
  connection.device = null;
  connection.characteristic = null;
};

/** Пользователь закрыл диалог выбора устройства без выбора */
export const isBluetoothUserCancelled = (error) =>
  Boolean(error?.isUserCancelled);

/**
 * Понятные сообщения вместо технических DOMException от Web Bluetooth.
 */
export const normalizeBluetoothError = (error) => {
  const message = String(error?.message || "");
  const name = String(error?.name || "");

  if (
    name === "NotFoundError" &&
    (/cancel/i.test(message) || /requestDevice/i.test(message))
  ) {
    const err = new Error("Выбор принтера отменён");
    err.isUserCancelled = true;
    return err;
  }

  if (name === "NotFoundError") {
    return new Error("Принтер не найден. Включите Bluetooth и принтер, затем повторите.");
  }

  if (name === "SecurityError") {
    return new Error("Нет доступа к Bluetooth. Используйте HTTPS или localhost в Chrome/Edge.");
  }

  if (name === "NetworkError" || /gatt|disconnected/i.test(message)) {
    return new Error("Связь с принтером прервана. Включите принтер и подключитесь снова.");
  }

  if (error instanceof Error && message) {
    return error;
  }

  return new Error(message || "Ошибка Bluetooth");
};

/**
 * Подключение к Bluetooth-принтеру (диалог выбора устройства).
 */
export const connectBluetoothPrinter = async () => {
  if (!isBluetoothSupported()) {
    throw new Error(
      "Web Bluetooth недоступен. Используйте Chrome или Edge (HTTPS или localhost)."
    );
  }

  let device;
  try {
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });
  } catch (err) {
    throw normalizeBluetoothError(err);
  }

  let server;
  try {
    server = await device.gatt.connect();
  } catch (err) {
    throw normalizeBluetoothError(err);
  }
  let service = null;
  for (const uuid of PRINTER_SERVICES) {
    try {
      service = await server.getPrimaryService(uuid);
      break;
    } catch {
      // try next
    }
  }
  if (!service) {
    const services = await server.getPrimaryServices();
    service = services[0];
  }
  if (!service) {
    throw new Error("Не найден сервис принтера");
  }

  const characteristics = await service.getCharacteristics();
  const writable = characteristics.find(
    (c) => c.properties.write || c.properties.writeWithoutResponse
  );
  if (!writable) {
    throw new Error("Не найдена характеристика записи на принтер");
  }

  connection.device = device;
  connection.characteristic = writable;
  device.addEventListener("gattserverdisconnected", onDisconnected);

  await sendCmd(CMD.INIT);
  return device.name || "Bluetooth-принтер";
};

export const disconnectBluetoothPrinter = async () => {
  if (connection.device?.gatt?.connected) {
    await connection.device.gatt.disconnect();
  }
  onDisconnected();
};

/**
 * Сборка ESC/POS данных чека продажи.
 */
export const buildEscPosSaleReceipt = ({
  sale,
  storeName,
  organizationId,
  inn,
  footer,
}) => {
  const layout = getResolvedReceiptLayout(organizationId);
  const settings = getReceiptPrintSettings(organizationId);
  const width = lineWidthForPaper(settings.paperSizeId);
  const parts = [];
  const pushCmd = (fn) => parts.push(fn());
  const pushTxt = (t) => parts.push(new TextEncoder().encode(t));

  pushCmd(CMD.INIT);
  pushCmd(CMD.CENTER);
  pushTxt(`${ornamentLine(width)}\n`);
  pushCmd(CMD.DOUBLE_ON);
  pushCmd(CMD.BOLD_ON);
  pushTxt(`${truncate(storeName || "Магазин", width)}\n`);
  pushCmd(CMD.NORMAL);
  pushCmd(CMD.BOLD_OFF);
  pushTxt("ЧЕК ПРОДАЖИ\n");
  if (inn) {
    pushTxt(`ИНН ${inn}\n`);
  }
  pushTxt(`${ornamentLine(width)}\n`);
  pushTxt("\n");

  pushCmd(CMD.LEFT);
  pushTxt(padLine("Чек №", sale.sale_number || "—", width) + "\n");
  pushTxt(padLine("Дата", formatDate(sale.created_at), width) + "\n");
  pushTxt(padLine("Время", formatReceiptTime(sale.created_at), width) + "\n");
  pushTxt(`${"=".repeat(width)}\n`);
  pushTxt(padLine("ТОВАР", "СУММА", width) + "\n");
  pushTxt(`${"-".repeat(width)}\n`);

  const items = Array.isArray(sale.items) ? sale.items : [];
  for (const it of items) {
    const name = truncate(it.name_snapshot, width);
    pushTxt(`${name}\n`);
    const qtyLine = buildItemQtyLine(it);
    pushTxt(padLine(`  ${qtyLine}`, formatMoney(it.subtotal), width) + "\n");
  }

  pushTxt(`${"=".repeat(width)}\n`);
  const paymentLabel = PAYMENT_LABEL[sale.payment_type] || sale.payment_type;
  pushTxt(padLine("Оплата", paymentLabel, width) + "\n");

  if (sale.customer_name) {
    pushTxt(padLine("Клиент", truncate(sale.customer_name, 14), width) + "\n");
  }
  if (sale.payment_type === "mixed") {
    pushTxt(padLine("Наличные", formatMoney(sale.cash_amount), width) + "\n");
    pushTxt(padLine("Карта", formatMoney(sale.card_amount), width) + "\n");
  }
  if (Number(sale.remaining_debt) > 0 && sale.payment_type !== "cash") {
    pushTxt(padLine("Долг", formatMoney(sale.remaining_debt), width) + "\n");
  }

  pushTxt(`${"-".repeat(width)}\n`);
  pushCmd(CMD.BOLD_ON);
  pushTxt(padLine("ИТОГО", `${formatMoney(sale.total_amount)} UZS`, width) + "\n");
  pushCmd(CMD.BOLD_OFF);

  if (footer) {
    pushCmd(CMD.CENTER);
    pushTxt("\n");
    pushTxt(`${"-".repeat(width)}\n`);
    const footerLines = String(footer).split("\n");
    for (const line of footerLines) {
      pushTxt(`${line.trim()}\n`);
    }
    pushTxt(`${ornamentLine(width)}\n`);
  }

  pushTxt("\n\n");
  pushCmd(CMD.FEED);
  pushCmd(CMD.CUT);

  return concatBuffers(parts);
};

export const printSaleReceiptBluetooth = async ({
  sale,
  storeName,
  organizationId,
  inn,
  footer,
}) => {
  if (!isBluetoothConnected()) {
    throw new Error("Сначала подключите Bluetooth-принтер");
  }
  const data = buildEscPosSaleReceipt({
    sale,
    storeName,
    organizationId,
    inn,
    footer,
  });
  await sendRaw(data);
};

/** Тестовая печать */
export const printBluetoothTestPage = async () => {
  if (!isBluetoothConnected()) {
    throw new Error("Сначала подключите Bluetooth-принтер");
  }
  await sendCmd(CMD.INIT);
  await sendCmd(CMD.CENTER);
  await sendCmd(CMD.DOUBLE_ON);
  await sendCmd(CMD.BOLD_ON);
  await sendText("ТЕСТ\n");
  await sendCmd(CMD.NORMAL);
  await sendCmd(CMD.BOLD_OFF);
  await sendCmd(CMD.LEFT);
  await sendText(`Bluetooth OK\n`);
  await sendText(`${new Date().toLocaleString("ru-RU")}\n`);
  await sendText(`${getBluetoothDeviceName()}\n`);
  await sendText("\n\n");
  await sendCmd(CMD.CUT);
};
