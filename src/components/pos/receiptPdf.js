import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { DEVELOPER_REQUISITES } from "../../config";
import { PAYMENT_LABEL, formatDate, formatMoney, formatSalePaymentLabel } from "./posApi";
import {
  isBluetoothConnected,
  printSaleReceiptBluetooth,
} from "./bluetoothPrinter";
import { getReceiptPrintSettings, getResolvedReceiptLayout } from "./receiptPrintSettings";
import {
  compactMoneyForColumn,
  formatReceiptTableMoneyText,
  getReceiptMoneySizeClass,
} from "./receiptTableMoney";
import { buildCustomerBalanceRows, getCardReceivedFromCustomer, getCashReceivedFromCustomer } from "./receiptBalance";

/** @deprecated используйте getResolvedReceiptLayout */
export const THERMAL_RECEIPT = {
  paperWidthMm: 50,
  printWidthMm: 50,
  widthPx203: 400,
  widthPx300: 590,
};

const PAYMENT_LABEL_THERMAL = {
  cash: "Наличные",
  card: "Карта",
  debt: "В долг",
  mixed: "Смешанная",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const truncateName = (name, maxLen = 28) => {
  const s = String(name || "").trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
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
  if (unit > 0) {
    return `${qty} × ${formatMoney(unit)}`;
  }
  if (qty > 1) return `${qty} шт`;
  return qty === 1 ? "1 шт" : "";
};

/** Общие стили чека (печать + предпросмотр в UI) */
export const THERMAL_RECEIPT_COMPONENT_CSS = `
  .receipt {
    width: 100%;
    color: #000;
    line-height: 1.3;
  }
  .receipt-ornament {
    text-align: center;
    font-size: 0.75em;
    letter-spacing: 0.15em;
    color: #444;
    margin: 2px 0 6px;
    overflow: hidden;
    white-space: nowrap;
  }
  .receipt-header {
    text-align: center;
    margin-bottom: 6px;
  }
  .receipt .store {
    font-size: var(--receipt-title-pt, 11pt);
    font-weight: 800;
    letter-spacing: 0.02em;
    margin: 0 0 3px;
    word-break: break-word;
    line-height: 1.2;
  }
  .receipt-type {
    margin: 0 0 4px;
    font-size: var(--receipt-meta-pt, 9pt);
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #333;
  }
  .receipt-inn {
    margin: 0;
    font-size: var(--receipt-meta-pt, 9pt);
    color: #444;
  }
  .receipt-meta-block {
    margin: 4px 0 2px;
  }
  .receipt-meta-block .row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    font-size: var(--receipt-meta-pt, 9pt);
    margin: 1px 0;
  }
  .receipt-meta-block .label {
    color: #555;
    flex-shrink: 0;
  }
  .receipt-meta-block .value {
    font-weight: 600;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .sep {
    border: none;
    margin: 5px 0;
  }
  .sep-heavy {
    border-top: 2px solid #000;
  }
  .sep-light {
    border-top: 1px dashed #888;
  }
  .items-head {
    display: flex;
    justify-content: space-between;
    font-size: calc(var(--receipt-meta-pt, 9pt) - 0.5pt);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #333;
    margin-bottom: 4px;
  }
  .receipt-item {
    margin: 5px 0;
    padding-bottom: 4px;
    border-bottom: 1px dotted #ccc;
  }
  .receipt-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .item-name {
    font-size: var(--receipt-body-pt, 10pt);
    font-weight: 600;
    word-break: break-word;
    margin: 0 0 2px;
    line-height: 1.2;
  }
  .item-calc {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    font-size: var(--receipt-meta-pt, 9pt);
  }
  .item-qty {
    color: #444;
    font-variant-numeric: tabular-nums;
  }
  .item-sum {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .receipt-summary .row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    font-size: var(--receipt-meta-pt, 9pt);
    margin: 2px 0;
  }
  .receipt-summary .label { color: #555; }
  .receipt-summary .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .receipt-summary .row.received-total {
    margin-top: 5px;
    padding-top: 5px;
    border-top: 1px dashed #888;
    font-size: calc(var(--receipt-meta-pt, 9pt) + 1pt);
    font-weight: 800;
  }
  .receipt-summary .row.received-total .value {
    font-weight: 800;
  }
  .receipt-total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-top: 6px;
    padding: 5px 0 2px;
    border-top: 2px solid #000;
    font-size: var(--receipt-title-pt, 11pt);
    font-weight: 800;
  }
  .receipt-total .total-label {
    letter-spacing: 0.08em;
  }
  .receipt-total .total-value {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .receipt-balance {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #bbb;
  }
  .receipt-balance-title {
    font-size: var(--receipt-meta-pt, 9pt);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
    color: #333;
  }
  .receipt-balance .row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    font-size: var(--receipt-meta-pt, 9pt);
    margin: 2px 0;
  }
  .receipt-balance .label { color: #555; }
  .receipt-balance .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .receipt-balance .row.total .value { font-weight: 800; }
  .receipt-footer {
    text-align: center;
    font-size: var(--receipt-meta-pt, 9pt);
    color: #333;
    margin-top: 6px;
    white-space: pre-wrap;
    line-height: 1.35;
  }
  .receipt-table-wrap {
    margin: 6px 0;
    overflow: visible;
  }
  .receipt.receipt-layout-table .receipt-table-wrap {
    margin-left: -2px;
    margin-right: -2px;
    width: calc(100% + 4px);
  }
  .receipt-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: var(--receipt-table-pt, var(--receipt-body-pt, 10pt));
  }
  .receipt-table th,
  .receipt-table td {
    border: 2px solid #000;
    padding: 5px 4px;
    vertical-align: middle;
    word-break: break-word;
    line-height: 1.25;
  }
  .receipt-table th {
    font-weight: 800;
    text-align: center;
    font-size: var(--receipt-table-head-pt, calc(var(--receipt-body-pt, 10pt) + 1pt));
    padding: 6px 4px;
    letter-spacing: 0.02em;
  }
  .receipt-table .col-num {
    width: 7%;
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .receipt-table .col-name {
    width: 40%;
    font-weight: 600;
    font-size: var(--receipt-table-pt, var(--receipt-body-pt, 10pt));
  }
  .receipt-table .col-qty {
    width: 11%;
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .receipt-table .col-price,
  .receipt-table .col-sum {
    width: 21%;
    text-align: right;
    padding-left: 2px;
    padding-right: 2px;
    overflow: visible;
  }
  .receipt-table .money-cell {
    text-align: right;
    vertical-align: middle;
  }
  .receipt-table .money-value {
    display: inline-block;
    max-width: 100%;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1.1;
    white-space: nowrap;
    transform-origin: right center;
  }
  .receipt-table .money-value.money-normal {
    font-size: 1em;
  }
  .receipt-table .money-value.money-compact {
    font-size: 0.88em;
  }
  .receipt-table .money-value.money-tight {
    font-size: 0.76em;
  }
  .receipt-table .money-value.money-micro {
    font-size: 0.64em;
    letter-spacing: -0.02em;
  }
  .receipt-table .money-value.money-nano {
    font-size: 0.54em;
    letter-spacing: -0.03em;
  }
  .receipt-table tbody tr:nth-child(even) td {
    background: #f7f7f7;
  }
  .receipt-dev {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed #888;
    text-align: center;
    font-size: calc(var(--receipt-meta-pt, 9pt) - 1pt);
    color: #444;
    line-height: 1.35;
  }
  .receipt-dev-title {
    font-weight: 700;
    color: #222;
    margin: 0 0 3px;
    font-size: calc(var(--receipt-meta-pt, 9pt) - 0.5pt);
  }
  .receipt-dev p {
    margin: 1px 0;
  }
`;

export const buildThermalPrintStyles = (layout) => {
  const paperMm = layout.paperWidthMm;
  const bodyPt = layout.fontSizePt;
  const metaPt = Math.max(8, bodyPt - 1);
  const titlePt = Math.min(13, bodyPt + 2);
  const tablePt = Math.min(12, bodyPt + 1);
  const tableHeadPt = Math.min(13, bodyPt + 2);

  return `
  @page {
    size: ${paperMm}mm auto;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    width: ${paperMm}mm;
    max-width: ${paperMm}mm;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: ${layout.fontFamily};
    font-size: ${bodyPt}pt;
    line-height: 1.3;
    color: #000;
    padding: 2mm 1mm 4mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    --receipt-body-pt: ${bodyPt}pt;
    --receipt-meta-pt: ${metaPt}pt;
    --receipt-title-pt: ${titlePt}pt;
    --receipt-table-pt: ${tablePt}pt;
    --receipt-table-head-pt: ${tableHeadPt}pt;
  }
  ${THERMAL_RECEIPT_COMPONENT_CSS}
`;
};

const receiptStyleVars = (fontSizePt) => {
  const bodyPt = fontSizePt;
  const metaPt = Math.max(8, bodyPt - 1);
  const titlePt = Math.min(13, bodyPt + 2);
  const tablePt = Math.min(12, bodyPt + 1);
  const tableHeadPt = Math.min(13, bodyPt + 2);
  return {
    ["--receipt-body-pt"]: `${bodyPt}pt`,
    ["--receipt-meta-pt"]: `${metaPt}pt`,
    ["--receipt-title-pt"]: `${titlePt}pt`,
    ["--receipt-table-pt"]: `${tablePt}pt`,
    ["--receipt-table-head-pt"]: `${tableHeadPt}pt`,
  };
};

export const getThermalReceiptPreviewStyle = (layout) => ({
  width: layout.previewWidthPx,
  maxWidth: "100%",
  fontFamily: layout.fontFamily,
  fontSize: `${layout.fontSizePt}pt`,
  ...receiptStyleVars(layout.fontSizePt),
});

const buildListItemsHtml = (items, layout) => {
  const itemsHtml = items
    .map((it) => {
      const qtyLine = buildItemQtyLine(it);
      return `
        <div class="receipt-item">
          <div class="item-name">${escapeHtml(truncateName(it.name_snapshot, layout.nameMaxLen))}</div>
          <div class="item-calc">
            <span class="item-qty">${escapeHtml(qtyLine)}</span>
            <span class="item-sum">${formatMoney(it.subtotal)}</span>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <section class="items-section" aria-label="Товары">
      <div class="items-head">
        <span>Товар</span>
        <span>Сумма</span>
      </div>
      ${itemsHtml}
    </section>
  `;
};

const buildReceiptTableMoneyCell = (value, paperSizeId) => {
  const text = formatReceiptTableMoneyText(value);
  if (!text) return "—";
  const sizeClass = getReceiptMoneySizeClass(text, paperSizeId);
  return `<span class="money-value ${sizeClass}">${escapeHtml(text)}</span>`;
};

const buildTableItemsHtml = (items, layout, paperSizeId) => {
  const rows = items
    .map((it, index) => {
      const qty = Number(it.quantity) || 0;
      const unit = Number(it.unit_price) || 0;
      return `
        <tr>
          <td class="col-num">${index + 1}</td>
          <td class="col-name">${escapeHtml(truncateName(it.name_snapshot, layout.nameMaxLen))}</td>
          <td class="col-qty">${qty}</td>
          <td class="col-price money-cell">${buildReceiptTableMoneyCell(unit, paperSizeId)}</td>
          <td class="col-sum money-cell">${buildReceiptTableMoneyCell(it.subtotal, paperSizeId)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <section class="items-section receipt-table-wrap" aria-label="Товары">
      <table class="receipt-table">
        <thead>
          <tr>
            <th class="col-num">№</th>
            <th class="col-name">Товар</th>
            <th class="col-qty">Кол</th>
            <th class="col-price">Цена</th>
            <th class="col-sum">Сумма</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
};

const buildDeveloperRequisitesHtml = () => {
  const { title, company, phone, site } = DEVELOPER_REQUISITES;
  return `
    <section class="receipt-dev" aria-label="Реквизиты разработчика">
      <p class="receipt-dev-title">${escapeHtml(title)}</p>
      <p>${escapeHtml(company)}</p>
      ${phone ? `<p>Тел: ${escapeHtml(phone)}</p>` : ""}
      ${site ? `<p>${escapeHtml(site)}</p>` : ""}
    </section>
  `;
};

const buildSummaryRowsHtml = (sale, layout) => {
  const paymentLabel = formatSalePaymentLabel(sale);
  const summaryRows = [];
  summaryRows.push(
    `<div class="row"><span class="label">Оплата</span><span class="value">${escapeHtml(paymentLabel)}</span></div>`
  );
  if (sale.customer_name) {
    summaryRows.push(
      `<div class="row"><span class="label">Клиент</span><span class="value">${escapeHtml(truncateName(sale.customer_name, Math.max(12, layout.nameMaxLen - 8)))}</span></div>`
    );
  }
  if (sale.payment_type === "mixed") {
    summaryRows.push(
      `<div class="row"><span class="label">Наличные</span><span class="value">${formatMoney(sale.cash_amount)}</span></div>`,
      `<div class="row"><span class="label">Карта</span><span class="value">${formatMoney(sale.card_amount)}</span></div>`
    );
    if (Number(sale.debt_amount_at_sale || sale.remaining_debt) > 0) {
      summaryRows.push(
        `<div class="row"><span class="label">Долг</span><span class="value">${formatMoney(sale.remaining_debt)}</span></div>`
      );
    }
  } else if (sale.payment_type === "debt" && Number(sale.remaining_debt) > 0) {
    summaryRows.push(
      `<div class="row"><span class="label">Долг</span><span class="value">${formatMoney(sale.remaining_debt)}</span></div>`
    );
  }
  if (Number(sale.prepayment_applied) > 0) {
    summaryRows.push(
      `<div class="row"><span class="label">С баланса клиента</span><span class="value">${formatMoney(sale.prepayment_applied)}</span></div>`
    );
  }
  const cashReceived = getCashReceivedFromCustomer(sale);
  const cardReceived = getCardReceivedFromCustomer(sale);
  const cashForGoods = Number(sale.cash_amount || 0);
  if (
    sale.payment_type === "cash" &&
    Number(sale.prepayment_applied) > 0 &&
    cashForGoods > 0
  ) {
    summaryRows.push(
      `<div class="row"><span class="label">Наличными (покупка)</span><span class="value">${formatMoney(cashForGoods)}</span></div>`
    );
  }
  if (cashReceived > 0 && (sale.payment_type === "cash" || sale.payment_type === "mixed")) {
    summaryRows.push(
      `<div class="row received-total"><span class="label">Получено наличными</span><span class="value">${formatMoney(cashReceived)} UZS</span></div>`
    );
  }
  if (cardReceived > 0 && (sale.payment_type === "card" || sale.payment_type === "mixed")) {
    summaryRows.push(
      `<div class="row received-total"><span class="label">Получено картой</span><span class="value">${formatMoney(cardReceived)} UZS</span></div>`
    );
  }
  if (Number(sale.debt_paid_from_payment) > 0) {
    summaryRows.push(
      `<div class="row"><span class="label">Из оплаты на долг</span><span class="value">${formatMoney(sale.debt_paid_from_payment)}</span></div>`
    );
  }
  if (Number(sale.prepayment_deposited) > 0) {
    summaryRows.push(
      `<div class="row"><span class="label">На предоплату</span><span class="value">${formatMoney(sale.prepayment_deposited)}</span></div>`
    );
  }
  if (
    sale.payment_type === "cash" &&
    Number(sale.cash_tendered) > Number(sale.cash_amount) &&
    Number(sale.prepayment_deposited) === 0 &&
    Number(sale.debt_paid_from_payment) === 0
  ) {
    summaryRows.push(
      `<div class="row"><span class="label">Сдача</span><span class="value">${formatMoney(Number(sale.cash_tendered) - Number(sale.cash_amount))}</span></div>`
    );
  }
  return summaryRows.join("");
};

const buildBalanceBlockHtml = (sale) => {
  const balanceRows = buildCustomerBalanceRows(sale);
  if (!balanceRows.length) return "";
  return `<section class="receipt-balance" aria-label="Баланс клиента">
        <div class="receipt-balance-title">Баланс клиента</div>
        ${balanceRows
          .map(
            (row) =>
              `<div class="row${row.tone ? ` ${row.tone}` : ""}"><span class="label">${escapeHtml(row.label)}</span><span class="value">${escapeHtml(row.value)}</span></div>`
          )
          .join("")}
      </section>`;
};

/**
 * HTML чека для термопринтера (ширина и шрифт из настроек).
 */
export const buildThermalReceiptHtml = ({ sale, storeName, organizationId }) => {
  if (!sale) return "";

  const layout = getResolvedReceiptLayout(organizationId);
  const settings = getReceiptPrintSettings(organizationId);
  const receiptLayoutId = settings.receiptLayoutId === "list" ? "list" : "table";

  const ornament = "· ".repeat(Math.max(8, Math.floor(layout.nameMaxLen / 2)));

  const items = Array.isArray(sale.items) ? sale.items : [];
  const itemsSection =
    receiptLayoutId === "table"
      ? buildTableItemsHtml(items, layout, settings.paperSizeId || "50")
      : buildListItemsHtml(items, layout);

  const balanceBlock = buildBalanceBlockHtml(sale);

  const innBlock = settings.shopInn
    ? `<p class="receipt-inn">ИНН ${escapeHtml(settings.shopInn)}</p>`
    : "";

  const footerBlock = settings.receiptFooter
    ? `<footer class="receipt-footer">${escapeHtml(settings.receiptFooter)}</footer>`
    : "";

  const developerBlock = receiptLayoutId === "table" ? buildDeveloperRequisitesHtml() : "";

  return `
    <article class="receipt${receiptLayoutId === "table" ? " receipt-layout-table" : ""}">
      <div class="receipt-ornament" aria-hidden="true">${ornament}</div>
      <header class="receipt-header">
        <h1 class="store">${escapeHtml(storeName || "Магазин")}</h1>
        <p class="receipt-type">Чек продажи</p>
        ${innBlock}
      </header>
      <div class="receipt-meta-block">
        <div class="row">
          <span class="label">Чек №</span>
          <span class="value">${escapeHtml(sale.sale_number)}</span>
        </div>
        <div class="row">
          <span class="label">Дата</span>
          <span class="value">${escapeHtml(formatDate(sale.created_at))}</span>
        </div>
        <div class="row">
          <span class="label">Время</span>
          <span class="value">${escapeHtml(formatReceiptTime(sale.created_at))}</span>
        </div>
      </div>
      <hr class="sep sep-heavy" />
      ${itemsSection}
      <hr class="sep sep-heavy" />
      <section class="receipt-summary" aria-label="Оплата">
        ${buildSummaryRowsHtml(sale, layout)}
      </section>
      <div class="receipt-total" aria-label="Итого">
        <span class="total-label">ИТОГО</span>
        <span class="total-value">${formatMoney(sale.total_amount)} UZS</span>
      </div>
      ${balanceBlock}
      ${footerBlock ? `<hr class="sep sep-light" />${footerBlock}` : ""}
      ${developerBlock}
      <div class="receipt-ornament" aria-hidden="true">${ornament}</div>
    </article>
  `;
};

const buildThermalReceiptDocument = ({ sale, storeName, organizationId }) => {
  const layout = getResolvedReceiptLayout(organizationId);
  const bodyHtml = buildThermalReceiptHtml({ sale, storeName, organizationId });
  const styles = buildThermalPrintStyles(layout);
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Чек ${escapeHtml(sale?.sale_number || "")}</title><style>${styles}</style></head><body>${bodyHtml}</body></html>`;
};

/**
 * Печать чека через скрытый iframe (без новой вкладки).
 */
export const printThermalReceipt = ({ sale, storeName, organizationId }) => {
  if (!sale) return Promise.resolve();

  return new Promise((resolve) => {
    let iframe = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        iframe?.remove();
      } catch {
        // ignore
      }
      resolve();
    };

    try {
      const fullHtml = buildThermalReceiptDocument({ sale, storeName, organizationId });
      iframe = document.createElement("iframe");
      iframe.setAttribute("title", "Печать чека");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText =
        "position:fixed;left:0;top:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none;";
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      const win = iframe.contentWindow;
      if (!doc || !win) {
        finish();
        return;
      }

      doc.open();
      doc.write(fullHtml);
      doc.close();

      const runPrint = () => {
        try {
          win.focus();
          win.onafterprint = finish;
          win.print();
        } catch {
          finish();
          return;
        }
        setTimeout(finish, 3000);
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(runPrint);
      });
    } catch {
      finish();
    }
  });
};

const renderHtmlToCanvas = async (html, layout) => {
  const vars = receiptStyleVars(layout.fontSizePt);
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    "left:-9999px",
    "top:0",
    `width:${layout.previewWidthPx}px`,
    "background:#fff",
    "padding:10px 6px",
    `font-family:${layout.fontFamily}`,
    `font-size:${layout.fontSizePt}pt`,
    "line-height:1.3",
    "color:#000",
    ...Object.entries(vars).map(([key, value]) => `${key}:${value}`),
  ].join(";");
  host.innerHTML = `<style>${THERMAL_RECEIPT_COMPONENT_CSS}</style>${html}`;
  document.body.appendChild(host);

  try {
    return await html2canvas(host, {
      scale: 2,
      backgroundColor: "#ffffff",
      width: layout.previewWidthPx,
      windowWidth: layout.previewWidthPx,
    });
  } finally {
    document.body.removeChild(host);
  }
};

export const downloadThermalReceiptPdf = async (
  sale,
  storeName,
  organizationId,
  filename = "chek.pdf"
) => {
  if (!sale) return;
  const layout = getResolvedReceiptLayout(organizationId);
  const html = buildThermalReceiptHtml({ sale, storeName, organizationId });
  const canvas = await renderHtmlToCanvas(html, layout);
  const imgData = canvas.toDataURL("image/png");
  const pageHeightMm = Math.max(30, (canvas.height * layout.paperWidthMm) / canvas.width + 4);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [layout.paperWidthMm, pageHeightMm],
  });

  doc.addImage(imgData, "PNG", 0, 2, layout.paperWidthMm, pageHeightMm - 4);
  doc.save(filename);
};

