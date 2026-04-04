import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../../utils/phone";

const INPUT_CLASS =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-secondary/40";
const DOC_INPUT =
  "w-full min-w-0 border-0 bg-transparent py-2 text-[15px] leading-6 text-muted focus:outline-none focus:ring-2 focus:ring-primary/25 focus:ring-offset-0 rounded-md placeholder:text-neutral-500/85 disabled:cursor-not-allowed disabled:bg-stone-50/60 disabled:text-muted";
const DOC_ROW_GRID =
  "grid grid-cols-1 min-w-0 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] border-b border-neutral-200/90";
const DOC_LABEL_CELL =
  "px-3 py-2 text-[11px] font-medium text-muted/80 bg-neutral-50/60 border-b border-neutral-200/90 sm:border-b-0 sm:border-r sm:border-neutral-200/90";
const DOC_INPUT_CELL = "px-3 py-2 min-w-0";
const DOC_ROW_GRID_COMPACT =
  "grid grid-cols-1 min-w-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]";
const SECTION_HEADING = "text-sm font-semibold uppercase tracking-wide text-muted";
const ITEM_FIELD_LABEL = "block text-xs font-medium text-muted mb-1";
const ITEM_FIELD_INPUT =
  "w-full min-w-0 min-h-10 px-3 py-2 text-[15px] leading-6 text-muted rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-neutral-500/80 disabled:cursor-not-allowed disabled:bg-secondary/50";
const ITEM_SUM_BOX =
  "flex min-h-10 items-center justify-end px-3 py-2 rounded-lg border border-border bg-secondary/50 text-[15px] font-mono tabular-nums font-semibold text-muted";
const ITEM_SUM_BOX_ACCENT =
  "flex min-h-10 items-center justify-end px-3 py-2 rounded-lg border border-primary/25 bg-primary/8 text-[15px] font-mono tabular-nums font-bold text-muted";
const DEFAULT_VAT_RATE_PERCENT = 12;
const MAX_MARKING_SLOTS = 500;

const normalizeInn = (value) => (value || "").replace(/\D/g, "");
const roundMoney = (value) => Math.round(Number(value) * 100) / 100;
const parseMoneyInput = (value) => {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = parseFloat(raw);
  return Number.isFinite(n) ? roundMoney(n) : null;
};

const createEmptyItem = (id) => ({
  id,
  our_name: "",
  ikpu_name: "",
  ikpu_code: "",
  upc: "",
  unit: "шт",
  quantity: 1,
  unit_price: 0,
  markings: [""],
  is_fixed: false,
});

const resizeMarkingsArray = (markings, targetLength) => {
  const prev = Array.isArray(markings) ? markings : [];
  const len = Math.max(0, Math.min(MAX_MARKING_SLOTS, Math.floor(Number(targetLength)) || 0));
  const out = [];
  for (let i = 0; i < len; i += 1) {
    out.push(typeof prev[i] === "string" ? prev[i] : "");
  }
  return out;
};

