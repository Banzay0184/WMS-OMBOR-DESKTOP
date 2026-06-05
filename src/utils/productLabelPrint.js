import { getResolvedProductLabelLayout } from "./productLabelPrintSettings";

const moneyFmt = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const normalizeUpcDigits = (upc) => String(upc ?? "").replace(/\D/g, "");

export const getBarcodeSpec = (upc) => {
  const digits = normalizeUpcDigits(upc);
  if (!digits) return null;
  if (digits.length === 13) return { bcid: "ean13", text: digits };
  if (digits.length === 12) return { bcid: "upca", text: digits };
  if (digits.length === 8) return { bcid: "ean8", text: digits };
  return { bcid: "code128", text: digits };
};

const truncateName = (name, maxLen) => {
  const text = String(name ?? "").trim();
  if (!text) return "—";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
};

const estimateNameMaxLen = (widthMm) => {
  if (widthMm <= 30) return 14;
  if (widthMm <= 40) return 18;
  if (widthMm <= 58) return 28;
  if (widthMm <= 75) return 36;
  return 48;
};

export const renderBarcodeDataUrl = async (upc, scale = 1.6) => {
  const spec = getBarcodeSpec(upc);
  if (!spec) return null;

  const mod = await import("bwip-js/browser");
  const bwipjs = mod.default ?? mod;
  const canvas = document.createElement("canvas");

  bwipjs.toCanvas(canvas, {
    bcid: spec.bcid,
    text: spec.text,
    scale,
    height: spec.bcid === "code128" ? 8 : 10,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });

  return {
    dataUrl: canvas.toDataURL("image/png"),
    digits: spec.text,
    bcid: spec.bcid,
  };
};

const buildSingleLabelHtml = ({ product, layout, barcodeDataUrl, barcodeDigits }) => {
  const settings = layout.settings;
  const name = truncateName(product?.name, estimateNameMaxLen(layout.widthMm));
  const salePrice =
    product?.sale_price != null && Number.isFinite(Number(product.sale_price)) && Number(product.sale_price) > 0
      ? Number(product.sale_price)
      : null;
  const priceHtml =
    settings.showSalePrice && salePrice != null
      ? `<div class="price">${escapeHtml(`${moneyFmt.format(salePrice)} UZS`)}</div>`
      : "";
  const codeHtml =
    settings.showUpcText && barcodeDigits
      ? `<div class="code">${escapeHtml(barcodeDigits)}</div>`
      : "";

  return `
    <section class="label" aria-label="Этикетка товара">
      <div class="name">${escapeHtml(name)}</div>
      ${
        barcodeDataUrl
          ? `<img src="${barcodeDataUrl}" alt="Штрих-код ${escapeHtml(barcodeDigits)}" class="barcode" />`
          : `<div class="no-barcode">Нет штрих-кода</div>`
      }
      ${codeHtml}
      ${priceHtml}
    </section>
  `;
};

const buildLabelPrintStyles = (layout) => {
  const { widthMm, heightMm, nameFontPt, priceFontPt, codeFontPt } = layout;
  return `
    @page {
      size: ${widthMm}mm ${heightMm}mm;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
    }
    .label {
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      padding: 1.2mm 1.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      text-align: center;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }
    .label:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .name {
      width: 100%;
      font-size: ${nameFontPt}pt;
      font-weight: 600;
      line-height: 1.15;
      max-height: ${nameFontPt * 2.4}pt;
      overflow: hidden;
      word-break: break-word;
    }
    .barcode {
      max-width: 100%;
      height: auto;
      max-height: ${Math.max(8, heightMm * 0.42)}mm;
      object-fit: contain;
      image-rendering: pixelated;
    }
    .code {
      font-size: ${codeFontPt}pt;
      font-family: "Courier New", Courier, monospace;
      letter-spacing: 0.04em;
      line-height: 1.1;
    }
    .price {
      font-size: ${priceFontPt}pt;
      font-weight: 700;
      line-height: 1.1;
      white-space: nowrap;
    }
    .no-barcode {
      font-size: ${codeFontPt}pt;
      color: #666;
    }
  `;
};

export const buildProductLabelDocument = async ({ product, organizationId, copies = 1 }) => {
  const layout = getResolvedProductLabelLayout(organizationId);
  const barcode = await renderBarcodeDataUrl(product?.upc, layout.barcodeScale);
  const count = Math.min(99, Math.max(1, Number(copies) || 1));
  const labelHtml = buildSingleLabelHtml({
    product,
    layout,
    barcodeDataUrl: barcode?.dataUrl ?? null,
    barcodeDigits: barcode?.digits ?? normalizeUpcDigits(product?.upc),
  });
  const labels = Array.from({ length: count }, () => labelHtml).join("");
  const styles = buildLabelPrintStyles(layout);
  const title = escapeHtml(product?.name || "Этикетка");

  return {
    html: `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>${styles}</style></head><body>${labels}</body></html>`,
    layout,
    barcode,
  };
};

export const printProductLabel = async ({ product, organizationId, copies = 1 }) => {
  const upc = normalizeUpcDigits(product?.upc);
  if (!upc) {
    throw new Error("У товара не указан UPC — этикетку напечатать нельзя.");
  }

  const { html } = await buildProductLabelDocument({ product, organizationId, copies });

  return new Promise((resolve, reject) => {
    let iframe = null;
    let finished = false;

    const finish = (err) => {
      if (finished) return;
      finished = true;
      try {
        iframe?.remove();
      } catch {
        // ignore
      }
      if (err) reject(err);
      else resolve();
    };

    try {
      iframe = document.createElement("iframe");
      iframe.setAttribute("title", "Печать этикетки");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText =
        "position:fixed;left:0;top:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none;";
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      const win = iframe.contentWindow;
      if (!doc || !win) {
        finish(new Error("Не удалось открыть окно печати."));
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      const runPrint = () => {
        try {
          win.focus();
          win.onafterprint = () => finish();
          win.print();
        } catch (err) {
          finish(err instanceof Error ? err : new Error("Ошибка печати"));
          return;
        }
        setTimeout(() => finish(), 4000);
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(runPrint);
      });
    } catch (err) {
      finish(err instanceof Error ? err : new Error("Ошибка печати"));
    }
  });
};

export const getProductLabelPreviewBoxStyle = (layout) => ({
  width: `${layout.widthMm * layout.previewScale}px`,
  height: `${layout.heightMm * layout.previewScale}px`,
});
