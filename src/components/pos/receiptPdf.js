import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { PAYMENT_LABEL, formatDate, formatMoney, formatSalePaymentLabel } from "./posApi";
import {
  isBluetoothConnected,
  printSaleReceiptBluetooth,
} from "./bluetoothPrinter";
import { getReceiptPrintSettings, getResolvedReceiptLayout } from "./receiptPrintSettings";
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
`;

export const buildThermalPrintStyles = (layout) => {
  const paperMm = layout.paperWidthMm;
  const bodyPt = layout.fontSizePt;
  const metaPt = Math.max(8, bodyPt - 1);
  const titlePt = Math.min(13, bodyPt + 2);

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
    padding: 2.5mm 1.5mm 4mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    --receipt-body-pt: ${bodyPt}pt;
    --receipt-meta-pt: ${metaPt}pt;
    --receipt-title-pt: ${titlePt}pt;
  }
  ${THERMAL_RECEIPT_COMPONENT_CSS}
`;
};

export const getThermalReceiptPreviewStyle = (layout) => ({
  width: layout.previewWidthPx,
  maxWidth: "100%",
  fontFamily: layout.fontFamily,
  fontSize: `${layout.fontSizePt}pt`,
  ["--receipt-body-pt"]: `${layout.fontSizePt}pt`,
  ["--receipt-meta-pt"]: `${Math.max(8, layout.fontSizePt - 1)}pt`,
  ["--receipt-title-pt"]: `${Math.min(13, layout.fontSizePt + 2)}pt`,
});

/**
 * HTML чека для термопринтера (ширина и шрифт из настроек).
 */
export const buildThermalReceiptHtml = ({ sale, storeName, organizationId }) => {
  if (!sale) return "";

  const layout = getResolvedReceiptLayout(organizationId);
  const settings = getReceiptPrintSettings(organizationId);
  const paymentLabel = formatSalePaymentLabel(sale);

  const ornament = "· ".repeat(Math.max(8, Math.floor(layout.nameMaxLen / 2)));

  const items = Array.isArray(sale.items) ? sale.items : [];
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

  const balanceRows = buildCustomerBalanceRows(sale);
  const balanceBlock = balanceRows.length
    ? `<section class="receipt-balance" aria-label="Баланс клиента">
        <div class="receipt-balance-title">Баланс клиента</div>
        ${balanceRows
          .map(
            (row) =>
              `<div class="row${row.tone ? ` ${row.tone}` : ""}"><span class="label">${escapeHtml(row.label)}</span><span class="value">${escapeHtml(row.value)}</span></div>`
          )
          .join("")}
      </section>`
    : "";

  const innBlock = settings.shopInn
    ? `<p class="receipt-inn">ИНН ${escapeHtml(settings.shopInn)}</p>`
    : "";

  const footerBlock = settings.receiptFooter
    ? `<footer class="receipt-footer">${escapeHtml(settings.receiptFooter)}</footer>`
    : "";

  return `
    <article class="receipt">
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
      <section class="items-section" aria-label="Товары">
        <div class="items-head">
          <span>Товар</span>
          <span>Сумма</span>
        </div>
        ${itemsHtml}
      </section>
      <hr class="sep sep-heavy" />
      <section class="receipt-summary" aria-label="Оплата">
        ${summaryRows.join("")}
      </section>
      <div class="receipt-total" aria-label="Итого">
        <span class="total-label">ИТОГО</span>
        <span class="total-value">${formatMoney(sale.total_amount)} UZS</span>
      </div>
      ${balanceBlock}
      ${footerBlock ? `<hr class="sep sep-light" />${footerBlock}` : ""}
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
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    "left:-9999px",
    "top:0",
    `width:${layout.previewWidthPx}px`,
    "background:#fff",
    "padding:10px 8px",
    `font-family:${layout.fontFamily}`,
    `font-size:${layout.fontSizePt}pt`,
    "line-height:1.3",
    "color:#000",
    `--receipt-body-pt:${layout.fontSizePt}pt`,
    `--receipt-meta-pt:${Math.max(8, layout.fontSizePt - 1)}pt`,
    `--receipt-title-pt:${Math.min(13, layout.fontSizePt + 2)}pt`,
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
  total_amount: "125000",
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
      name_snapshot: "Сок апельсин 1л",
      quantity: 3,
      unit_price: "27000",
      subtotal: "81000",
    },
  ],
});