const normalizePrefillRowsToItems = (rows) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const markingCode = String(row?.marking_code || "").trim();
    if (!markingCode) return;
    const ourName = String(row?.our_name || "").trim();
    const ikpuName = String(row?.ikpu_name || "").trim();
    const ikpuCode = String(row?.ikpu_code || "").trim();
    const upc = String(row?.upc || "").trim();
    const unit = String(row?.unit || "шт").trim() || "шт";
    const invoiceId = Number(row?.invoice_id);
    const lineId = Number(row?.line_id);
    const hasSourceLine = Number.isFinite(invoiceId) && Number.isFinite(lineId);
    const key = hasSourceLine
      ? `source:${invoiceId}|${lineId}`
      : `fallback:${[ourName, ikpuName, ikpuCode, upc, unit].join("|")}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.markings.push(markingCode);
      return;
    }
    grouped.set(key, {
      our_name: ourName,
      ikpu_name: ikpuName,
      ikpu_code: ikpuCode,
      upc,
      unit,
      unit_price: Number.isFinite(Number(row?.unit_price))
        ? Math.max(0, Number(row.unit_price))
        : 0,
      markings: [markingCode],
    });
  });

  const items = [...grouped.values()].map((group, index) => ({
    id: `prefill-${index + 1}`,
    our_name: group.our_name,
    ikpu_name: group.ikpu_name,
    ikpu_code: group.ikpu_code,
    upc: group.upc,
    unit: group.unit,
    quantity: group.markings.length,
    unit_price: group.unit_price,
    markings: resizeMarkingsArray(group.markings, group.markings.length),
    is_fixed: true,
  }));

  if (items.length > 0) return items;
  return [createEmptyItem("row-1")];
};

const WarehouseOutgoing = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { warehouseId } = useParams();
  const [searchParams] = useSearchParams();
  const outgoingInvoiceId = searchParams.get("outgoing_invoice");
  const { activeContext } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [warehouseName, setWarehouseName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerInn, setCustomerInn] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [partnerMode, setPartnerMode] = useState("manual");
  const [partners, setPartners] = useState([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [partnerSearchTerm, setPartnerSearchTerm] = useState("");
  const [partnerListOpen, setPartnerListOpen] = useState(false);
  const partnerPickerRef = useRef(null);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [savePartnerLoading, setSavePartnerLoading] = useState(false);
  const [savePartnerMessage, setSavePartnerMessage] = useState("");
  const [savePartnerError, setSavePartnerError] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [vatMode, setVatMode] = useState("without");
  const [items, setItems] = useState([createEmptyItem("row-1")]);
  const [canUseUpc, setCanUseUpc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualTotalEnabled, setManualTotalEnabled] = useState(false);
  const [manualTotalValue, setManualTotalValue] = useState("");
  const prefillRows = Array.isArray(location.state?.prefillRows) ? location.state.prefillRows : [];

  const loadBase = useCallback(async () => {
    if (!organizationId || !warehouseId) return;
    setLoading(true);
    setError("");
    try {
      const [warehouseRes, orgRes] = await Promise.all([
        authFetch(`platform/organizations/${organizationId}/warehouses/${warehouseId}/`),
        authFetch(`platform/organizations/${organizationId}/`),
      ]);
      const warehouseData = await warehouseRes.json().catch(() => ({}));
      const orgData = await orgRes.json().catch(() => ({}));
      if (warehouseRes.ok) {
        setWarehouseName((warehouseData.name || "").trim() || `Склад #${warehouseId}`);
      }
      if (orgRes.ok) {
        setCanUseUpc(orgData?.subscription?.tariff_can_upc === true);
      } else {
        setCanUseUpc(false);
      }
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [organizationId, warehouseId]);

  const loadOutgoingInvoice = useCallback(async () => {
    if (!organizationId || !outgoingInvoiceId) return;
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/outgoing-invoices/${outgoingInvoiceId}/`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? "Не удалось загрузить документ");
        return;
      }
      setCustomerName(data.customer_name || "");
      setCustomerInn(data.customer_inn || "");
      setCustomerPhone(data.customer_phone || "");
      setCustomerAddress(data.customer_address || "");
      if (data.customer_id != null) {
        setPartnerMode("list");
        setSelectedPartnerId(String(data.customer_id));
      } else {
        setPartnerMode("manual");
        setSelectedPartnerId("");
      }
      setContractNumber(data.contract_number || "");
      setContractDate(data.contract_date || "");
      setInvoiceNumber(data.invoice_number || "");
      setInvoiceDate(data.invoice_date || "");
      setVatMode(data.vat_mode === "with" ? "with" : "without");
      setManualTotalEnabled(data.manual_total_enabled === true);
      setManualTotalValue(
        data.manual_total_value != null && data.manual_total_value !== ""
          ? String(data.manual_total_value)
          : ""
      );
      const lines = Array.isArray(data.lines) ? data.lines : [];
      if (lines.length > 0) {
        setItems(
          lines.map((line, index) => ({
            id: `row-${line.id ?? index + 1}`,
            our_name: line.our_name || "",
            ikpu_name: line.ikpu_name || "",
            ikpu_code: line.ikpu_code || "",
            upc: line.upc || "",
            unit: line.unit || "шт",
            quantity: Number(line.quantity ?? 0),
            unit_price: Number(line.unit_price ?? 0),
            markings: resizeMarkingsArray(Array.isArray(line.markings) ? line.markings : [], Number(line.quantity ?? 0)),
            is_fixed: Array.isArray(line.markings) && line.markings.length > 0,
          }))
        );
      }
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    }
  }, [organizationId, outgoingInvoiceId]);

  const loadPartners = useCallback(async () => {
    if (!organizationId) return;
    setPartnersLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/suppliers/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPartners([]);
        return;
      }
      setPartners(Array.isArray(data) ? data : []);
    } catch {
      setPartners([]);
    } finally {
      setPartnersLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    void loadOutgoingInvoice();
  }, [loadOutgoingInvoice]);

  useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  useEffect(() => {
    if (outgoingInvoiceId || prefillRows.length === 0 || !organizationId) return;
    let cancelled = false;
    const loadPrefilledItems = async () => {
      const uniqueInvoiceIds = [...new Set(prefillRows.map((row) => Number(row?.invoice_id)).filter((id) => Number.isFinite(id)))];
      if (uniqueInvoiceIds.length === 0) {
        if (!cancelled) setItems(normalizePrefillRowsToItems(prefillRows));
        return;
      }
      try {
        const responses = await Promise.all(
          uniqueInvoiceIds.map(async (invoiceId) => {
            const res = await authFetch(`platform/organizations/${organizationId}/invoices/${invoiceId}/`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !Array.isArray(data?.lines)) return null;
            return { invoiceId, lines: data.lines };
          })
        );
        const linePriceByInvoiceAndLine = new Map();
        responses.forEach((invoiceData) => {
          if (!invoiceData) return;
          invoiceData.lines.forEach((line) => {
            const lineId = Number(line?.id);
            if (!Number.isFinite(lineId)) return;
            const unitPrice = Number(line?.unit_price);
            if (!Number.isFinite(unitPrice)) return;
            linePriceByInvoiceAndLine.set(`${invoiceData.invoiceId}|${lineId}`, unitPrice);
          });
        });
        const enrichedRows = prefillRows.map((row) => {
          const invoiceId = Number(row?.invoice_id);
          const lineId = Number(row?.line_id);
          if (!Number.isFinite(invoiceId) || !Number.isFinite(lineId)) return row;
          const key = `${invoiceId}|${lineId}`;
          const matchedPrice = linePriceByInvoiceAndLine.get(key);
          if (!Number.isFinite(matchedPrice)) return row;
          return { ...row, unit_price: matchedPrice };
        });
        if (!cancelled) setItems(normalizePrefillRowsToItems(enrichedRows));
      } catch {
        if (!cancelled) setItems(normalizePrefillRowsToItems(prefillRows));
      }
    };
    void loadPrefilledItems();
    return () => {
      cancelled = true;
    };
  }, [outgoingInvoiceId, prefillRows, organizationId]);

  useEffect(() => {
    if (canUseUpc) return;
    setItems((prev) => prev.map((it) => ({ ...it, upc: "" })));
  }, [canUseUpc]);

  useEffect(() => {
    if (partnerMode !== "list" || !selectedPartnerId) return;
    const partner = partners.find((item) => String(item.id) === String(selectedPartnerId));
    if (!partner) return;
    setCustomerName(partner.name || "");
    setCustomerInn(partner.inn || "");
    setCustomerPhone(partner.phone || "");
    setCustomerAddress(partner.address || "");
  }, [partnerMode, selectedPartnerId, partners]);

  useEffect(() => {
    const handlePointerDown = (e) => {
      if (!partnerPickerRef.current?.contains(e.target)) {
        setPartnerListOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0),
    [items]
  );

  const totals = useMemo(() => {
    const totalQuantity = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
    const totalWithoutVat = items.reduce(
      (sum, item) => sum + (Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unit_price) || 0)),
      0
    );
    const totalVat = vatMode === "with" ? totalWithoutVat * 0.12 : 0;
    return {
      totalQuantity,
      totalWithoutVat: Number(totalWithoutVat.toFixed(2)),
      totalVat: Number(totalVat.toFixed(2)),
      totalWithVat: Number((totalWithoutVat + totalVat).toFixed(2)),
    };
  }, [items, vatMode]);
  const manualTotalParsed = useMemo(() => parseMoneyInput(manualTotalValue), [manualTotalValue]);
  const footerTotals = useMemo(() => {
    if (!manualTotalEnabled || manualTotalParsed === null) {
      return { display: totals, calculatedLabel: null };
    }
    if (vatMode === "without") {
      return {
        display: {
          totalQuantity: totals.totalQuantity,
          totalWithoutVat: manualTotalParsed,
          totalVat: 0,
          totalWithVat: manualTotalParsed,
        },
        calculatedLabel: `Сумма по позициям (расчёт): ${totals.totalWithoutVat.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      };
    }
    return {
      display: {
        totalQuantity: totals.totalQuantity,
        totalWithoutVat: totals.totalWithoutVat,
        totalVat: totals.totalVat,
        totalWithVat: manualTotalParsed,
      },
      calculatedLabel: `По позициям с НДС (расчёт): ${totals.totalWithVat.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    };
  }, [manualTotalEnabled, manualTotalParsed, totals, vatMode]);

  const handleChangeItem = (id, patch) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, "quantity")) {
          next.quantity = Math.min(MAX_MARKING_SLOTS, Math.max(0, Number(next.quantity) || 0));
          next.markings = resizeMarkingsArray(next.markings, next.quantity);
        }
        if (Object.prototype.hasOwnProperty.call(patch, "unit_price")) {
          next.unit_price = Math.max(0, Number(next.unit_price) || 0);
        }
        return next;
      })
    );
  };

  const handleMarkingChange = (rowId, index, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== rowId) return item;
        const qtyInt = Math.min(MAX_MARKING_SLOTS, Math.max(0, Math.floor(Number(item.quantity)) || 0));
        const nextMarkings = resizeMarkingsArray(item.markings, qtyInt);
        nextMarkings[index] = value;
        return { ...item, markings: nextMarkings };
      })
    );
  };

  const clearPartnerSelectionFields = useCallback(() => {
    setSelectedPartnerId("");
    setPartnerSearchTerm("");
    setCustomerName("");
    setCustomerInn("");
    setCustomerPhone("");
    setCustomerAddress("");
  }, []);

  const filteredPartners = useMemo(() => {
    const raw = partnerSearchTerm.trim();
    const qLower = raw.toLowerCase();
    const qDigits = raw.replace(/\D/g, "");
    let list = partners;
    if (raw) {
      list = partners.filter((s) => {
        const name = (s.name || "").toLowerCase();
        const inn = String(s.inn || "");
        const addr = (s.address || "").toLowerCase();
        const phoneDigits = getPhoneDigits(s.phone || "");
        if (name.includes(qLower)) return true;
        if (inn.includes(raw.replace(/\s/g, "")) || inn.toLowerCase().includes(qLower)) return true;
        if (addr.includes(qLower)) return true;
        if (qDigits.length >= 2 && phoneDigits.includes(qDigits)) return true;
        return false;
      });
    }
    return list.slice(0, 80);
  }, [partners, partnerSearchTerm]);

  const handlePartnerSourceChange = (next) => {
    setPartnerListOpen(false);
    if (next === "list") {
      setPartnerMode("list");
      clearPartnerSelectionFields();
      return;
    }
    setPartnerMode("manual");
    setSelectedPartnerId("");
    setPartnerSearchTerm("");
  };

  const handlePartnerSearchChange = (e) => {
    const value = e.target.value;
    setPartnerSearchTerm(value);
    setPartnerListOpen(true);
    if (selectedPartnerId) {
      setSelectedPartnerId("");
      setCustomerName("");
      setCustomerInn("");
      setCustomerPhone("");
      setCustomerAddress("");
    }
  };

  const handlePartnerSearchKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setPartnerListOpen(false);
    }
  };

  const handlePickPartnerFromSearch = (partner) => {
    setSelectedPartnerId(String(partner.id));
    setCustomerName(partner.name ?? "");
    setCustomerInn(partner.inn ?? "");
    setCustomerPhone(formatPhoneDisplay(partner.phone ?? ""));
    setCustomerAddress(partner.address ?? "");
    setPartnerSearchTerm(
      `${(partner.name || "").trim() || `Партнер #${partner.id}`}${partner.inn ? ` · ИНН ${partner.inn}` : ""}`
    );
    setPartnerListOpen(false);
  };

  const handleClearPartnerSelection = () => {
    clearPartnerSelectionFields();
    setPartnerListOpen(false);
  };

  const handleCustomerInnBlur = () => {
    setCustomerInn((value) => normalizeInn(value));
  };

  const handleSave = async () => {
    if (!organizationId || !warehouseId) return;
    setSaving(true);
    setError("");
    setSavePartnerError("");
    setSavePartnerMessage("");
    try {
      let partnerId = selectedPartnerId ? Number(selectedPartnerId) : null;
      if (manualTotalEnabled && manualTotalParsed === null) {
        setError("Введите корректную итоговую сумму.");
        return;
      }
      if (partnerMode === "manual") {
        const nextName = customerName.trim();
        const normalizedInn = normalizeInn(customerInn);
        const hasEnoughData = !!nextName && !!normalizedInn;
        if (hasEnoughData) {
          setSavePartnerLoading(true);
          const partnerRes = await authFetch(`platform/organizations/${organizationId}/suppliers/`, {
            method: "POST",
            body: JSON.stringify({
              name: nextName,
              inn: normalizedInn,
              phone: getPhoneDigits(customerPhone),
              address: customerAddress.trim(),
            }),
          });
          const partnerData = await partnerRes.json().catch(() => ({}));
          setSavePartnerLoading(false);
          if (partnerRes.ok) {
            partnerId = partnerData?.id ?? null;
            await loadPartners();
            if (partnerId != null) {
              setPartnerMode("list");
              setSelectedPartnerId(String(partnerId));
              setPartnerSearchTerm(
                `${partnerData?.name ?? nextName}${partnerData?.inn ? ` · ИНН ${partnerData.inn}` : ""}`
              );
            }
            setSavePartnerMessage("Партнёр добавлен в справочник при сохранении расхода.");
          } else {
            setSavePartnerError(
              partnerData?.detail ?? partnerData?.inn?.[0] ?? "Партнёр не сохранён в справочник."
            );
          }
        }
      }

      const lines = items.map((item) => ({
        our_name: item.our_name || "",
        ikpu_name: item.ikpu_name || "",
        ikpu_code: item.ikpu_code || "",
        ...(canUseUpc ? { upc: (item.upc || "").trim() } : {}),
        unit: item.unit || "шт",
        quantity: Math.max(0, Number(item.quantity) || 0),
        unit_price: Math.max(0, Number(item.unit_price) || 0),
        markings: resizeMarkingsArray(item.markings, item.quantity)
          .map((m) => String(m || "").trim())
          .filter(Boolean),
      }));

      const payload = {
        warehouse_id: Number(warehouseId),
        customer_id: partnerId,
        customer_name: customerName,
        customer_inn: normalizeInn(customerInn),
        customer_phone: getPhoneDigits(customerPhone),
        customer_address: customerAddress,
        contract_number: contractNumber,
        contract_date: contractDate || null,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate || null,
        vat_mode: vatMode,
        manual_total_enabled: manualTotalEnabled === true,
        manual_total_value: manualTotalEnabled ? manualTotalValue : null,
        total_quantity: totals.totalQuantity,
        total_without_vat: footerTotals.display.totalWithoutVat,
        total_vat: footerTotals.display.totalVat,
        total_with_vat: footerTotals.display.totalWithVat,
        lines,
      };
      const isEdit = Boolean(outgoingInvoiceId);
      const res = await authFetch(
        isEdit
          ? `platform/organizations/${organizationId}/outgoing-invoices/${outgoingInvoiceId}/`
          : `platform/organizations/${organizationId}/outgoing-invoices/`,
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(payload) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? data.upc?.[0] ?? "Ошибка сохранения");
        setSaving(false);
        return;
      }
      navigate(`/app/outgoing-invoices/${data.id}`);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  if (!organizationId) return <p className="text-sm text-muted">Выберите организацию в контексте.</p>;

  const listModeDisabled = !organizationId || (!partnersLoading && partners.length === 0);
  const isPartnerFieldsLocked = partnerMode === "list";
  const hasFixedItems = items.some((item) => item.is_fixed === true);
  const moneyFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4 pb-8 min-h-[calc(100vh-4rem)] -mx-4 px-4 sm:-mx-6 sm:px-6 py-4 sm:py-5 bg-gradient-to-b from-secondary/40 via-white to-secondary/30">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-4">
        <Link
          to="/app/warehouses"
          className="text-sm font-medium text-muted hover:text-primary transition"
          aria-label="Назад к списку складов"
        >
          ← Склады
        </Link>
        <Link
          to="/app/outgoing-invoices"
          className="text-sm font-medium text-muted hover:text-primary transition"
          aria-label="Журнал расходных счёт‑фактур"
        >
          Расходные счёт‑фактуры
        </Link>
      </div>

      <article className="max-w-6xl mx-auto space-y-6 bg-white/95 backdrop-blur-sm border border-border/80 rounded-2xl shadow-soft px-4 py-5 sm:px-6 sm:py-6 text-muted ring-1 ring-black/[0.03]">
        <header className="flex flex-wrap gap-4 justify-between items-start border-b border-border/70 pb-4">
          <div className="flex-1 flex flex-col min-w-0 sm:items-start">
            <p className="text-[11px] text-muted/80 leading-relaxed tracking-wide">
              Электронный документ · расходная счёт‑фактура
            </p>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-2 text-muted">
              {outgoingInvoiceId
                ? `Редактирование расхода · внутр. № ${outgoingInvoiceId}`
                : "Расходная счёт‑фактура"}
            </h1>
            <p className="text-[11px] text-muted/80 mt-1.5">
              Склад: {loading ? "..." : warehouseName || `Склад #${warehouseId}`}
            </p>
          </div>
        </header>

        {savePartnerMessage ? (
          <p className="text-sm text-green-800 bg-green-50/80 border border-green-200/70 rounded-lg px-4 py-2.5" role="status">
            {savePartnerMessage}
          </p>
        ) : null}
        {savePartnerError ? (
          <p className="text-sm text-red-800 bg-red-50/80 border border-red-200/70 rounded-lg px-4 py-2.5" role="alert">
            {savePartnerError}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-800 bg-red-50/80 border border-red-200/70 rounded-lg px-4 py-2.5" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rounded-xl border border-border/80 bg-white overflow-hidden">
          <section aria-labelledby="outgoing-partner-section-title">
            <div className="border-b border-border/70 bg-neutral-50/90 px-3 py-2.5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <h2 id="outgoing-partner-section-title" className={SECTION_HEADING}>
                  Кому отправляется товар
                </h2>
                <p className="text-[11px] text-muted/80 sm:text-right min-w-0 leading-snug">
                  <span className="font-medium text-muted">Склад:</span>{" "}
                  <span className="text-muted">{loading ? "..." : warehouseName || `Склад #${warehouseId}`}</span>
                </p>
              </div>
            </div>

            <div className="bg-white">
              <fieldset className="m-0 border-0 border-b border-border/60 px-3 py-2.5">
                <legend className="sr-only">Режим выбора партнёра</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5" role="radiogroup" aria-label="Режим партнёра">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-[13px] text-muted">
                    <input
                      type="radio"
                      name="outgoing-partner-source"
                      checked={partnerMode === "list"}
                      onChange={() => handlePartnerSourceChange("list")}
                      disabled={listModeDisabled}
                      className="rounded-full border-border text-primary focus:ring-primary"
                      aria-label="Найти партнёра в справочнике по поиску"
                    />
                    Из справочника (поиск)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-[13px] text-muted">
                    <input
                      type="radio"
                      name="outgoing-partner-source"
                      checked={partnerMode === "manual"}
                      onChange={() => handlePartnerSourceChange("manual")}
                      className="rounded-full border-border text-primary focus:ring-primary"
                      aria-label="Новый партнёр, ввести вручную"
                    />
                    Новый (ввести вручную)
                  </label>
                </div>
              </fieldset>

              {partnerMode === "list" ? (
                <div className="relative border-b border-neutral-200 px-3 py-2.5" ref={partnerPickerRef}>
                  <label htmlFor="outgoing-partner-search" className="block text-[11px] font-medium text-muted/80 mb-1">
                    Поиск в справочнике
                  </label>
                  <div className="flex flex-wrap gap-2 items-stretch">
                    <input
                      id="outgoing-partner-search"
                      type="search"
                      autoComplete="off"
                      value={partnerSearchTerm}
                      onChange={handlePartnerSearchChange}
                      onFocus={() => setPartnerListOpen(true)}
                      onKeyDown={handlePartnerSearchKeyDown}
                      disabled={listModeDisabled || partnersLoading}
                      className={`${INPUT_CLASS} flex-1 min-w-[200px]`}
                      placeholder="Название компании или ИНН…"
                      role="combobox"
                      aria-expanded={partnerListOpen}
                      aria-controls="outgoing-partner-results"
                      aria-autocomplete="list"
                      aria-label="Поиск партнёра по названию компании или ИНН"
                    />
                    {selectedPartnerId ? (
                      <button
                        type="button"
                        onClick={handleClearPartnerSelection}
                        disabled={listModeDisabled || partnersLoading}
                        className="shrink-0 px-3 py-2 border border-border bg-white text-muted text-xs font-medium hover:bg-secondary/70 hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary transition disabled:opacity-50"
                        aria-label="Сбросить выбранного партнёра"
                      >
                        Сбросить
                      </button>
                    ) : null}
                  </div>
                  {partnerListOpen && !listModeDisabled && !partnersLoading ? (
                    <ul
                      id="outgoing-partner-results"
                      role="listbox"
                      className="absolute z-30 left-0 right-0 mt-1.5 max-h-60 overflow-auto rounded-xl border border-neutral-200/90 bg-white shadow-lg shadow-neutral-900/10 ring-1 ring-black/[0.04]"
                    >
                      {filteredPartners.length === 0 ? (
                        <li className="px-4 py-3 text-sm text-muted" role="presentation">
                          {partnerSearchTerm.trim() ? "Ничего не найдено" : "Нет партнёров для отображения"}
                        </li>
                      ) : (
                        filteredPartners.map((partner) => (
                          <li key={partner.id} role="none">
                            <button
                              type="button"
                              role="option"
                              aria-selected={selectedPartnerId === String(partner.id)}
                              className="w-full text-left px-4 py-2 text-sm text-muted hover:bg-secondary/80 focus:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary transition"
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => handlePickPartnerFromSearch(partner)}
                            >
                              <span className="font-medium text-muted">{partner.name ?? `Партнёр #${partner.id}`}</span>
                              <span className="block text-xs text-muted mt-0.5">
                                {[partner.inn ? `ИНН ${partner.inn}` : null].filter(Boolean).join(" · ") || "—"}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div>
                <div className={DOC_ROW_GRID}>
                  <label htmlFor="outgoing-customer-name" className={DOC_LABEL_CELL}>
                    Наименование
                  </label>
                  <div className={DOC_INPUT_CELL}>
                    <input
                      id="outgoing-customer-name"
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      disabled={isPartnerFieldsLocked}
                      className={DOC_INPUT}
                      placeholder="—"
                      aria-label="Название получателя"
                    />
                  </div>
                </div>
                <div className={DOC_ROW_GRID}>
                  <label htmlFor="outgoing-customer-inn" className={DOC_LABEL_CELL}>
                    ИНН
                  </label>
                  <div className={DOC_INPUT_CELL}>
                    <input
                      id="outgoing-customer-inn"
                      type="text"
                      inputMode="numeric"
                      value={customerInn}
                      onChange={(e) => setCustomerInn(e.target.value)}
                      onBlur={handleCustomerInnBlur}
                      disabled={isPartnerFieldsLocked}
                      className={DOC_INPUT}
                      placeholder="—"
                      aria-label="ИНН получателя"
                    />
                  </div>
                </div>
                <div className={DOC_ROW_GRID}>
                  <label htmlFor="outgoing-customer-address" className={DOC_LABEL_CELL}>
                    Адрес
                  </label>
                  <div className={DOC_INPUT_CELL}>
                    <input
                      id="outgoing-customer-address"
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      disabled={isPartnerFieldsLocked}
                      className={DOC_INPUT}
                      placeholder="—"
                      aria-label="Адрес получателя"
                    />
                  </div>
                </div>
                <div className={DOC_ROW_GRID}>
                  <label htmlFor="outgoing-customer-phone" className={DOC_LABEL_CELL}>
                    Телефон
                  </label>
                  <div className={DOC_INPUT_CELL}>
                    <input
                      id="outgoing-customer-phone"
                      type="tel"
                      inputMode="numeric"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(formatPhoneDisplay(e.target.value))}
                      disabled={isPartnerFieldsLocked}
                      className={DOC_INPUT}
                      placeholder={PHONE_PLACEHOLDER}
                      aria-label="Телефон получателя"
                    />
                  </div>
                </div>
                <div className="px-3 py-2.5">
                  {partnerMode === "manual" ? (
                    <p className="text-[11px] text-muted/65">
                      Если заполнены наименование и ИНН, партнёр будет добавлен в справочник при сохранении документа.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted/65">
                      Данные подтянуты из справочника партнёров.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="border-t border-border/70">
          <h2 className={`px-3 py-2.5 ${SECTION_HEADING} bg-neutral-50/90 border-b border-border/60`}>
            Договор и счёт
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 border-b border-neutral-200/90 md:divide-x md:divide-neutral-200/90">
            <div className={`${DOC_ROW_GRID_COMPACT} min-w-0`}>
              <label htmlFor="outgoing-contract-number" className={DOC_LABEL_CELL}>
                Номер договора
              </label>
              <div className={`${DOC_INPUT_CELL} min-w-0`}>
                <input
                  id="outgoing-contract-number"
                  type="text"
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  className={DOC_INPUT}
                  placeholder="—"
                  aria-label="Номер договора"
                />
              </div>
            </div>
            <div className={`${DOC_ROW_GRID_COMPACT} min-w-0 border-t border-neutral-200/90 md:border-t-0`}>
              <label htmlFor="outgoing-contract-date" className={DOC_LABEL_CELL}>
                Дата договора
              </label>
              <div className={`${DOC_INPUT_CELL} min-w-0`}>
                <input
                  id="outgoing-contract-date"
                  type="date"
                  value={contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
                  className={DOC_INPUT}
                  aria-label="Дата договора"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 border-b border-neutral-200/90 md:divide-x md:divide-neutral-200/90">
            <div className={`${DOC_ROW_GRID_COMPACT} min-w-0`}>
              <label htmlFor="outgoing-invoice-number" className={DOC_LABEL_CELL}>
                Номер счёта
              </label>
              <div className={`${DOC_INPUT_CELL} min-w-0`}>
                <input
                  id="outgoing-invoice-number"
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className={DOC_INPUT}
                  placeholder="—"
                  aria-label="Номер счёта"
                />
              </div>
            </div>
            <div className={`${DOC_ROW_GRID_COMPACT} min-w-0 border-t border-neutral-200/90 md:border-t-0`}>
              <label htmlFor="outgoing-invoice-date" className={DOC_LABEL_CELL}>
                Дата счёта
              </label>
              <div className={`${DOC_INPUT_CELL} min-w-0`}>
                <input
                  id="outgoing-invoice-date"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className={DOC_INPUT}
                  aria-label="Дата счёта"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-white overflow-hidden">
          <div className="border-b border-border/70 bg-neutral-50/90 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <h2 className={`${SECTION_HEADING} shrink-0`}>Товарная часть</h2>
              </div>
              <div
                className="inline-flex rounded-lg border border-border/80 bg-secondary/90 p-0.5 shadow-inner"
                role="group"
                aria-label="Учёт НДС в расходной счёт‑фактуре"
              >
                <button
                  type="button"
                  onClick={() => setVatMode("without")}
                  aria-pressed={vatMode === "without"}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1 ${
                    vatMode === "without"
                      ? "bg-white text-muted shadow-sm ring-1 ring-border/60"
                      : "text-muted/70 hover:text-muted hover:bg-white/70"
                  }`}
                >
                  Без НДС
                </button>
                <button
                  type="button"
                  onClick={() => setVatMode("with")}
                  aria-pressed={vatMode === "with"}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1 ${
                    vatMode === "with"
                      ? "bg-white text-muted shadow-sm ring-1 ring-border/60"
                      : "text-muted/70 hover:text-muted hover:bg-white/70"
                  }`}
                >
                  С НДС
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-3">
            {items.map((item, idx) => {
              const isItemFixed = item.is_fixed === true;
              const quantity = Math.max(0, Number(item.quantity) || 0);
              const quantityInt = Math.min(MAX_MARKING_SLOTS, Math.max(0, Math.floor(quantity)));
              const markings = resizeMarkingsArray(item.markings, quantityInt);
              const unitPrice = Math.max(0, Number(item.unit_price) || 0);
              const amountWithoutVat = roundMoney(quantity * unitPrice);
              const vatAmount = vatMode === "with" ? roundMoney((amountWithoutVat * DEFAULT_VAT_RATE_PERCENT) / 100) : 0;
              const amountWithVat = roundMoney(amountWithoutVat + vatAmount);
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-border/80 bg-white shadow-soft overflow-hidden"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-border/60 bg-neutral-50/60">
                    <span
                      className="flex h-9 min-w-[2.25rem] items-center justify-center rounded border border-border bg-white text-sm font-semibold tabular-nums text-muted shrink-0"
                      aria-label={`Позиция ${idx + 1}`}
                    >
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                      disabled={items.length <= 1 || isItemFixed}
                      className="shrink-0 px-3 py-2 text-sm font-medium text-red-700 border border-red-300/80 bg-white hover:bg-red-50/80 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-40 disabled:pointer-events-none transition"
                      aria-label="Удалить позицию товара"
                    >
                      Удалить
                    </button>
                  </div>

                  <div className="border-b border-border/60 bg-white">
                    <div className={DOC_ROW_GRID}>
                      <label htmlFor={`outgoing-our-name-${item.id}`} className={DOC_LABEL_CELL}>
                        Наше наименование
                      </label>
                      <div className={DOC_INPUT_CELL}>
                        <input
                          id={`outgoing-our-name-${item.id}`}
                          type="text"
                          value={item.our_name}
                          onChange={(e) => handleChangeItem(item.id, { our_name: e.target.value })}
                          disabled={isItemFixed}
                          className={DOC_INPUT}
                          placeholder="—"
                          aria-label="Наше наименование товара"
                        />
                      </div>
                    </div>
                    <div className={DOC_ROW_GRID}>
                      <label htmlFor={`outgoing-ikpu-name-${item.id}`} className={DOC_LABEL_CELL}>
                        Наименование по ИКПУ
                      </label>
                      <div className={DOC_INPUT_CELL}>
                        <input
                          id={`outgoing-ikpu-name-${item.id}`}
                          type="text"
                          value={item.ikpu_name}
                          onChange={(e) => handleChangeItem(item.id, { ikpu_name: e.target.value })}
                          disabled={isItemFixed}
                          className={DOC_INPUT}
                          placeholder="—"
                          aria-label="Наименование по ИКПУ"
                        />
                      </div>
                    </div>
                    <div className={DOC_ROW_GRID}>
                      <label htmlFor={`outgoing-ikpu-code-${item.id}`} className={DOC_LABEL_CELL}>
                        ИКПУ
                      </label>
                      <div className={DOC_INPUT_CELL}>
                        <input
                          id={`outgoing-ikpu-code-${item.id}`}
                          type="text"
                          inputMode="numeric"
                          value={item.ikpu_code}
                          onChange={(e) => handleChangeItem(item.id, { ikpu_code: e.target.value })}
                          disabled={isItemFixed}
                          className={`${DOC_INPUT} font-mono text-[13px]`}
                          placeholder="17 цифр или пусто"
                          aria-label="ИКПУ товара"
                        />
                      </div>
                    </div>
                    {canUseUpc ? (
                      <div className={DOC_ROW_GRID}>
                        <label htmlFor={`outgoing-upc-${item.id}`} className={DOC_LABEL_CELL}>
                          UPC
                        </label>
                        <div className={DOC_INPUT_CELL}>
                          <input
                            id={`outgoing-upc-${item.id}`}
                            type="text"
                            value={item.upc}
                            onChange={(e) => handleChangeItem(item.id, { upc: e.target.value })}
                            disabled={isItemFixed}
                            className={`${DOC_INPUT} font-mono text-[13px]`}
                            placeholder="Например: 012345678905"
                            aria-label="UPC товара"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="p-3 sm:p-4 space-y-3">
                    {vatMode === "without" ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        <div>
                          <label htmlFor={`outgoing-unit-${item.id}`} className={ITEM_FIELD_LABEL}>
                            Ед. изм.
                          </label>
                          <input
                            id={`outgoing-unit-${item.id}`}
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleChangeItem(item.id, { unit: e.target.value })}
                            disabled={isItemFixed}
                            className={`${ITEM_FIELD_INPUT} text-center`}
                            aria-label="Единица измерения"
                          />
                        </div>
                        <div>
                          <label htmlFor={`outgoing-qty-${item.id}`} className={ITEM_FIELD_LABEL}>
                            Кол-во
                          </label>
                          <input
                            id={`outgoing-qty-${item.id}`}
                            type="number"
                            min="0"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => handleChangeItem(item.id, { quantity: e.target.value })}
                            disabled={isItemFixed}
                            className={`${ITEM_FIELD_INPUT} text-right font-mono`}
                            aria-label="Количество единиц"
                          />
                        </div>
                        <div>
                          <label htmlFor={`outgoing-price-${item.id}`} className={ITEM_FIELD_LABEL}>
                            Цена за ед.
                          </label>
                          <input
                            id={`outgoing-price-${item.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => handleChangeItem(item.id, { unit_price: e.target.value })}
                            className={`${ITEM_FIELD_INPUT} text-right font-mono`}
                            aria-label="Цена за единицу"
                          />
                        </div>
                        <div>
                          <span className={ITEM_FIELD_LABEL}>Сумма</span>
                          <div className={ITEM_SUM_BOX}>{moneyFmt.format(amountWithoutVat)}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                          <div>
                            <label htmlFor={`outgoing-unit-${item.id}`} className={ITEM_FIELD_LABEL}>
                              Ед. изм.
                            </label>
                            <input
                              id={`outgoing-unit-${item.id}`}
                              type="text"
                              value={item.unit}
                              onChange={(e) => handleChangeItem(item.id, { unit: e.target.value })}
                              disabled={isItemFixed}
                              className={`${ITEM_FIELD_INPUT} text-center`}
                              aria-label="Единица измерения"
                            />
                          </div>
                          <div>
                            <label htmlFor={`outgoing-qty-${item.id}`} className={ITEM_FIELD_LABEL}>
                              Кол-во
                            </label>
                            <input
                              id={`outgoing-qty-${item.id}`}
                              type="number"
                              min="0"
                              step="1"
                              value={item.quantity}
                              onChange={(e) => handleChangeItem(item.id, { quantity: e.target.value })}
                              disabled={isItemFixed}
                              className={`${ITEM_FIELD_INPUT} text-right font-mono`}
                              aria-label="Количество единиц"
                            />
                          </div>
                          <div>
                            <label htmlFor={`outgoing-price-${item.id}`} className={ITEM_FIELD_LABEL}>
                              Цена за ед.
                            </label>
                            <input
                              id={`outgoing-price-${item.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => handleChangeItem(item.id, { unit_price: e.target.value })}
                              className={`${ITEM_FIELD_INPUT} text-right font-mono`}
                              aria-label="Цена за единицу"
                            />
                          </div>
                          <div>
                            <span className={ITEM_FIELD_LABEL}>Сумма без НДС</span>
                            <div className={ITEM_SUM_BOX}>{moneyFmt.format(amountWithoutVat)}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 sm:gap-4 pt-2 border-t border-border/60">
                          <div>
                            <span className={ITEM_FIELD_LABEL}>НДС, %</span>
                            <div className="flex min-h-10 items-center justify-center px-2 rounded-lg border border-border bg-secondary/50 text-sm font-semibold tabular-nums text-muted/90">
                              {DEFAULT_VAT_RATE_PERCENT}
                            </div>
                          </div>
                          <div>
                            <span className={ITEM_FIELD_LABEL}>Сумма НДС</span>
                            <div className={ITEM_SUM_BOX}>{moneyFmt.format(vatAmount)}</div>
                          </div>
                          <div>
                            <span className={ITEM_FIELD_LABEL}>Всего с НДС</span>
                            <div className={ITEM_SUM_BOX_ACCENT}>{moneyFmt.format(amountWithVat)}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-border/60 bg-secondary/30 -mx-3 sm:-mx-4 px-3 sm:px-4 pb-2 rounded-b-xl">
                      <p className="block text-sm font-semibold text-muted mb-2">
                        Маркировки по единицам
                      </p>
                      {quantityInt <= 0 ? (
                        <p className="text-sm text-muted/70">
                          Сначала укажите количество, затем появятся отдельные поля маркировки.
                        </p>
                      ) : (
                        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 ${quantityInt > 18 ? "max-h-64 overflow-y-auto pr-1 -mr-1" : ""}`}>
                          {markings.map((code, mi) => (
                            <label key={`${item.id}-marking-${mi}`} className="flex flex-col gap-1 min-w-0">
                              <span className="text-xs font-semibold text-muted/70 uppercase tracking-wide">
                                Ед. {mi + 1} из {quantityInt}
                              </span>
                              <input
                                type="text"
                                value={code}
                                onChange={(e) => handleMarkingChange(item.id, mi, e.target.value)}
                                disabled={isItemFixed}
                                className={`${ITEM_FIELD_INPUT} font-mono text-[13px]`}
                                placeholder="Код маркировки"
                                autoComplete="off"
                                aria-label={`Маркировка единицы ${mi + 1} из ${quantityInt} для позиции ${idx + 1}`}
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-secondary/50 px-4 py-3 sm:px-5 shadow-inner ring-1 ring-border/30 space-y-3">
          {hasFixedItems ? (
            <p className="text-sm text-muted/75">
              Позиции и маркировки подставлены из выбранного прихода и недоступны для редактирования.
              Можно изменить цену за единицу и общий итог документа.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border/60">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-muted">
              <input
                type="checkbox"
                checked={manualTotalEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setManualTotalEnabled(on);
                  if (on) {
                    const base = vatMode === "without" ? totals.totalWithoutVat : totals.totalWithVat;
                    setManualTotalValue(String(base));
                  }
                }}
                className="rounded border-neutral-300 text-primary focus:ring-primary"
                aria-label="Задать итоговую сумму вручную"
              />
              Итог вручную
            </label>
            {manualTotalEnabled ? (
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[12rem]">
                <label htmlFor="outgoing-manual-grand-total" className="sr-only">
                  Сумма итого документа
                </label>
                <input
                  id="outgoing-manual-grand-total"
                  type="text"
                  inputMode="decimal"
                  value={manualTotalValue}
                  onChange={(e) => setManualTotalValue(e.target.value)}
                  className={`${ITEM_FIELD_INPUT} flex-1 min-w-[8rem] max-w-xs font-mono text-base`}
                  placeholder="0,00"
                  aria-label="Итоговая сумма документа вручную"
                />
                <button
                  type="button"
                  onClick={() => {
                    setManualTotalEnabled(false);
                    setManualTotalValue("");
                  }}
                  className="shrink-0 px-3 py-2 rounded-lg text-sm font-semibold border border-border bg-white text-muted hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                  aria-label="Сбросить итог к расчёту по позициям"
                >
                  Сбросить к расчёту
                </button>
              </div>
            ) : null}
          </div>
          {footerTotals.calculatedLabel ? (
            <p className="text-sm text-muted/75">{footerTotals.calculatedLabel}</p>
          ) : null}
          {vatMode === "without" ? (
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 text-base font-semibold text-muted">
              <span>Итого: кол-во единиц — {totalQuantity}</span>
              <span className="font-mono tabular-nums text-lg sm:text-xl">
                {moneyFmt.format(footerTotals.display.totalWithoutVat)}
              </span>
            </div>
          ) : (
            <div className="space-y-2.5 text-base text-muted">
              <div className="flex flex-wrap justify-between gap-2 font-medium">
                <span>Итого без НДС ({totalQuantity} ед.)</span>
                <span className="font-mono tabular-nums">{moneyFmt.format(footerTotals.display.totalWithoutVat)}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-muted/95">
                <span>НДС {DEFAULT_VAT_RATE_PERCENT}%</span>
                <span className="font-mono tabular-nums">{moneyFmt.format(footerTotals.display.totalVat)}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-border/60 text-lg font-semibold text-muted">
                <span>Всего с НДС</span>
                <span className="font-mono tabular-nums">{moneyFmt.format(footerTotals.display.totalWithVat)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || savePartnerLoading}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold bg-primary text-white shadow-sm hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 transition disabled:opacity-60 disabled:pointer-events-none"
            aria-label={outgoingInvoiceId ? "Сохранить изменения расходной счёт‑фактуры" : "Сохранить расходную счёт‑фактуру"}
            aria-busy={saving}
          >
            {saving ? "Сохранение…" : outgoingInvoiceId ? "Сохранить изменения" : "Сохранить"}
          </button>
        </div>
      </article>
    </div>
  );
};

export default WarehouseOutgoing;