export const buildReceiptPdfFilename = (saleNumber) => {
  const safe = String(saleNumber || "chek").replace(/[^\w.-]+/g, "_");
  return `chek-${safe}.pdf`;
};

/**
 * Универсальная печать чека: Bluetooth ESC/POS или системный диалог.
 */
export const printSaleReceipt = async ({ sale, storeName, organizationId }) => {
  const settings = getReceiptPrintSettings(organizationId);

  if (settings.printMode === "bluetooth" && isBluetoothConnected()) {
    return printSaleReceiptBluetooth({
      sale,
      storeName,
      organizationId,
      inn: settings.shopInn,
      footer: settings.receiptFooter,
    });
  }

  return printThermalReceipt({ sale, storeName, organizationId });
};

/** Тестовый чек для настроек принтера */
export const buildSampleSaleForPreview = () => ({
  sale_number: "TEST-001",
  created_at: new Date().toISOString(),
  payment_type: "mixed",
  cash_amount: "50000",
  card_amount: "75000",
  remaining_debt: "0",
  total_amount: "1044000",
  customer_name: "Клиент пример",
  items: [
    {
      id: 1,
      name_snapshot: "Молоко 1л",
      quantity: 2,
      unit_price: "18000",
      subtotal: "36000",
    },
    {
      id: 2,
      name_snapshot: "Хлеб белый",
      quantity: 1,
      unit_price: "8000",
      subtotal: "8000",
    },
    {
      id: 3,
      name_snapshot: "Телевизор 55",
      quantity: 1,
      unit_price: "1000000",
      subtotal: "1000000",
    },
  ],
});
