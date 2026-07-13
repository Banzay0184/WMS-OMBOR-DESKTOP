import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { useOrganizationTariffFeatures } from "../../utils/useOrganizationTariffFeatures";
import ProductDetailModal from "./ProductDetailModal";

const moneyFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (iso) => {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
};

const formatActor = (name, id) => {
  const normalized = String(name || "").trim();
  if (normalized) return normalized;
  if (id) return `ID ${id}`;
  return "—";
};

const CompanyInvoiceDetail = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { activeContext } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [detailLine, setDetailLine] = useState(null);
  const {
    canUseUpc,
    canUseInvoiceContract,
    canUseInvoiceAccount,
    canUseInvoiceIkpu,
  } = useOrganizationTariffFeatures(organizationId);

  const load = useCallback(async () => {
    if (!organizationId || !invoiceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/invoices/${invoiceId}/`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.detail ?? "Документ не найден.");
        setData(null);
        return;
      }
      setData(json);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId, invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = useCallback(async () => {
    if (!organizationId || !invoiceId) return;
    setApproveError("");
    setApproveLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/invoices/${invoiceId}/approve/`,
        { method: "POST", body: "{}" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApproveError(typeof json.detail === "string" ? json.detail : "Не удалось утвердить документ.");
        return;
      }
      setData(json);
    } catch (err) {
      setApproveError(err.message ?? "Ошибка сети");
    } finally {
      setApproveLoading(false);
    }
  }, [organizationId, invoiceId]);

  const handleDelete = useCallback(async () => {
    if (!organizationId || !invoiceId) return;
    const isDraftInvoice = data?.status === "draft";
    const ok = window.confirm(
      isDraftInvoice
        ? "Удалить этот черновик счёт‑фактуры? Действие нельзя отменить."
        : "Архивировать эту счёт‑фактуру? После этого документ попадёт в архив."
    );
    if (!ok) return;
    setDeleteError("");
    setDeleteLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/invoices/${invoiceId}/`,
        { method: "DELETE" }
      );
      if (res.status === 204 || res.ok) {
        navigate("/app/invoices", { replace: true });
        return;
      }
      if (res.status === 403) {
        setDeleteError("Недостаточно прав: архивировать счёт‑фактуры может администратор компании.");
        return;
      }
      const json = await res.json().catch(() => ({}));
      setDeleteError(
        typeof json.detail === "string"
          ? json.detail
          : (isDraftInvoice ? "Не удалось удалить документ." : "Не удалось архивировать документ.")
      );
    } catch (err) {
      setDeleteError(err.message ?? "Ошибка сети");
    } finally {
      setDeleteLoading(false);
    }
  }, [organizationId, invoiceId, navigate, data?.status]);

  const handlePrint = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      if (typeof window.print === "function") {
        window.focus();
        setTimeout(() => window.print(), 50);
        return;
      }
    } catch {
      // fallback below
    }
    try {
      const printWindow = window.open(window.location.href, "_blank", "noopener,noreferrer");
      if (!printWindow) return;
      printWindow.focus();
      printWindow.onload = () => {
        try {
          printWindow.print();
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }
  }, []);

  if (!organizationId) {
    return (
      <p className="text-sm text-muted">Выберите организацию в контексте.</p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted/75 py-8">Загрузка…</p>;
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-800 bg-red-50/80 border border-red-200/70 rounded-lg px-4 py-2.5" role="alert">
          {error || "Нет данных."}
        </p>
        <Link to="/app/invoices" className="text-primary font-medium hover:underline">
          ← К журналу счёт‑фактур
        </Link>
      </div>
    );
  }

  const vatLabel = data.vat_mode === "with" ? "С НДС" : "Без НДС";
  const isDraft = data.status === "draft";
  const statusLabel = isDraft ? "Черновик" : "Утверждена";
  const createdByLabel = formatActor(data.created_by_name, data.created_by_id);
  const approvedByLabel = formatActor(data.approved_by_name, data.approved_by_id);

  const docCurrencyCode = (data.currency_code || "").trim();
  const hasForeignCurrency =
    !!docCurrencyCode && data.exchange_rate != null && Number(data.exchange_rate) > 0;
  const exchangeRateNum = hasForeignCurrency ? Number(data.exchange_rate) : 1;
  const docSymbol = (data.currency_symbol || docCurrencyCode || "").trim();
  const baseSymbol = "сўм";
  const rateSourceLabel =
    data.exchange_rate_source === "cbu"
      ? "курс ЦБ Узбекистана"
      : data.exchange_rate_source === "manual"
        ? "курс введён вручную"
        : "";

  // В смешанном валютном приходе (есть позиции в базовой валюте) валюту удобнее
  // показывать в каждой ячейке, а не в заголовке колонки.
  const hasMixedLineCurrencies =
    hasForeignCurrency &&
    (data.lines || []).some((l) => {
      const code = (l.unit_price_currency_code || "").trim();
      return code && code !== docCurrencyCode;
    });
  const priceLabel = hasForeignCurrency
    ? hasMixedLineCurrencies
      ? "Цена"
      : `Цена (${docCurrencyCode})`
    : "Цена";
  const amountLabel = hasForeignCurrency
    ? hasMixedLineCurrencies
      ? "Сумма"
      : `Сумма (${docCurrencyCode})`
    : "Сумма";

  const editReceiptHref =
    data.warehouse_id != null
      ? `/app/warehouses/${data.warehouse_id}/receipt?invoice=${invoiceId}`
      : null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto print-doc">
      <div className="flex flex-wrap items-center justify-between gap-3 print-doc-title-row">
        <div>
          <Link to="/app/invoices" className="text-sm font-medium text-primary hover:underline no-print">
            ← Счёт‑фактуры
          </Link>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <h1 className="text-xl font-semibold text-muted tracking-tight">
              Счёт‑фактура
              {canUseInvoiceContract && data.contract_number?.trim()
                ? ` № ${data.contract_number.trim()}`
                : ` (внутр. № ${data.id})`}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isDraft ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200/80" : "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80"
              }`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-sm text-muted/75 mt-1">
            {canUseInvoiceContract && data.contract_number?.trim() ? (
              <span className="text-muted/65">Внутр. № {data.id} · </span>
            ) : null}
            {vatLabel} · создано {formatDate(data.created_at)} (создал: {createdByLabel})
            {!isDraft && data.approved_at ? ` · утверждено ${formatDate(data.approved_at)} (утвердил: ${approvedByLabel})` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          {!isDraft ? (
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg px-4 py-2 text-sm font-medium border border-border bg-white text-muted hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              Печать
            </button>
          ) : null}
          {isDraft ? (
            <>
              {editReceiptHref ? (
                <Link
                  to={editReceiptHref}
                  className="rounded-lg px-4 py-2 text-sm font-medium border border-border bg-white text-muted hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  Редактировать
                </Link>
              ) : (
                <span
                  className="rounded-lg px-4 py-2 text-sm text-muted/60 border border-border/60 bg-secondary/30 cursor-not-allowed"
                  title="В документе не указан склад — редактирование со страницы прихода недоступно"
                >
                  Редактировать
                </span>
              )}
              <button
                type="button"
                onClick={() => void handleApprove()}
                disabled={approveLoading || deleteLoading}
                className="rounded-lg px-4 py-2 text-sm font-semibold bg-primary text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
                aria-busy={approveLoading}
              >
                {approveLoading ? "Утверждение…" : "Утвердить"}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleteLoading || approveLoading}
            className="rounded-lg px-4 py-2 text-sm font-medium border border-red-300 text-red-800 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300/60 disabled:opacity-60"
            aria-busy={deleteLoading}
            aria-label={isDraft ? "Удалить черновик счёт‑фактуры" : "Архивировать счёт‑фактуру"}
          >
            {deleteLoading ? (isDraft ? "Удаление…" : "Архивация…") : (isDraft ? "Удалить" : "Архивировать")}
          </button>
        </div>
      </div>
      {approveError ? (
        <p className="text-sm text-red-800 bg-red-50/80 border border-red-200/70 rounded-lg px-4 py-2.5" role="alert">
          {approveError}
        </p>
      ) : null}
      {deleteError ? (
        <p className="text-sm text-red-800 bg-red-50/80 border border-red-200/70 rounded-lg px-4 py-2.5" role="alert">
          {deleteError}
        </p>
      ) : null}

      {hasForeignCurrency ? (
        <div
          className="rounded-lg border border-sky-200/90 bg-sky-50/95 px-4 py-3 text-sm text-sky-950 shadow-soft print-sheet"
          role="status"
        >
          <p className="m-0 font-semibold">
            Курс пересчёта в {baseSymbol}:{" "}
            <span className="font-mono tabular-nums">
              1 {docCurrencyCode} = {exchangeRateNum.toLocaleString("ru-RU", { maximumFractionDigits: 6 })}{" "}
              {baseSymbol}
            </span>
            {data.exchange_rate_date ? ` · на ${formatDate(data.exchange_rate_date)}` : ""}
            {rateSourceLabel ? ` · ${rateSourceLabel}` : ""}
          </p>
          <p className="m-0 mt-1.5 text-xs text-sky-900/85 leading-relaxed">
            В таблице для позиций в {docCurrencyCode} указаны суммы в {docCurrencyCode} и пересчёт в {baseSymbol} по
            зафиксированному курсу.
            {hasMixedLineCurrencies
              ? ` Позиции, введённые сразу в ${baseSymbol}, пересчёту не подлежат.`
              : ""}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-white p-5 shadow-soft space-y-4 text-sm text-muted print-sheet">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted/80">Реквизиты</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <div>
            <dt className="text-xs text-muted/65">Поставщик</dt>
            <dd>{data.supplier_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted/65">ИНН</dt>
            <dd className="font-mono">{data.supplier_inn || "—"}</dd>
          </div>
          {canUseInvoiceContract ? (
            <div>
              <dt className="text-xs text-muted/65">Договор</dt>
              <dd>
                {data.contract_number || "—"} {data.contract_date ? `от ${formatDate(data.contract_date)}` : ""}
              </dd>
            </div>
          ) : null}
          {canUseInvoiceAccount ? (
            <div>
              <dt className="text-xs text-muted/65">Счёт</dt>
              <dd>
                {data.invoice_number || "—"} {data.invoice_date ? `от ${formatDate(data.invoice_date)}` : ""}
              </dd>
            </div>
          ) : null}
          {hasForeignCurrency ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted/65">Валюта документа</dt>
              <dd>
                {docCurrencyCode}
                {docSymbol && docSymbol !== docCurrencyCode ? ` (${docSymbol})` : ""}
                {" · "}
                1 {docCurrencyCode} = {exchangeRateNum.toLocaleString("ru-RU", { maximumFractionDigits: 6 })} {baseSymbol}
                {data.exchange_rate_date ? ` (на ${formatDate(data.exchange_rate_date)})` : ""}
                {rateSourceLabel ? ` · ${rateSourceLabel}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden shadow-soft print-sheet">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted/80 px-4 py-3 bg-neutral-50/90 border-b border-border">
          Строки
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold text-muted/70">
                <th className="py-2 px-3">Наименование</th>
                {canUseInvoiceIkpu ? <th className="py-2 px-3">ИКПУ</th> : null}
                {canUseUpc ? <th className="py-2 px-3">UPC</th> : null}
                <th className="py-2 px-3 text-right">Кол-во</th>
                <th className="py-2 px-3 text-right">{priceLabel}</th>
                {hasForeignCurrency ? (
                  <th className="py-2 px-3 text-right">Цена ({baseSymbol})</th>
                ) : null}
                <th className="py-2 px-3 text-right">{amountLabel}</th>
                {hasForeignCurrency ? (
                  <th className="py-2 px-3 text-right">Сумма ({baseSymbol})</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {(data.lines || []).map((line) => {
                // Эффективная валюта именно этой строки. Если у строки нет своей
                // валюты — наследуем валюту документа.
                const rowCurrencyCode = (
                  line.unit_price_currency_code || docCurrencyCode || "UZS"
                ).trim();
                const isRowInDocCurrency =
                  hasForeignCurrency && rowCurrencyCode === docCurrencyCode;
                const priceForView = isRowInDocCurrency
                  ? Number(line.unit_price_doc ?? 0)
                  : Number(line.unit_price ?? 0);
                const priceInBase = Number(line.unit_price ?? 0);
                const amountForView = isRowInDocCurrency
                  ? Number(line.amount_without_vat_doc ?? 0)
                  : Number(line.amount_without_vat ?? 0);
                const amountInBase = Number(line.amount_without_vat ?? 0);
                const rowCurrencySuffix = isRowInDocCurrency
                  ? ` ${docCurrencyCode}`
                  : ` ${baseSymbol}`;
                return (
                  <tr key={line.id} className="border-b border-border/60">
                    <td className="py-2 px-3 max-w-[14rem]">
                      {line.catalog_product_id ? (
                        <button
                          type="button"
                          onClick={() => setDetailLine(line)}
                          className="block font-medium text-primary hover:underline cursor-pointer text-left"
                          aria-label={`Подробнее о товаре ${line.our_name || line.ikpu_name || ""}`}
                        >
                          {line.our_name || line.ikpu_name || "—"}
                        </button>
                      ) : (
                        <span className="block font-medium">{line.our_name || line.ikpu_name || "—"}</span>
                      )}
                      {line.ikpu_name && line.our_name ? (
                        <span className="block text-xs text-muted/75 mt-0.5 print-hide-secondary">{line.ikpu_name}</span>
                      ) : null}
                    </td>
                    {canUseInvoiceIkpu ? (
                      <td className="py-2 px-3 font-mono text-xs">{line.ikpu_code || "—"}</td>
                    ) : null}
                    {canUseUpc ? (
                      <td className="py-2 px-3 font-mono text-xs">{line.upc || "—"}</td>
                    ) : null}
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{line.quantity}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {moneyFmt.format(priceForView)}
                      {hasForeignCurrency && !isRowInDocCurrency ? (
                        <span className="ml-1 text-xs text-muted/65">{rowCurrencySuffix.trim()}</span>
                      ) : hasForeignCurrency && isRowInDocCurrency ? (
                        <span className="ml-1 text-xs text-muted/65">{docCurrencyCode}</span>
                      ) : null}
                    </td>
                    {hasForeignCurrency ? (
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-sky-900/90">
                        {isRowInDocCurrency ? (
                          <>
                            {moneyFmt.format(priceInBase)}
                            <span className="ml-1 text-xs text-muted/65">{baseSymbol}</span>
                          </>
                        ) : (
                          <span className="text-muted/40">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-medium">
                      {moneyFmt.format(amountForView)}
                      {hasForeignCurrency && !isRowInDocCurrency ? (
                        <span className="ml-1 text-xs text-muted/65">{rowCurrencySuffix.trim()}</span>
                      ) : hasForeignCurrency && isRowInDocCurrency ? (
                        <span className="ml-1 text-xs text-muted/65">{docCurrencyCode}</span>
                      ) : null}
                    </td>
                    {hasForeignCurrency ? (
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-sky-900/90">
                        {isRowInDocCurrency ? (
                          <>
                            {moneyFmt.format(amountInBase)}
                            <span className="ml-1 text-xs text-muted/65">{baseSymbol}</span>
                          </>
                        ) : (
                          <span className="text-muted/40 font-normal">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm space-y-1 print-sheet print-keep">
        <div className="flex justify-between gap-4">
          <span className="text-muted/80">Итого кол-во</span>
          <span className="font-mono tabular-nums text-muted">{data.total_quantity}</span>
        </div>
        {(() => {
          const totalWithoutVat = hasForeignCurrency
            ? Number(data.total_without_vat_doc ?? 0)
            : Number(data.total_without_vat ?? 0);
          const totalVat = hasForeignCurrency
            ? Number(data.total_vat_doc ?? 0)
            : Number(data.total_vat ?? 0);
          const totalWithVat = hasForeignCurrency
            ? Number(data.total_with_vat_doc ?? 0)
            : Number(data.total_with_vat ?? 0);
          const codeSuffix = hasForeignCurrency ? ` ${docCurrencyCode}` : "";
          return (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-muted/80">Без НДС</span>
                <span className="font-mono tabular-nums font-medium">
                  {moneyFmt.format(totalWithoutVat)}
                  {codeSuffix}
                </span>
              </div>
              {data.vat_mode === "with" ? (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted/80">НДС</span>
                    <span className="font-mono tabular-nums">
                      {moneyFmt.format(totalVat)}
                      {codeSuffix}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 pt-1 border-t border-border/50 font-semibold">
                    <span>Всего с НДС</span>
                    <span className="font-mono tabular-nums">
                      {moneyFmt.format(totalWithVat)}
                      {codeSuffix}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between gap-4 pt-1 border-t border-border/50 font-semibold">
                  <span>Итого</span>
                  <span className="font-mono tabular-nums">
                    {moneyFmt.format(totalWithoutVat)}
                    {codeSuffix}
                  </span>
                </div>
              )}
            </>
          );
        })()}
        {hasForeignCurrency ? (
          <div className="mt-2 pt-2 border-t border-border/60 text-sm text-muted/90 space-y-1.5">
            <p className="m-0 font-semibold text-muted">
              Итого в {baseSymbol} (1 {docCurrencyCode} ={" "}
              {exchangeRateNum.toLocaleString("ru-RU", { maximumFractionDigits: 6 })} {baseSymbol})
              {hasMixedLineCurrencies ? (
                <span className="block text-[11px] font-normal text-muted/65 mt-0.5">
                  Включая позиции в {baseSymbol} (без пересчёта).
                </span>
              ) : null}
            </p>
            <div className="flex justify-between gap-4">
              <span>Без НДС, {baseSymbol}</span>
              <span className="font-mono tabular-nums">{moneyFmt.format(Number(data.total_without_vat ?? 0))}</span>
            </div>
            {data.vat_mode === "with" ? (
              <div className="flex justify-between gap-4">
                <span>НДС, {baseSymbol}</span>
                <span className="font-mono tabular-nums">{moneyFmt.format(Number(data.total_vat ?? 0))}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 font-semibold text-muted">
              <span>{data.vat_mode === "with" ? "Всего с НДС" : "Итого"}, {baseSymbol}</span>
              <span className="font-mono tabular-nums">
                {moneyFmt.format(Number(data.vat_mode === "with" ? data.total_with_vat : data.total_without_vat) || 0)}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {detailLine ? (
        <ProductDetailModal
          line={detailLine}
          organizationId={organizationId}
          warehouseId={data.warehouse_id}
          onClose={() => setDetailLine(null)}
        />
      ) : null}
    </div>
  );
};

export default CompanyInvoiceDetail;
