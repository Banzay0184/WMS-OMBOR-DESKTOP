import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../../api/client";
import { useModalDismiss } from "../../utils/useModalDismiss";

const moneyFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const formatMoney = (value) => (value == null ? "—" : `${moneyFmt.format(Number(value))} UZS`);
const formatQty = (value, unit) => (value == null ? "—" : `${value} ${unit || ""}`.trim());
const dash = (value) => {
  const v = (value ?? "").toString().trim();
  return v || "—";
};

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-border/60 last:border-b-0">
    <span className="text-muted/70">{label}</span>
    <span className="text-muted font-medium text-right">{value}</span>
  </div>
);

const Section = ({ title, children }) => (
  <div className="mb-4 last:mb-0">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted/60 mb-1.5">{title}</h3>
    <div>{children}</div>
  </div>
);

/**
 * Карточка товара только для просмотра (без редактирования) — открывается по клику на
 * наименование товара в таблице строк документа (счёт-фактура и т.п.), не покидая страницу.
 * Основные данные берутся из уже загруженной строки документа (line) без повторного запроса;
 * складские остатки и цены прихода — отдельным запросом к stock-summary по catalog_product_id.
 */
const ProductDetailModal = ({ line, organizationId, warehouseId, onClose }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId || !line?.catalog_product_id) {
      setLoading(false);
      setError("Товар не привязан к справочнику каталога.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = warehouseId ? `?warehouse_id=${warehouseId}` : "";
      const res = await authFetch(
        `platform/organizations/${organizationId}/products/${line.catalog_product_id}/stock-summary/${params}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? "Не удалось загрузить данные о товаре.");
        return;
      }
      setSummary(data);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [organizationId, line?.catalog_product_id, warehouseId]);

  useEffect(() => {
    load();
  }, [load]);

  const modalA11y = useModalDismiss(onClose, { active: true });

  const markingCodes = Array.isArray(line?.markings) ? line.markings.filter((m) => (m || "").trim()) : [];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-detail-title"
      onMouseDown={modalA11y.onBackdropMouseDown}
    >
      <div
        ref={modalA11y.dialogRef}
        tabIndex={-1}
        className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 sm:p-6 max-h-[85vh] overflow-y-auto focus:outline-none"
      >
        <h2 id="product-detail-title" className="text-lg font-medium text-muted mb-4">
          {line?.our_name || line?.ikpu_name || "Товар"}
        </h2>

        {summary?.image_url ? (
          <img
            src={summary.image_url}
            alt=""
            className="w-full max-h-48 object-contain rounded-lg border border-border mb-4 bg-secondary/30"
          />
        ) : null}

        {error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3" role="alert">
            {error}
          </p>
        ) : null}

        <Section title="Основная информация">
          <InfoRow label="Наименование" value={dash(line?.our_name || line?.ikpu_name)} />
          <InfoRow
            label="Код маркировки"
            value={markingCodes.length > 0 ? markingCodes.join(", ") : "—"}
          />
          <InfoRow label="Артикул" value="—" />
          <InfoRow label="UPC (штрихкод)" value={dash(line?.upc)} />
          <InfoRow label="ИКПУ" value={dash(line?.ikpu_code)} />
          <InfoRow label="Категория" value="—" />
          <InfoRow label="Бренд" value="—" />
          <InfoRow label="Производитель" value="—" />
          <InfoRow label="Страна происхождения" value="—" />
          <InfoRow label="Единица измерения" value={dash(line?.unit)} />
        </Section>

        {loading ? (
          <p className="text-muted text-sm">Загрузка складских данных…</p>
        ) : summary ? (
          <>
            <Section title="Информация по складу">
              <InfoRow label="Остаток по всем складам" value={formatQty(summary.total_stock, summary.unit)} />
              <InfoRow
                label="Остаток по текущему складу"
                value={summary.warehouse_stock == null ? "—" : formatQty(summary.warehouse_stock, summary.unit)}
              />
            </Section>

            <Section title="Информация по ценам">
              <InfoRow label="Последняя цена прихода" value={formatMoney(summary.last_purchase_price)} />
              <InfoRow label="Средняя закупочная цена" value={formatMoney(summary.average_purchase_price)} />
              <InfoRow label="Рекомендуемая цена продажи" value={formatMoney(summary.sale_price)} />
            </Section>

            <Section title="Дополнительная информация">
              <InfoRow label="Описание" value="—" />
              <InfoRow label="Статус" value={summary.is_archived ? "Архивный" : "Активный"} />
            </Section>
          </>
        ) : null}

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;
