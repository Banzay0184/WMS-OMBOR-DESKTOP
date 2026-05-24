/**
 * Web Bluetooth + ESC/POS для термопринтеров (58/50 мм).
 * Chrome/Edge, HTTPS или localhost.
 */

import { DEVELOPER_REQUISITES } from "../../config";
import { PAYMENT_LABEL, formatDate, formatMoney, formatSalePaymentLabel } from "./posApi";
import { buildCustomerBalanceRows, getCardReceivedFromCustomer, getCashReceivedFromCustomer } from "./receiptBalance";
import { getReceiptPrintSettings } from "./receiptPrintSettings";
import { compactMoneyForColumn } from "./receiptTableMoney";

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
  DOUBLE_HEIGHT: () => u8([ESC, 0x21, 0x10]),
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

const padCell = (value, width, align = "left") => {
  const text = String(value ?? "");
  if (text.length >= width) return text.slice(0, width);
  const pad = " ".repeat(width - text.length);
  if (align === "right") return pad + text;
  if (align === "center") {
    const left = Math.floor(pad.length / 2);
    return pad.slice(0, left) + text + pad.slice(left);
  }
  return text + pad;
};

const buildEscPosTableHeader = (width) => {
  if (width >= 44) {
    const cols = [2, 16, 4, 9, 10];
    return (
      padCell("№", cols[0], "center") +
      padCell("Товар", cols[1]) +
      padCell("Кол", cols[2], "center") +
      padCell("Цена", cols[3], "right") +
      padCell("Сумма", cols[4], "right")
    );
  }
  if (width >= 36) {
    const cols = [2, 14, 3, 8, 8];
    return (
      padCell("№", cols[0], "center") +
      padCell("Товар", cols[1]) +
      padCell("К", cols[2], "center") +
      padCell("Цена", cols[3], "right") +
      padCell("Сум", cols[4], "right")
    );
  }
  return padLine("№", "Товар / Кол / Сумма", width);
};

const buildEscPosTableRow = (index, item, width) => {
  const qty = Number(item.quantity) || 0;
  const unit = Number(item.unit_price) || 0;
  const name = truncate(item.name_snapshot, width >= 44 ? 16 : width >= 36 ? 14 : width - 8);

  if (width >= 44) {
    const cols = [2, 16, 4, 9, 10];
    const priceText = unit > 0 ? compactMoneyForColumn(unit, cols[3]) : "-";
    const sumText = compactMoneyForColumn(item.subtotal, cols[4]);
    return (
      padCell(String(index + 1), cols[0], "center") +
      padCell(name, cols[1]) +
      padCell(String(qty), cols[2], "center") +
      padCell(priceText, cols[3], "right") +
      padCell(sumText, cols[4], "right")
    );
  }
  if (width >= 36) {
    const cols = [2, 14, 3, 8, 8];
    const priceText = unit > 0 ? compactMoneyForColumn(unit, cols[3]) : "-";
    const sumText = compactMoneyForColumn(item.subtotal, cols[4]);
    return (
      padCell(String(index + 1), cols[0], "center") +
      padCell(name, cols[1]) +
      padCell(String(qty), cols[2], "center") +
      padCell(priceText, cols[3], "right") +
      padCell(sumText, cols[4], "right")
    );
  }
  const sumText = compactMoneyForColumn(item.subtotal, Math.max(8, width - name.length - 6));
  return padLine(`${index + 1}. ${name}`, `${qty} x ${sumText}`, width);
};

