import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";

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
  const [canUseUpc, setCanUseUpc] = useState(false);

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

  useEffect(() => {
    if (!organizationId) {
      setCanUseUpc(false);
      return;
    }
    const loadFeatureFlags = async () => {
      try {
        const res = await authFetch(`platform/organizations/${organizationId}/`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCanUseUpc(false);
          return;
        }
        setCanUseUpc(json?.subscription?.tariff_can_upc === true);
      } catch {
        setCanUseUpc(false);
      }
    };
    void loadFeatureFlags();
  }, [organizationId]);

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
              {data.contract_number?.trim()
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
            {data.contract_number?.trim() ? (
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
          <div>
            <dt className="text-xs text-muted/65">Договор</dt>
            <dd>
              {data.contract_number || "—"} {data.contract_date ? `от ${formatDate(data.contract_date)}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted/65">Счёт</dt>
            <dd>
              {data.invoice_number || "—"} {data.invoice_date ? `от ${formatDate(data.invoice_date)}` : ""}
            </dd>
          </div>
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
                <th className="py-2 px-3">ИКПУ</th>
                {canUseUpc ? <th className="py-2 px-3">UPC</th> : null}
                <th className="py-2 px-3 text-right">Кол-во</th>
                <th className="py-2 px-3 text-right">Цена</th>
                <th className="py-2 px-3 text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {(data.lines || []).map((line) => (
                <tr key={line.id} className="border-b border-border/60">
                  <td className="py-2 px-3 max-w-[14rem]">
                    <span className="block font-medium">{line.our_name || line.ikpu_name || "—"}</span>
                    {line.ikpu_name && line.our_name ? (
                      <span className="block text-xs text-muted/75 mt-0.5 print-hide-secondary">{line.ikpu_name}</span>
                    ) : null}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs">{line.ikpu_code || "—"}</td>
                  {canUseUpc ? (
                    <td className="py-2 px-3 font-mono text-xs">{line.upc || "—"}</td>
                  ) : null}
                  <td className="py-2 px-3 text-right font-mono tabular-nums">{line.quantity}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">{moneyFmt.format(Number(line.unit_price ?? 0))}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums font-medium">
                    {moneyFmt.format(Number(line.amount_without_vat ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm space-y-1 print-sheet print-keep">
        <div className="flex justify-between gap-4">
          <span className="text-muted/80">Итого кол-во</span>
          <span className="font-mono tabular-nums text-muted">{data.total_quantity}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted/80">Без НДС</span>
          <span className="font-mono tabular-nums font-medium">{moneyFmt.format(Number(data.total_without_vat ?? 0))}</span>
        </div>
        {data.vat_mode === "with" ? (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-muted/80">НДС</span>
              <span className="font-mono tabular-nums">{moneyFmt.format(Number(data.total_vat ?? 0))}</span>
            </div>
            <div className="flex justify-between gap-4 pt-1 border-t border-border/50 font-semibold">
              <span>Всего с НДС</span>
              <span className="font-mono tabular-nums">{moneyFmt.format(Number(data.total_with_vat ?? 0))}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between gap-4 pt-1 border-t border-border/50 font-semibold">
            <span>Итого</span>
            <span className="font-mono tabular-nums">{moneyFmt.format(Number(data.total_without_vat ?? 0))}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyInvoiceDetail;