const buildEscPosDeveloperBlock = (width) => {
  const { title, company, phone, site } = DEVELOPER_REQUISITES;
  const lines = [title, company];
  if (phone) lines.push(`Tel: ${phone}`);
  if (site) lines.push(site);
  return lines.map((line) => truncate(line, width)).join("\n") + "\n";
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
  const settings = getReceiptPrintSettings(organizationId);
  const receiptLayoutId = settings.receiptLayoutId === "list" ? "list" : "table";
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
  pushTxt("=".repeat(width) + "\n");

  const items = Array.isArray(sale.items) ? sale.items : [];
  if (receiptLayoutId === "table") {
    pushCmd(CMD.DOUBLE_HEIGHT);
    pushCmd(CMD.BOLD_ON);
    pushTxt(buildEscPosTableHeader(width) + "\n");
    pushCmd(CMD.BOLD_OFF);
    pushTxt("-".repeat(width) + "\n");
    items.forEach((it, index) => {
      pushTxt(buildEscPosTableRow(index, it, width) + "\n");
    });
    pushCmd(CMD.NORMAL);
  } else {
    pushTxt(padLine("ТОВАР", "СУММА", width) + "\n");
    pushTxt("-".repeat(width) + "\n");
    for (const it of items) {
      const name = truncate(it.name_snapshot, width);
      pushTxt(`${name}\n`);
      const qtyLine = buildItemQtyLine(it);
      pushTxt(padLine(`  ${qtyLine}`, formatMoney(it.subtotal), width) + "\n");
    }
  }

  pushTxt("=".repeat(width) + "\n");
  const paymentLabel = formatSalePaymentLabel(sale);
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
  if (Number(sale.prepayment_applied) > 0) {
    pushTxt(padLine("С баланса", formatMoney(sale.prepayment_applied), width) + "\n");
  }
  const cashReceived = getCashReceivedFromCustomer(sale);
  const cardReceived = getCardReceivedFromCustomer(sale);
  const cashForGoods = Number(sale.cash_amount || 0);
  if (
    sale.payment_type === "cash" &&
    Number(sale.prepayment_applied) > 0 &&
    cashForGoods > 0
  ) {
    pushTxt(padLine("Нал. (покупка)", formatMoney(cashForGoods), width) + "\n");
  }
  if (cashReceived > 0 && (sale.payment_type === "cash" || sale.payment_type === "mixed")) {
    pushCmd(CMD.BOLD_ON);
    pushTxt(padLine("Наличными", formatMoney(cashReceived), width) + "\n");
    pushCmd(CMD.BOLD_OFF);
  }
  if (cardReceived > 0 && (sale.payment_type === "card" || sale.payment_type === "mixed")) {
    pushCmd(CMD.BOLD_ON);
    pushTxt(padLine("Картой", formatMoney(cardReceived), width) + "\n");
    pushCmd(CMD.BOLD_OFF);
  }
  if (Number(sale.debt_paid_from_payment) > 0) {
    pushTxt(padLine("На долг", formatMoney(sale.debt_paid_from_payment), width) + "\n");
  }
  if (Number(sale.prepayment_deposited) > 0) {
    pushTxt(padLine("На предоплату", formatMoney(sale.prepayment_deposited), width) + "\n");
  }
  if (
    sale.payment_type === "cash" &&
    Number(sale.cash_tendered) > Number(sale.cash_amount) &&
    Number(sale.prepayment_deposited) === 0 &&
    Number(sale.debt_paid_from_payment) === 0
  ) {
    pushTxt(
      padLine("Сдача", formatMoney(Number(sale.cash_tendered) - Number(sale.cash_amount)), width) + "\n"
    );
  }

  pushTxt("-".repeat(width) + "\n");
  pushCmd(CMD.BOLD_ON);
  pushTxt(padLine("ИТОГО", `${formatMoney(sale.total_amount)} UZS`, width) + "\n");
  pushCmd(CMD.BOLD_OFF);

  const balanceRows = buildCustomerBalanceRows(sale);
  if (balanceRows.length > 0) {
    pushTxt("\n");
    pushCmd(CMD.BOLD_ON);
    pushTxt(padLine("Баланс клиента", "", width) + "\n");
    pushCmd(CMD.BOLD_OFF);
    for (const row of balanceRows) {
      pushTxt(padLine(row.label, row.value, width) + "\n");
    }
  }

  if (footer) {
    pushCmd(CMD.CENTER);
    pushTxt("\n");
    pushTxt("-".repeat(width) + "\n");
    const footerLines = String(footer).split("\n");
    for (const line of footerLines) {
      pushTxt(`${line.trim()}\n`);
    }
  }

  if (receiptLayoutId === "table") {
    pushCmd(CMD.CENTER);
    pushTxt("\n");
    pushTxt("-".repeat(width) + "\n");
    pushTxt(buildEscPosDeveloperBlock(width));
    pushTxt(`${ornamentLine(width)}\n`);
  } else if (footer) {
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
