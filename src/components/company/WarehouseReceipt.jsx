import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Сколько цифр слева от позиции курсора (для восстановления курсора после форматирования). */
const countDigitsBeforeCursor = (s, cursorPos) => {
  const end = Math.min(cursorPos ?? 0, s.length);
  let n = 0;
  for (let i = 0; i < end; i += 1) {
    if (/\d/.test(s[i])) n += 1;
  }
  return n;
};

/** Позиция курсора после n-й цифры в отформатированной строке. */
const positionAfterNthDigit = (str, n) => {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < str.length; i += 1) {
    if (/\d/.test(str[i])) {
      seen += 1;
      if (seen === n) return i + 1;
    }
  }
  return str.length;
};
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../../utils/phone";

const INPUT_CLASS =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-secondary/40";
const LABEL_CLASS = "block text-sm font-medium text-muted mb-1.5";

const normalizeInn = (value) => (value || "").replace(/\D/g, "");

/** ИКПУ в справочнике — 17 цифр; сравниваем только цифры. */
const normalizeIkpuDigits = (value) => String(value ?? "").replace(/\D/g, "");

const findCatalogProductIdByIkpu = (products, ikpuDigits) => {
  if (!ikpuDigits || ikpuDigits.length !== 17) return null;
  const p = products.find((x) => normalizeIkpuDigits(x.ikpu_code) === ikpuDigits);
  return p?.id != null ? p.id : null;
};

const buildSupplierSearchLabel = (s) => {
  const name = (s.name || "").trim() || `Поставщик #${s.id}`;
  const innPart = s.inn ? `ИНН ${s.inn}` : "";
  return innPart ? `${name} · ${innPart}` : name;
};

const buildCatalogProductLabel = (p) => {
  const name = (p.name || "").trim() || `Товар #${p.id}`;
  const ik = (p.ikpu_code || "").trim();
  const upc = (p.upc || "").trim();
  if (ik && upc) return `${name} · ИКПУ ${ik} · UPC ${upc}`;
  if (ik) return `${name} · ИКПУ ${ik}`;
  if (upc) return `${name} · UPC ${upc}`;
  return name;
};

const formatDateDdMmYyyy = (iso) => {
  if (!iso || typeof iso !== "string") return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
};

const HelpTooltip = ({ open, tooltipId, buttonLabel, text, onOpen, onClose }) => {
  const buttonRef = useRef(null);
  const tooltipRef = useRef(null);
  const [layer, setLayer] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setLayer(null);
      return;
    }

    const compute = () => {
      const btn = buttonRef.current;
      if (!btn) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isNarrow = vw < 640;

      if (isNarrow) {
        setLayer({ variant: "sheet" });
        return;
      }

      const tip = tooltipRef.current;
      if (!tip) return;

      const rect = btn.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const w = Math.min(360, Math.max(220, tipRect.width || 320));
      const h = tipRect.height || 1;

      const pad = 12;
      const gap = 8;

      let left = rect.left;
      if (left + w > vw - pad) left = Math.max(pad, vw - pad - w);
      if (left < pad) left = pad;

      let top = rect.bottom + gap;
      if (top + h > vh - pad) {
        top = rect.top - gap - h;
      }
      if (top < pad) top = pad;

      setLayer({ variant: "popover", top, left, width: w });
    };

    compute();
    const raf = requestAnimationFrame(() => compute());
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open, text]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (buttonRef.current?.contains(t) || tooltipRef.current?.contains(t)) return;
      onClose();
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, onClose]);

  const portal =
    open && typeof document !== "undefined"
      ? createPortal(
          <>
            {layer?.variant === "sheet" ? (
              <div className="fixed inset-0 z-[60] flex items-end justify-center" role="presentation">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/25"
                  aria-label="Закрыть подсказку"
                  onClick={onClose}
                />
                <div
                  id={tooltipId}
                  ref={tooltipRef}
                  role="dialog"
                  aria-label={buttonLabel}
                  className="relative z-[61] w-full max-h-[45vh] overflow-auto rounded-t-xl border border-neutral-200 bg-white px-4 py-3 text-[13px] leading-snug text-muted shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
                >
                  <span className="block whitespace-normal break-words">{text}</span>
                </div>
              </div>
            ) : layer?.variant === "popover" ? (
              <div
                id={tooltipId}
                ref={tooltipRef}
                role="tooltip"
                className="fixed z-[60] max-h-[min(60vh,22rem)] overflow-auto rounded-md border border-neutral-200 bg-white px-3 py-2 text-[12px] leading-snug text-muted shadow-lg shadow-neutral-900/15"
                style={{
                  top: layer.top,
                  left: layer.left,
                  width: layer.width,
                  maxWidth: "calc(100vw - 24px)",
                }}
              >
                <span className="block whitespace-normal break-words">{text}</span>
              </div>
            ) : open ? (
              <div
                ref={tooltipRef}
                className="fixed left-[-9999px] top-0 z-[60] w-[min(360px,calc(100vw-24px))] max-w-[min(360px,calc(100vw-24px))] rounded-md border border-transparent px-3 py-2 text-[12px] opacity-0 pointer-events-none"
                aria-hidden="true"
              >
                {text}
              </div>
            ) : null}
          </>,
          document.body
        )
      : null;

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-white text-[11px] font-semibold text-muted/80 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-controls={open ? tooltipId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) onClose();
          else onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (open) onClose();
            else onOpen();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        ?
      </button>
      {portal}
    </span>
  );
};

const DOC_INPUT =
  "w-full min-w-0 border-0 bg-transparent py-2 text-[15px] leading-6 text-muted focus:outline-none focus:ring-2 focus:ring-primary/25 focus:ring-offset-0 rounded-md placeholder:text-neutral-500/85 disabled:cursor-not-allowed disabled:bg-stone-50/60 disabled:text-muted";

/** Строка «как в Excel»: на узком экране подпись над полем, с sm — две колонки (без фиксированных 220px). */
const DOC_ROW_GRID =
  "grid grid-cols-1 min-w-0 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] border-b border-neutral-200/90";
const DOC_LABEL_CELL =
  "px-3 py-2 text-[11px] font-medium text-muted/80 bg-neutral-50/60 border-b border-neutral-200/90 sm:border-b-0 sm:border-r sm:border-neutral-200/90";
const DOC_INPUT_CELL = "px-3 py-2 min-w-0";
const DOC_ROW_GRID_COMPACT =
  "grid grid-cols-1 min-w-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]";

/** Заголовки секций внутри формы — единый стиль. */
const SECTION_HEADING = "text-sm font-semibold uppercase tracking-wide text-muted";

/** Поля «ед. / кол-во / цена» в позиции — одна высота и бордер из темы. */
const ITEM_FIELD_LABEL = "block text-xs font-medium text-muted mb-1";
const ITEM_FIELD_INPUT =
  "w-full min-w-0 min-h-10 px-3 py-2 text-[15px] leading-6 text-muted rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-neutral-500/80 disabled:cursor-not-allowed disabled:bg-secondary/50";
const ITEM_SUM_BOX =
  "flex min-h-10 items-center justify-end px-3 py-2 rounded-lg border border-border bg-secondary/50 text-[15px] font-mono tabular-nums font-semibold text-muted";
const ITEM_SUM_BOX_ACCENT =
  "flex min-h-10 items-center justify-end px-3 py-2 rounded-lg border border-primary/25 bg-primary/8 text-[15px] font-mono tabular-nums font-bold text-muted";

/** Ставка НДС, % — позже брать из настроек организации */
const DEFAULT_VAT_RATE_PERCENT = 12;

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

/** Маркировки по числу единиц (макс. 500 на строку для производительности). */
const MAX_MARKING_SLOTS = 500;

/** Извлечь коды из текста файла (.txt / .csv): одна строка — один код или первая колонка до ; , или таба */
const parseMarkingCodesFromFileText = (raw) => {
  if (!raw || typeof raw !== "string") return [];
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    let cell = line.trim();
    if (!cell) continue;
    if (cell.includes(";")) cell = cell.split(";")[0].trim();
    else if (cell.includes("\t")) cell = cell.split("\t")[0].trim();
    else if (cell.includes(",")) cell = cell.split(",")[0].trim();
    if (cell) out.push(cell);
  }
  return out.slice(0, MAX_MARKING_SLOTS);
};

/** Первая колонка первого листа .xlsx */
const parseMarkingCodesFromXlsxBuffer = async (buffer) => {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const out = [];
  for (const row of rows) {
    const cell = Array.isArray(row) ? row[0] : null;
    const t = cell != null ? String(cell).trim() : "";
    if (t) out.push(t);
  }
  return out.slice(0, MAX_MARKING_SLOTS);
};

const parseMoneyInput = (value) => {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = parseFloat(raw);
  return Number.isFinite(n) ? roundMoney(n) : null;
};

/** Количество: запятая или точка, до 3 знаков после запятой, без «колёсика» number input. */
const parseQuantityInput = (value) => {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (raw === "" || raw === "-" || raw === ".") return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(MAX_MARKING_SLOTS, Math.max(0, n));
  return Math.round(clamped * 1000) / 1000;
};

const formatQuantityDisplay = (n) => {
  if (!Number.isFinite(n) || n === 0) return "";
  const r = Math.round(n * 1000) / 1000;
  return r.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 3, useGrouping: true });
};

/** Цена: ru-RU (пробелы как разделитель тысяч, запятая в дробной части). */
const formatMoneyDisplay = (n) => {
  if (!Number.isFinite(n) || n === 0) return "";
  return roundMoney(n).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

/**
 * Текстовое поле для десятичных чисел: ввод с запятой/точкой, при вводе — группы разрядов (1 000).
 */
const DecimalField = ({ id, className, value, onCommit, format, parse, ariaLabel, placeholder }) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => format(value));
  const inputRef = useRef(null);
  const cursorDigitsRef = useRef(null);

  useEffect(() => {
    if (!focused) setDraft(format(value));
  }, [value, focused, format]);

  useLayoutEffect(() => {
    if (cursorDigitsRef.current == null || !inputRef.current) return;
    const n = cursorDigitsRef.current;
    cursorDigitsRef.current = null;
    const el = inputRef.current;
    const pos = positionAfterNthDigit(el.value, n);
    el.setSelectionRange(pos, pos);
  }, [draft]);

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="decimal"
      lang="ru-RU"
      autoComplete="off"
      placeholder={placeholder}
      className={className}
      aria-label={ariaLabel}
      value={focused ? draft : format(value)}
      onFocus={() => {
        setFocused(true);
        setDraft(format(value));
      }}
      onChange={(e) => {
        const el = e.target;
        const v = el.value;
        const cursorPos = el.selectionStart ?? v.length;
        const digitsBefore = countDigitsBeforeCursor(v, cursorPos);
        const trimmedEnd = v.trimEnd();
        const endsIncompleteDecimal = /[0-9][\s\u00A0]*[,.]\s*$/.test(trimmedEnd);
        const p = parse(v);
        if (p === null) {
          setDraft(v);
          return;
        }
        onCommit(p);
        if (endsIncompleteDecimal) {
          setDraft(v);
          return;
        }
        const next = format(p);
        setDraft(next);
        cursorDigitsRef.current = digitsBefore;
      }}
      onBlur={() => {
        const p = parse(draft);
        onCommit(p !== null ? p : 0);
        setFocused(false);
      }}
    />
  );
};

const QuantityField = ({ id, value, onCommit, className, ariaLabel }) => (
  <DecimalField
    id={id}
    className={className}
    value={value}
    onCommit={onCommit}
    format={formatQuantityDisplay}
    parse={parseQuantityInput}
    ariaLabel={ariaLabel}
    placeholder="0"
  />
);

const MoneyField = ({ id, value, onCommit, className, ariaLabel, placeholder }) => (
  <DecimalField
    id={id}
    className={className}
    value={value}
    onCommit={onCommit}
    format={formatMoneyDisplay}
    parse={parseMoneyInput}
    ariaLabel={ariaLabel}
    placeholder={placeholder ?? "0,00"}
  />
);

const resizeMarkingsArray = (markings, targetLength) => {
  const prev = Array.isArray(markings) ? markings : [];
  const len = Math.max(0, Math.min(MAX_MARKING_SLOTS, Math.floor(Number(targetLength)) || 0));
  const out = [];
  for (let i = 0; i < len; i += 1) {
    out.push(typeof prev[i] === "string" ? prev[i] : "");
  }
  return out;
};

const countFilledMarkings = (markings) => {
  if (!Array.isArray(markings)) return 0;
  return markings.filter((s) => typeof s === "string" && s.trim() !== "").length;
};

const findMarkingFieldByCode = (rows, code) => {
  const needle = (code || "").trim();
  if (!needle) return null;
  for (const row of rows) {
    const qtyInt = Math.min(MAX_MARKING_SLOTS, Math.max(0, Math.floor(Number(row.quantity)) || 0));
    const markings = resizeMarkingsArray(row.markings, qtyInt);
    for (let mi = 0; mi < markings.length; mi += 1) {
      if ((markings[mi] || "").trim() === needle) {
        return { rowId: row.id, index: mi };
      }
    }
  }
  return null;
};

const MARKING_INPUT_CLASS =
  "w-full min-w-0 min-h-10 text-sm font-mono text-muted border border-border/80 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-neutral-500/75";

/** Черновик формы в sessionStorage (только текст/числа; фото строк не сохраняются). */
const RECEIPT_DRAFT_VERSION = 1;
const receiptDraftStorageKey = (orgId, whId) =>
  orgId != null && whId != null ? `wms-receipt-draft-${orgId}-${whId}` : null;

const WarehouseReceipt = () => {
  const { warehouseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editInvoiceId = searchParams.get("invoice");
  const { activeContext, markForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const warehouseName = useMemo(() => {
    const fromState = location?.state?.warehouseName;
    if (typeof fromState === "string" && fromState.trim()) return fromState.trim();
    return warehouseId ? `Склад #${warehouseId}` : "Склад";
  }, [location?.state?.warehouseName, warehouseId]);

  const warehouseAddress = useMemo(() => {
    const fromState = location?.state?.warehouseAddress;
    if (typeof fromState === "string" && fromState.trim()) return fromState.trim();
    return "";
  }, [location?.state?.warehouseAddress]);

  const [contractNumber, setContractNumber] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");

  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersLoadError, setSuppliersLoadError] = useState("");
  const [suppliersForbidden, setSuppliersForbidden] = useState(false);

  const [supplierSource, setSupplierSource] = useState("manual");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierSearchTerm, setSupplierSearchTerm] = useState("");
  const [supplierListOpen, setSupplierListOpen] = useState(false);
  const supplierPickerRef = useRef(null);

  const [supplierName, setSupplierName] = useState("");
  const [supplierInn, setSupplierInn] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");

  const [saveSupplierLoading, setSaveSupplierLoading] = useState(false);
  const [saveSupplierMessage, setSaveSupplierMessage] = useState("");
  const [saveSupplierError, setSaveSupplierError] = useState("");

  const [items, setItems] = useState([
    {
      id: "row-1",
      name: "",
      ikpuName: "",
      unit: "шт",
      quantity: 1,
      unitPrice: 0,
      ikpu: "",
      upc: "",
      catalogProductId: null,
      markings: [],
    },
  ]);

  /** Свернуты ли блоки маркировки: id строки → true = свернуто */
  const [markingsRowsCollapsed, setMarkingsRowsCollapsed] = useState({});

  const [vatMode, setVatMode] = useState("without");

  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogLoadError, setCatalogLoadError] = useState("");
  const [productPickerRowId, setProductPickerRowId] = useState(null);
  /** Какое поле открыло подсказку: наше наименование / наименование по ИКПУ / ИКПУ */
  const [productPickerField, setProductPickerField] = useState(null);
  const [receiptSaveLoading, setReceiptSaveLoading] = useState(false);
  const [invoiceSaveMessage, setInvoiceSaveMessage] = useState("");
  const [invoiceSaveError, setInvoiceSaveError] = useState("");
  const [editInvoiceLoading, setEditInvoiceLoading] = useState(false);
  const [editInvoiceLoadError, setEditInvoiceLoadError] = useState("");
  const [saveCatalogProductMessage, setSaveCatalogProductMessage] = useState("");
  const [saveCatalogProductError, setSaveCatalogProductError] = useState("");
  const catalogPickerRef = useRef(null);
  const markingUploadTargetRowRef = useRef(null);
  const markingInputRefs = useRef({});
  const photoUploadTargetRowRef = useRef(null);
  const [itemPhotos, setItemPhotos] = useState({});
  const [duplicateMarkingField, setDuplicateMarkingField] = useState(null);

  const [manualTotalEnabled, setManualTotalEnabled] = useState(false);
  const [manualTotalValue, setManualTotalValue] = useState("");

  const [buyerProfile, setBuyerProfile] = useState(null);

  const loadBuyerProfile = useCallback(async () => {
    if (!organizationId) {
      setBuyerProfile(null);
      return;
    }
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBuyerProfile(data);
        return;
      }
      setBuyerProfile(null);
    } catch {
      setBuyerProfile(null);
    }
  }, [organizationId]);

  useEffect(() => {
    loadBuyerProfile();
  }, [loadBuyerProfile]);

  useEffect(() => {
    if (!editInvoiceId || !organizationId) {
      setEditInvoiceLoadError("");
      setEditInvoiceLoading(false);
      return;
    }
    let cancelled = false;
    const loadInvoiceForEdit = async () => {
      setEditInvoiceLoading(true);
      setEditInvoiceLoadError("");
      try {
        const res = await authFetch(
          `platform/organizations/${organizationId}/invoices/${editInvoiceId}/`
        );
        const inv = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setEditInvoiceLoadError(inv.detail ?? "Не удалось загрузить документ.");
          return;
        }
        if (inv.status !== "draft") {
          if (!cancelled) {
            setEditInvoiceLoadError("Документ утверждён. Редактирование недоступно.");
          }
          return;
        }
        if (inv.warehouse_id != null && String(inv.warehouse_id) !== String(warehouseId)) {
          navigate(`/app/warehouses/${inv.warehouse_id}/receipt?invoice=${editInvoiceId}`, {
            replace: true,
          });
          return;
        }
        if (cancelled) return;
        setContractNumber((inv.contract_number ?? "").trim());
        setContractDate(
          typeof inv.contract_date === "string" && inv.contract_date.length >= 10
            ? inv.contract_date.slice(0, 10)
            : ""
        );
        setInvoiceNumber((inv.invoice_number ?? "").trim());
        setInvoiceDate(
          typeof inv.invoice_date === "string" && inv.invoice_date.length >= 10
            ? inv.invoice_date.slice(0, 10)
            : ""
        );
        if (inv.supplier_id != null) {
          setSupplierSource("list");
          setSelectedSupplierId(String(inv.supplier_id));
        } else {
          setSupplierSource("manual");
          setSelectedSupplierId("");
        }
        setSupplierName((inv.supplier_name ?? "").trim());
        setSupplierInn((inv.supplier_inn ?? "").trim());
        setSupplierPhone(formatPhoneDisplay(inv.supplier_phone ?? ""));
        setSupplierAddress((inv.supplier_address ?? "").trim());
        setSupplierSearchTerm(
          inv.supplier_id != null
            ? buildSupplierSearchLabel({
                id: inv.supplier_id,
                name: inv.supplier_name ?? "",
                inn: inv.supplier_inn ?? "",
              })
            : ""
        );
        setVatMode(inv.vat_mode === "with" ? "with" : "without");
        setManualTotalEnabled(inv.manual_total_enabled === true);
        if (inv.manual_total_value != null && inv.manual_total_value !== "") {
          setManualTotalValue(String(inv.manual_total_value));
        } else {
          setManualTotalValue("");
        }
        const rawLines = Array.isArray(inv.lines) ? inv.lines : [];
        if (rawLines.length > 0) {
          setItems(
            rawLines.map((line, idx) => {
              const qty =
                typeof line.quantity === "number" && Number.isFinite(line.quantity) ? line.quantity : 0;
              const rawM = Array.isArray(line.markings) ? line.markings : [];
              const markingsNormalized = rawM.map((m) =>
                typeof m === "string" ? m : String(m ?? "")
              );
              return {
                id: `row-${line.id ?? idx + 1}`,
                name: line.our_name ?? "",
                ikpuName: line.ikpu_name ?? "",
                unit: (line.unit ?? "шт").trim() || "шт",
                quantity: qty,
                unitPrice:
                  typeof line.unit_price === "number" && Number.isFinite(line.unit_price)
                    ? line.unit_price
                    : Number(line.unit_price ?? 0),
                ikpu: line.ikpu_code ?? "",
                upc: line.upc ?? "",
                catalogProductId: line.catalog_product_id != null ? line.catalog_product_id : null,
                markings: resizeMarkingsArray(markingsNormalized, qty),
              };
            })
          );
        }
        setShowDraftBanner(false);
      } catch (err) {
        if (!cancelled) setEditInvoiceLoadError(err.message ?? "Ошибка сети");
      } finally {
        if (!cancelled) setEditInvoiceLoading(false);
      }
    };
    void loadInvoiceForEdit();
    return () => {
      cancelled = true;
    };
  }, [editInvoiceId, organizationId, warehouseId, navigate]);

  const canUseMarking = buyerProfile?.subscription?.tariff_can_marking === true;
  const canUseUpc = buyerProfile?.subscription?.tariff_can_upc === true;

  useEffect(() => {
    if (!buyerProfile) return;
    if (canUseMarking) return;
    setItems((prev) => prev.map((it) => ({ ...it, markings: [] })));
    setMarkingsRowsCollapsed({});
  }, [canUseMarking, buyerProfile]);

  useEffect(() => {
    if (!buyerProfile) return;
    if (canUseUpc) return;
    setItems((prev) => prev.map((it) => ({ ...it, upc: "" })));
  }, [canUseUpc, buyerProfile]);

  const loadSuppliers = useCallback(async () => {
    if (!organizationId) return;
    setSuppliersLoading(true);
    setSuppliersLoadError("");
    setSuppliersForbidden(false);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/suppliers/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setSuppliersForbidden(true);
          markForbiddenAppPage?.(organizationId, "suppliers");
          setSuppliersLoadError("Нет доступа к списку поставщиков. Заполните данные вручную.");
          setSuppliers([]);
          return;
        }
        setSuppliersLoadError(data.detail ?? "Не удалось загрузить поставщиков");
        setSuppliers([]);
        return;
      }
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (err) {
      setSuppliersLoadError(err.message ?? "Ошибка сети");
      setSuppliers([]);
    } finally {
      setSuppliersLoading(false);
    }
  }, [organizationId, markForbiddenAppPage]);

  useEffect(() => {
    if (organizationId) {
      loadSuppliers();
    } else {
      setSuppliers([]);
    }
  }, [organizationId, loadSuppliers]);

  const loadCatalogProducts = useCallback(async () => {
    if (!organizationId) {
      setCatalogProducts([]);
      return;
    }
    setCatalogLoading(true);
    setCatalogLoadError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/products/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "products");
          setCatalogLoadError("Нет доступа к справочнику товаров.");
          setCatalogProducts([]);
          return;
        }
        setCatalogLoadError(data.detail ?? "Не удалось загрузить справочник товаров");
        setCatalogProducts([]);
        return;
      }
      setCatalogProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setCatalogLoadError(err.message ?? "Ошибка сети");
      setCatalogProducts([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [organizationId, markForbiddenAppPage]);

  useEffect(() => {
    if (organizationId) loadCatalogProducts();
    else setCatalogProducts([]);
  }, [organizationId, loadCatalogProducts]);

  useEffect(() => {
    if (!productPickerRowId) return;
    const handlePointerDown = (e) => {
      if (catalogPickerRef.current && !catalogPickerRef.current.contains(e.target)) {
        setProductPickerRowId(null);
        setProductPickerField(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [productPickerRowId]);

  const catalogPickerFilteredList = useMemo(() => {
    if (!productPickerRowId || !productPickerField) return [];
    const row = items.find((it) => it.id === productPickerRowId);
    if (!row) return [];
    if (productPickerField === "ourName") {
      const raw = (row.name || "").trim().toLowerCase();
      if (!raw) return [];
      return catalogProducts
        .filter((p) => (p.name || "").toLowerCase().includes(raw))
        .slice(0, 80);
    }
    if (productPickerField === "ikpuName") {
      const raw = (row.ikpuName || "").trim().toLowerCase();
      if (!raw) return [];
      return catalogProducts
        .filter((p) => (p.name || "").toLowerCase().includes(raw))
        .slice(0, 80);
    }
    const digits = (row.ikpu || "").replace(/\D/g, "");
    if (!digits) return [];
    return catalogProducts
      .filter((p) => {
        const pDigits = String(p.ikpu_code || "").replace(/\D/g, "");
        return pDigits.includes(digits);
      })
      .slice(0, 80);
  }, [catalogProducts, items, productPickerRowId, productPickerField]);

  const clearSupplierSelectionFields = useCallback(() => {
    setSelectedSupplierId("");
    setSupplierSearchTerm("");
    setSupplierName("");
    setSupplierInn("");
    setSupplierPhone("");
    setSupplierAddress("");
  }, []);

  const filteredSuppliers = useMemo(() => {
    const raw = supplierSearchTerm.trim();
    const qLower = raw.toLowerCase();
    const qDigits = raw.replace(/\D/g, "");
    let list = suppliers;
    if (raw) {
      list = suppliers.filter((s) => {
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
  }, [suppliers, supplierSearchTerm]);

  useEffect(() => {
    const handlePointerDown = (e) => {
      if (!supplierPickerRef.current?.contains(e.target)) {
        setSupplierListOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const handleSupplierSourceChange = (next) => {
    setSupplierListOpen(false);
    if (next === "list") {
      setSupplierSource("list");
      clearSupplierSelectionFields();
      return;
    }
    setSupplierSource("manual");
    setSelectedSupplierId("");
    setSupplierSearchTerm("");
  };

  const handleSupplierSearchChange = (e) => {
    const value = e.target.value;
    setSupplierSearchTerm(value);
    setSupplierListOpen(true);
    if (selectedSupplierId) {
      setSelectedSupplierId("");
      setSupplierName("");
      setSupplierInn("");
      setSupplierPhone("");
      setSupplierAddress("");
    }
  };

  const handlePickSupplierFromSearch = (s) => {
    setSelectedSupplierId(String(s.id));
    setSupplierName(s.name ?? "");
    setSupplierInn(s.inn ?? "");
    setSupplierPhone(formatPhoneDisplay(s.phone ?? ""));
    setSupplierAddress(s.address ?? "");
    setSupplierSearchTerm(buildSupplierSearchLabel(s));
    setSupplierListOpen(false);
  };

  const handleClearSupplierSelection = () => {
    clearSupplierSelectionFields();
    setSupplierListOpen(false);
  };

  const handleSupplierSearchKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setSupplierListOpen(false);
    }
  };

  const handleSupplierInnBlur = () => {
    setSupplierInn((v) => normalizeInn(v));
  };

  const handleSaveSupplierToDirectory = async () => {
    if (!organizationId || suppliersForbidden) return;
    const nextName = supplierName.trim();
    const normalizedInn = normalizeInn(supplierInn);
    if (!nextName) {
      setSaveSupplierError("Введите название поставщика.");
      return;
    }
    if (!normalizedInn) {
      setSaveSupplierError("Введите ИНН.");
      return;
    }
    setSaveSupplierLoading(true);
    setSaveSupplierError("");
    setSaveSupplierMessage("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/suppliers/`, {
        method: "POST",
        body: JSON.stringify({
          name: nextName,
          inn: normalizedInn,
          phone: getPhoneDigits(supplierPhone),
          address: supplierAddress.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setSuppliersForbidden(true);
          markForbiddenAppPage?.(organizationId, "suppliers");
          setSaveSupplierError("Нет прав на создание поставщика.");
          return;
        }
        setSaveSupplierError(data.detail ?? data.inn?.[0] ?? "Ошибка сохранения");
        return;
      }
      setSaveSupplierMessage("Поставщик добавлен в справочник.");
      await loadSuppliers();
      const newId = data?.id;
      if (newId != null) {
        setSupplierSource("list");
        setSelectedSupplierId(String(newId));
        setSupplierName(data.name ?? nextName);
        setSupplierInn(data.inn ?? normalizedInn);
        setSupplierPhone(formatPhoneDisplay(data.phone ?? supplierPhone ?? ""));
        setSupplierAddress(data.address ?? supplierAddress.trim());
        setSupplierSearchTerm(
          buildSupplierSearchLabel({
            id: newId,
            name: data.name ?? nextName,
            inn: data.inn ?? normalizedInn,
          })
        );
      }
    } catch (err) {
      setSaveSupplierError(err.message ?? "Ошибка сети");
    } finally {
      setSaveSupplierLoading(false);
    }
  };

  const totalQuantity = useMemo(() => {
    return items.reduce((acc, it) => {
      const q = typeof it.quantity === "number" ? it.quantity : Number(it.quantity);
      return acc + (Number.isFinite(q) ? q : 0);
    }, 0);
  }, [items]);

  const { lineCalculations, totals } = useMemo(() => {
    const lines = items.map((it) => {
      const q = typeof it.quantity === "number" ? it.quantity : Number(it.quantity);
      const p = typeof it.unitPrice === "number" ? it.unitPrice : Number(it.unitPrice);
      const qq = Number.isFinite(q) ? q : 0;
      const pp = Number.isFinite(p) ? p : 0;
      const amountWithoutVat = roundMoney(qq * pp);
      const vatAmount =
        vatMode === "with"
          ? roundMoney((amountWithoutVat * DEFAULT_VAT_RATE_PERCENT) / 100)
          : 0;
      const amountWithVat = roundMoney(amountWithoutVat + vatAmount);
      return { amountWithoutVat, vatAmount, amountWithVat };
    });
    const totalWithoutVat = roundMoney(lines.reduce((acc, row) => acc + row.amountWithoutVat, 0));
    const totalVat = roundMoney(lines.reduce((acc, row) => acc + row.vatAmount, 0));
    const totalWithVat = roundMoney(lines.reduce((acc, row) => acc + row.amountWithVat, 0));
    return {
      lineCalculations: lines,
      totals: { totalWithoutVat, totalVat, totalWithVat },
    };
  }, [items, vatMode]);

  const manualTotalParsed = useMemo(() => parseMoneyInput(manualTotalValue), [manualTotalValue]);

  const moneyFmt = useMemo(() => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), []);

  const footerTotals = useMemo(() => {
    if (!manualTotalEnabled || manualTotalParsed === null) {
      return { display: totals, calculatedLabel: null };
    }
    if (vatMode === "without") {
      return {
        display: {
          totalWithoutVat: manualTotalParsed,
          totalVat: 0,
          totalWithVat: manualTotalParsed,
        },
        calculatedLabel: `Сумма по позициям (расчёт): ${moneyFmt.format(totals.totalWithoutVat)}`,
      };
    }
    return {
      display: {
        totalWithoutVat: totals.totalWithoutVat,
        totalVat: totals.totalVat,
        totalWithVat: manualTotalParsed,
      },
      calculatedLabel: `По позициям с НДС (расчёт): ${moneyFmt.format(totals.totalWithVat)}`,
    };
  }, [manualTotalEnabled, manualTotalParsed, totals, vatMode, moneyFmt]);

  const handleAddItem = () => {
    const nextIndex = items.length + 1;
    const newId = `row-${nextIndex}`;
    setItems((prev) => [
      ...prev,
      {
        id: newId,
        name: "",
        ikpuName: "",
        unit: "шт",
        quantity: 0,
        unitPrice: 0,
        ikpu: "",
        upc: "",
        catalogProductId: null,
        markings: [],
      },
    ]);
  };

  const handleRemoveItem = (rowId) => {
    setItemPhotos((prev) => {
      const cur = prev?.[rowId];
      if (cur?.url) URL.revokeObjectURL(cur.url);
      if (!cur) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setItems((prev) => prev.filter((it) => it.id !== rowId));
  };

  const handleItemChange = (rowId, patch) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        const next = { ...it, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, "quantity")) {
          const raw = typeof patch.quantity === "number" ? patch.quantity : Number(patch.quantity);
          const q = Number.isFinite(raw) ? raw : 0;
          const clamped = Math.min(MAX_MARKING_SLOTS, Math.max(0, q));
          next.quantity = Math.round(clamped * 1000) / 1000;
          next.markings = canUseMarking ? resizeMarkingsArray(next.markings, next.quantity) : [];
        }
        if (Object.prototype.hasOwnProperty.call(patch, "unitPrice")) {
          const raw = typeof patch.unitPrice === "number" ? patch.unitPrice : Number(patch.unitPrice);
          const p = Number.isFinite(raw) ? roundMoney(raw) : 0;
          next.unitPrice = Math.max(0, p);
        }
        return next;
      })
    );
  };

  const handleMarkingChange = (rowId, index, value) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        const q = Math.min(MAX_MARKING_SLOTS, Math.max(0, Math.floor(Number(it.quantity)) || 0));
        const m = resizeMarkingsArray(it.markings, q);
        m[index] = value;
        return { ...it, markings: m };
      })
    );
    setDuplicateMarkingField((prev) => {
      if (!prev) return prev;
      if (prev.rowId !== rowId || prev.index !== index) return prev;
      if ((value || "").trim() === (prev.code || "").trim()) return prev;
      return null;
    });
  };

  const handleToggleMarkingsPanel = (rowId) => {
    setMarkingsRowsCollapsed((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  const handlePickCatalogProduct = (p) => {
    const rowId = productPickerRowId;
    const field = productPickerField;
    if (!rowId) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        const catalogName = p.name ?? "";
        const next = {
              ...it,
          ikpuName: catalogName,
              unit: (p.unit || "шт").trim() || "шт",
              ikpu: (p.ikpu_code ?? "").trim(),
              upc: (p.upc ?? "").trim(),
              catalogProductId: p.id ?? null,
        };
        if (field === "ourName") {
          return { ...next, name: catalogName };
            }
        return { ...next, name: it.name || "" };
      })
    );
    setProductPickerRowId(null);
    setProductPickerField(null);
  };

  const handleTriggerMarkingFile = (rowId) => {
    if (!canUseMarking) return;
    markingUploadTargetRowRef.current = rowId;
    const el = document.getElementById("warehouse-receipt-marking-file");
    el?.click();
  };

  const handleTriggerPhotoFile = (rowId) => {
    photoUploadTargetRowRef.current = rowId;
    const el = document.getElementById("warehouse-receipt-photo-file");
    el?.click();
  };

  const handleRemovePhoto = (rowId) => {
    setItemPhotos((prev) => {
      const cur = prev?.[rowId];
      if (!cur) return prev;
      if (cur.url) URL.revokeObjectURL(cur.url);
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };

  const applyMarkingCodesFromImport = (rowId, codes) => {
    if (!codes.length) {
      window.alert(
        "Не удалось извлечь коды. Используйте .txt / .csv (один код на строку или первая колонка) или .xlsx (первая колонка первого листа). Файлы .exe не подходят."
      );
      return;
    }
    const n = codes.length;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        return {
          ...it,
          quantity: n,
          markings: canUseMarking ? codes : [],
        };
      })
    );
    setMarkingsRowsCollapsed((prev) => ({ ...prev, [rowId]: false }));
  };

  const handleMarkingFileChange = (e) => {
    const rowId = markingUploadTargetRowRef.current;
    markingUploadTargetRowRef.current = null;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!rowId || !file || !canUseMarking) return;

    const nameLower = file.name.toLowerCase();
    const isXlsx =
      nameLower.endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = () => {
        const run = async () => {
          try {
            const buf = reader.result;
            const codes = await parseMarkingCodesFromXlsxBuffer(buf);
            applyMarkingCodesFromImport(rowId, codes);
          } catch {
            window.alert("Не удалось прочитать Excel (.xlsx). Попробуйте CSV или другой файл.");
          }
        };
        void run();
      };
      reader.onerror = () => {
        window.alert("Не удалось прочитать файл.");
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const codes = parseMarkingCodesFromFileText(text);
      applyMarkingCodesFromImport(rowId, codes);
    };
    reader.onerror = () => {
      window.alert("Не удалось прочитать файл.");
    };
    reader.readAsText(file, "UTF-8");
  };

  const handlePhotoFileChange = (e) => {
    const rowId = photoUploadTargetRowRef.current;
    photoUploadTargetRowRef.current = null;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!rowId || !file) return;

    if (!String(file.type || "").startsWith("image/")) {
      window.alert("Выберите изображение (PNG/JPG/WebP).");
      return;
    }

    setItemPhotos((prev) => {
      const cur = prev?.[rowId];
      if (cur?.url) URL.revokeObjectURL(cur.url);
      return { ...prev, [rowId]: { file, url: URL.createObjectURL(file) } };
    });
  };

  const handleSaveInvoice = async () => {
    setSaveCatalogProductError("");
    setSaveCatalogProductMessage("");
    setSaveSupplierError("");
    setSaveSupplierMessage("");
    setInvoiceSaveError("");
    setInvoiceSaveMessage("");
    setDuplicateMarkingField(null);
    setReceiptSaveLoading(true);
    try {
      if (editInvoiceId && editInvoiceLoading) {
        setInvoiceSaveError("Подождите загрузки документа.");
        return;
      }
      if (editInvoiceId && editInvoiceLoadError) {
        setInvoiceSaveError(editInvoiceLoadError);
        return;
      }

      let addedCount = 0;
      const errs = [];
      const idByRowId = new Map();
      let supplierWasCreated = false;

      if (organizationId) {
        if (supplierSource === "manual" && !suppliersForbidden) {
          const nextName = supplierName.trim();
          const normalizedInn = normalizeInn(supplierInn);
          const hasEnoughSupplierData = !!nextName && !!normalizedInn;

          if (hasEnoughSupplierData) {
            setSaveSupplierLoading(true);
            try {
              const res = await authFetch(`platform/organizations/${organizationId}/suppliers/`, {
                method: "POST",
                body: JSON.stringify({
                  name: nextName,
                  inn: normalizedInn,
                  phone: getPhoneDigits(supplierPhone),
                  address: supplierAddress.trim(),
                }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                if (res.status === 403) {
                  setSuppliersForbidden(true);
                  markForbiddenAppPage?.(organizationId, "suppliers");
                  setSaveSupplierError("Нет прав на создание поставщика.");
                } else {
                  setSaveSupplierError(data.detail ?? data.inn?.[0] ?? "Ошибка сохранения поставщика");
                }
              } else {
                supplierWasCreated = true;
                await loadSuppliers();
                const newId = data?.id;
                if (newId != null) {
                  setSupplierSource("list");
                  setSelectedSupplierId(String(newId));
                  setSupplierName(data.name ?? nextName);
                  setSupplierInn(data.inn ?? normalizedInn);
                  setSupplierPhone(formatPhoneDisplay(data.phone ?? supplierPhone ?? ""));
                  setSupplierAddress(data.address ?? supplierAddress.trim());
                  setSupplierSearchTerm(
                    buildSupplierSearchLabel({
                      id: newId,
                      name: data.name ?? nextName,
                      inn: data.inn ?? normalizedInn,
                    })
                  );
                }
                setSaveSupplierMessage("Поставщик добавлен в справочник при сохранении счёт‑фактуры.");
              }
            } catch (err) {
              setSaveSupplierError(err.message ?? "Ошибка сети");
            } finally {
              setSaveSupplierLoading(false);
            }
          }
        }

        const fetchProductsSnapshot = async () => {
          const res = await authFetch(`platform/organizations/${organizationId}/products/`);
          const data = await res.json().catch(() => []);
          if (!res.ok) return [];
          return Array.isArray(data) ? data : [];
        };

        let productsSnapshot = await fetchProductsSnapshot();

        for (const row of items) {
          const name = (row.ikpuName || row.name || "").trim();
          if (!name || row.catalogProductId != null) continue;

          const ikpuDigits = normalizeIkpuDigits(row.ikpu);
          const existingId = findCatalogProductIdByIkpu(productsSnapshot, ikpuDigits);
          if (existingId != null) {
            idByRowId.set(row.id, existingId);
            continue;
          }

          try {
            const res = await authFetch(`platform/organizations/${organizationId}/products/`, {
              method: "POST",
              body: JSON.stringify({
                name,
                ikpu_code: ikpuDigits,
                ...(canUseUpc ? { upc: (row.upc || "").trim() } : {}),
                unit: (row.unit || "шт").trim() || "шт",
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              if (res.status === 403) {
                markForbiddenAppPage?.(organizationId, "products");
                errs.push("Нет прав на справочник товаров.");
                break;
              }
              const ikpuMsg = Array.isArray(data.ikpu_code) ? data.ikpu_code[0] : data.ikpu_code;
              const detailStr = typeof data.detail === "string" ? data.detail : "";
              const errBlob = `${detailStr} ${typeof ikpuMsg === "string" ? ikpuMsg : ""}`;
              const dupByIkpu =
                ikpuDigits.length === 17 &&
                res.status === 400 &&
                errBlob.includes("уже существует");
              if (dupByIkpu) {
                productsSnapshot = await fetchProductsSnapshot();
                const linked = findCatalogProductIdByIkpu(productsSnapshot, ikpuDigits);
                if (linked != null) {
                  idByRowId.set(row.id, linked);
                  continue;
                }
              }
              errs.push(
                `${name}: ${detailStr || (typeof ikpuMsg === "string" ? ikpuMsg : "") || "ошибка сохранения"}`
              );
              continue;
            }
            if (data?.id != null) {
              idByRowId.set(row.id, data.id);
              productsSnapshot = [
                ...productsSnapshot,
                {
                  id: data.id,
                  name: data.name ?? name,
                  ikpu_code: data.ikpu_code ?? ikpuDigits,
                  upc: data.upc ?? ((row.upc || "").trim()),
                  unit: data.unit,
                },
              ];
              addedCount += 1;
            }
          } catch (err) {
            errs.push(`${name}: ${err.message ?? "ошибка сети"}`);
          }
        }

        if (idByRowId.size > 0) {
          setItems((prev) =>
            prev.map((it) => (idByRowId.has(it.id) ? { ...it, catalogProductId: idByRowId.get(it.id) } : it))
          );
          await loadCatalogProducts();
        }
      }

      if (errs.length) {
        setSaveCatalogProductError(errs.slice(0, 4).join(" ") + (errs.length > 4 ? " …" : ""));
      } else if (addedCount > 0) {
        setSaveCatalogProductMessage(
          addedCount === 1
            ? "Новая позиция добавлена в справочник товаров при сохранении счёт‑фактуры."
            : `${addedCount} новых позиций добавлено в справочник товаров при сохранении счёт‑фактуры.`
        );
      }

      if (!organizationId) {
        setInvoiceSaveError("Выберите организацию, чтобы сохранить счёт‑фактуру.");
        return;
      }

      const linesPayload = items.map((row) => ({
        catalog_product_id: row.catalogProductId ?? null,
        our_name: row.name ?? "",
        ikpu_name: row.ikpuName ?? "",
        ikpu_code: row.ikpu ?? "",
        ...(canUseUpc ? { upc: (row.upc || "").trim() } : {}),
        unit: row.unit ?? "шт",
        quantity: row.quantity ?? 0,
        unit_price: row.unitPrice ?? 0,
        markings: resizeMarkingsArray(row.markings, row.quantity ?? 0).map((m) =>
          typeof m === "string" ? m : ""
        ),
      }));

      const payload = {
        warehouse_id: warehouseId ? Number(warehouseId) : null,
        supplier_id: selectedSupplierId ? Number(selectedSupplierId) : null,
        supplier_name: supplierName ?? "",
        supplier_inn: supplierInn ?? "",
        supplier_phone: getPhoneDigits(supplierPhone),
        supplier_address: supplierAddress ?? "",
        contract_number: contractNumber ?? "",
        contract_date: contractDate || null,
        invoice_number: invoiceNumber ?? "",
        invoice_date: invoiceDate || null,
        vat_mode: vatMode ?? "without",
        manual_total_enabled: manualTotalEnabled === true,
        manual_total_value: manualTotalEnabled ? manualTotalValue : null,
        total_quantity: totalQuantity ?? 0,
        total_without_vat: footerTotals.display.totalWithoutVat ?? 0,
        total_vat: footerTotals.display.totalVat ?? 0,
        total_with_vat: footerTotals.display.totalWithVat ?? 0,
        lines: linesPayload,
      };

      const isEdit = Boolean(editInvoiceId);
      const res = await authFetch(
        isEdit
          ? `platform/organizations/${organizationId}/invoices/${editInvoiceId}/`
          : `platform/organizations/${organizationId}/invoices/`,
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        }
      );
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) {
        const duplicateCode =
          typeof saved?.duplicate_marking_code === "string"
            ? saved.duplicate_marking_code.trim()
            : "";
        let duplicateFieldShown = false;
        if (duplicateCode) {
          const duplicatePosition = findMarkingFieldByCode(items, duplicateCode);
          if (duplicatePosition) {
            duplicateFieldShown = true;
            setMarkingsRowsCollapsed((prev) => ({
              ...prev,
              [duplicatePosition.rowId]: false,
            }));
            setDuplicateMarkingField({
              ...duplicatePosition,
              code: duplicateCode,
              message: saved?.detail ?? "Этот код маркировки уже существует.",
            });
            setTimeout(() => {
              const key = `${duplicatePosition.rowId}-${duplicatePosition.index}`;
              const inputEl = markingInputRefs.current[key];
              if (inputEl && typeof inputEl.focus === "function") {
                inputEl.focus();
                if (typeof inputEl.scrollIntoView === "function") {
                  inputEl.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }
            }, 0);
          }
        }
        setInvoiceSaveError(
          duplicateFieldShown
            ? "Проверьте выделенное поле маркировки."
            : (saved?.detail ?? "Не удалось сохранить счёт‑фактуру.")
        );
        return;
      }

      setInvoiceSaveMessage(
        isEdit
          ? `Изменения сохранены (№ ${saved?.id ?? editInvoiceId ?? "—"}).`
          : `Счёт‑фактура сохранена. ID: ${saved?.id ?? "—"}`
      );
      try {
        const dk = receiptDraftStorageKey(organizationId, warehouseId);
        if (dk) sessionStorage.removeItem(dk);
      } catch {
        /* ignore */
      }
      setShowDraftBanner(false);
    } finally {
      setReceiptSaveLoading(false);
    }
  };

  const listModeDisabled = !organizationId || suppliersForbidden || (!suppliersLoading && suppliers.length === 0);
  const isSupplierFieldsLocked = supplierSource === "list";

  const showSupplierAddressRow =
    supplierSource === "manual" || String(supplierAddress ?? "").trim() !== "";
  const showSupplierPhoneRow =
    supplierSource === "manual" || getPhoneDigits(supplierPhone) !== "";
  const [openHelpKey, setOpenHelpKey] = useState(null);

  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const draftCheckedRef = useRef(false);

  useEffect(() => {
    if (editInvoiceId) return;
    if (!organizationId || !warehouseId) return;
    if (draftCheckedRef.current) return;
    draftCheckedRef.current = true;
    try {
      const key = receiptDraftStorageKey(organizationId, warehouseId);
      if (!key) return;
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.v === RECEIPT_DRAFT_VERSION && parsed?.data) {
        setShowDraftBanner(true);
      }
    } catch {
      /* ignore */
    }
  }, [organizationId, warehouseId, editInvoiceId]);

  useEffect(() => {
    if (editInvoiceId) return;
    if (!organizationId || !warehouseId) return;
    const key = receiptDraftStorageKey(organizationId, warehouseId);
    if (!key) return;
    const timer = setTimeout(() => {
      try {
        const payload = {
          v: RECEIPT_DRAFT_VERSION,
          data: {
            contractNumber,
            contractDate,
            invoiceNumber,
            invoiceDate,
            supplierSource,
            selectedSupplierId,
            supplierSearchTerm,
            supplierName,
            supplierInn,
            supplierPhone,
            supplierAddress,
            items,
            vatMode,
            manualTotalEnabled,
            manualTotalValue,
            markingsRowsCollapsed,
          },
        };
        sessionStorage.setItem(key, JSON.stringify(payload));
      } catch {
        /* quota / private mode */
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [
    organizationId,
    warehouseId,
    contractNumber,
    contractDate,
    invoiceNumber,
    invoiceDate,
    supplierSource,
    selectedSupplierId,
    supplierSearchTerm,
    supplierName,
    supplierInn,
    supplierPhone,
    supplierAddress,
    items,
    vatMode,
    manualTotalEnabled,
    manualTotalValue,
    markingsRowsCollapsed,
    editInvoiceId,
  ]);

  const handleRestoreDraft = useCallback(() => {
    const key = receiptDraftStorageKey(organizationId, warehouseId);
    if (!key) return;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const d = parsed?.data;
      if (!d || typeof d !== "object") return;
      if (typeof d.contractNumber === "string") setContractNumber(d.contractNumber);
      else if (typeof d.receiptNumber === "string") setContractNumber(d.receiptNumber);
      if (typeof d.contractDate === "string") setContractDate(d.contractDate);
      else if (typeof d.receiptDate === "string") setContractDate(d.receiptDate);
      if (typeof d.invoiceNumber === "string") setInvoiceNumber(d.invoiceNumber);
      if (typeof d.invoiceDate === "string") setInvoiceDate(d.invoiceDate);
      if (d.supplierSource === "list" || d.supplierSource === "manual") setSupplierSource(d.supplierSource);
      if (typeof d.selectedSupplierId === "string") setSelectedSupplierId(d.selectedSupplierId);
      if (typeof d.supplierSearchTerm === "string") setSupplierSearchTerm(d.supplierSearchTerm);
      if (typeof d.supplierName === "string") setSupplierName(d.supplierName);
      if (typeof d.supplierInn === "string") setSupplierInn(d.supplierInn);
      if (typeof d.supplierPhone === "string") setSupplierPhone(d.supplierPhone);
      if (typeof d.supplierAddress === "string") setSupplierAddress(d.supplierAddress);
      if (d.vatMode === "with" || d.vatMode === "without") setVatMode(d.vatMode);
      if (typeof d.manualTotalEnabled === "boolean") setManualTotalEnabled(d.manualTotalEnabled);
      if (typeof d.manualTotalValue === "string") setManualTotalValue(d.manualTotalValue);
      if (d.markingsRowsCollapsed && typeof d.markingsRowsCollapsed === "object") {
        setMarkingsRowsCollapsed(d.markingsRowsCollapsed);
      }
      if (Array.isArray(d.items) && d.items.length > 0) {
        setItems(
          d.items.map((it, idx) => ({
            id: typeof it.id === "string" ? it.id : `row-${idx + 1}`,
            name: typeof it.name === "string" ? it.name : "",
            ikpuName: typeof it.ikpuName === "string" ? it.ikpuName : "",
            unit: typeof it.unit === "string" ? it.unit : "шт",
            quantity: typeof it.quantity === "number" && Number.isFinite(it.quantity) ? it.quantity : 0,
            unitPrice: typeof it.unitPrice === "number" && Number.isFinite(it.unitPrice) ? it.unitPrice : 0,
            ikpu: typeof it.ikpu === "string" ? it.ikpu : "",
            upc: typeof it.upc === "string" ? it.upc : "",
            catalogProductId: it.catalogProductId != null ? it.catalogProductId : null,
            markings: Array.isArray(it.markings) ? it.markings.map((m) => (typeof m === "string" ? m : "")) : [],
          }))
        );
      }
      setShowDraftBanner(false);
    } catch {
      /* ignore */
    }
  }, [organizationId, warehouseId]);

  const handleDismissDraft = useCallback(() => {
    const key = receiptDraftStorageKey(organizationId, warehouseId);
    if (key) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    setShowDraftBanner(false);
  }, [organizationId, warehouseId]);

  const hasCatalogOrInvoiceAlerts =
    !!catalogLoadError ||
    !!saveCatalogProductMessage ||
    !!saveCatalogProductError;

  const invoiceSaveLocked =
    receiptSaveLoading ||
    Boolean(editInvoiceId && (editInvoiceLoading || editInvoiceLoadError));

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
          to="/app/invoices"
          className="text-sm font-medium text-muted hover:text-primary transition"
          aria-label="Журнал счёт‑фактур"
        >
          Счёт‑фактуры
        </Link>
      </div>

      <article className="max-w-6xl mx-auto space-y-6 bg-white/95 backdrop-blur-sm border border-border/80 rounded-2xl shadow-soft px-4 py-5 sm:px-6 sm:py-6 text-muted ring-1 ring-black/[0.03]">
        {showDraftBanner ? (
          <div
            className="rounded-lg border border-primary/35 bg-primary/8 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
            role="status"
          >
            <p className="text-sm text-muted">
              Найден черновик этой формы в сессии браузера (до закрытия вкладки).
            </p>
            <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
                onClick={handleRestoreDraft}
                className="rounded-lg px-3 py-2 text-sm font-semibold bg-primary text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
                Восстановить
          </button>
          <button
            type="button"
                onClick={handleDismissDraft}
                className="rounded-lg px-3 py-2 text-sm font-medium border border-border bg-white text-muted hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-primary/25"
          >
                Удалить черновик
          </button>
        </div>
      </div>
        ) : null}
        {editInvoiceId && editInvoiceLoading ? (
          <p className="text-sm text-muted/80 border border-border/70 rounded-lg px-4 py-2.5 bg-secondary/50" role="status">
            Загрузка документа для редактирования…
          </p>
        ) : null}
        {editInvoiceId && editInvoiceLoadError ? (
          <div
            className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 space-y-2"
            role="alert"
          >
            <p>{editInvoiceLoadError}</p>
            <Link
              to={`/app/invoices/${editInvoiceId}`}
              className="inline-block font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
            >
              Открыть карточку документа
            </Link>
          </div>
        ) : null}
        <input
          id="warehouse-receipt-marking-file"
          type="file"
          accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleMarkingFileChange}
        />
        <input
          id="warehouse-receipt-photo-file"
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handlePhotoFileChange}
        />
        <header className="flex flex-wrap gap-4 justify-between items-start border-b border-border/70 pb-4">
          <div className="flex-1 flex flex-col min-w-0 sm:items-start">
            <p className="text-[11px] text-muted/80 leading-relaxed tracking-wide">
              Электронный документ · счёт‑фактура
              {editInvoiceId ? " · редактирование" : ""}
            </p>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-2 text-muted">
              {editInvoiceId
                ? editInvoiceLoading
                  ? "Загрузка документа…"
                  : `Редактирование · внутр. № ${editInvoiceId}`
                : "Счёт‑фактура"}
            </h1>
          </div>
        </header>

        {!organizationId ? (
          <p
            className="text-sm text-amber-900/90 bg-amber-50/70 border border-amber-200/60 rounded-lg px-4 py-2.5"
            role="status"
          >
            Выберите организацию в контексте, чтобы пользоваться справочником поставщиков.
          </p>
        ) : null}

        {suppliersLoadError ? (
          <p
            className="text-sm text-amber-900/90 bg-amber-50/70 border border-amber-200/60 rounded-lg px-4 py-2.5"
            role="status"
          >
            {suppliersLoadError}
          </p>
        ) : null}

        <div className="rounded-xl border border-border/80 bg-white overflow-hidden">
        <section aria-labelledby="receipt-supplier-section-title">
          <div className="border-b border-border/70 bg-neutral-50/90 px-3 py-2.5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <h2
                  id="receipt-supplier-section-title"
                  className={`${SECTION_HEADING} shrink-0`}
                >
                  От кого приходит товар
                </h2>
                <HelpTooltip
                  open={openHelpKey === "supplier"}
                  tooltipId="help-supplier"
                  buttonLabel="Подсказка: от кого приходит товар"
                  text="Выберите поставщика из справочника или введите вручную. Если поставщик новый — он сохранится в справочник при сохранении счёт‑фактуры."
                  onOpen={() => setOpenHelpKey("supplier")}
                  onClose={() => setOpenHelpKey((v) => (v === "supplier" ? null : v))}
                />
              </div>
              <p className="text-[11px] text-muted/80 sm:text-right min-w-0 leading-snug">
                <span className="font-medium text-muted">Склад:</span>{" "}
                <span className="text-muted">{warehouseName}</span>
                {warehouseAddress ? (
                  <span className="text-muted/70"> — {warehouseAddress}</span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="bg-white">
        <fieldset className="m-0 border-0 border-b border-border/60 px-3 py-2.5">
          <legend className="sr-only">Режим выбора поставщика</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5" role="radiogroup" aria-label="Режим поставщика">
            <label className="inline-flex items-center gap-2 cursor-pointer text-[13px] text-muted">
              <input
                type="radio"
                name="receipt-supplier-source"
                checked={supplierSource === "list"}
                onChange={() => handleSupplierSourceChange("list")}
                disabled={listModeDisabled}
                className="rounded-full border-border text-primary focus:ring-primary"
                aria-label="Найти поставщика в справочнике по поиску"
              />
              Из справочника (поиск)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-[13px] text-muted">
              <input
                type="radio"
                name="receipt-supplier-source"
                checked={supplierSource === "manual"}
                onChange={() => handleSupplierSourceChange("manual")}
                className="rounded-full border-border text-primary focus:ring-primary"
                aria-label="Новый поставщик, ввести вручную"
              />
              Новый (ввести вручную)
            </label>
          </div>
        </fieldset>

        {supplierSource === "list" ? (
          <div className="relative border-b border-neutral-200 px-3 py-2.5" ref={supplierPickerRef}>
            <label htmlFor="receipt-supplier-search" className="block text-[11px] font-medium text-muted/80 mb-1">
              Поиск в справочнике
            </label>
            <div className="flex flex-wrap gap-2 items-stretch">
              <input
                id="receipt-supplier-search"
                type="search"
                autoComplete="off"
                value={supplierSearchTerm}
                onChange={handleSupplierSearchChange}
                onFocus={() => setSupplierListOpen(true)}
                onKeyDown={handleSupplierSearchKeyDown}
                disabled={listModeDisabled || suppliersLoading}
                className={`${INPUT_CLASS} flex-1 min-w-[200px]`}
                placeholder="Название компании или ИНН…"
                title="Также можно искать по телефону или адресу. Выберите строку в списке."
                role="combobox"
                aria-expanded={supplierListOpen}
                aria-controls="receipt-supplier-results"
                aria-autocomplete="list"
                aria-label="Поиск поставщика по названию компании или ИНН"
              />
              {selectedSupplierId ? (
                <button
                  type="button"
                  onClick={handleClearSupplierSelection}
                  disabled={listModeDisabled || suppliersLoading}
                  className="shrink-0 px-3 py-2 border border-border bg-white text-muted text-xs font-medium hover:bg-secondary/70 hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary transition disabled:opacity-50"
                  aria-label="Сбросить выбранного поставщика"
                >
                  Сбросить
                </button>
              ) : null}
            </div>
            <p className="text-[11px] text-muted/70 mt-1.5">
              По названию или ИНН; выберите строку в списке.
            </p>
            {supplierListOpen && !listModeDisabled && !suppliersLoading ? (
              <ul
                id="receipt-supplier-results"
                role="listbox"
                className="absolute z-30 left-0 right-0 mt-1.5 max-h-60 overflow-auto rounded-xl border border-neutral-200/90 bg-white shadow-lg shadow-neutral-900/10 ring-1 ring-black/[0.04]"
              >
                {filteredSuppliers.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-muted" role="presentation">
                    {supplierSearchTerm.trim() ? "Ничего не найдено" : "Нет поставщиков для отображения"}
                  </li>
                ) : (
                  filteredSuppliers.map((s) => {
                    const phoneLine = getPhoneDigits(s.phone) ? formatPhoneDisplay(s.phone) : "";
                    return (
                      <li key={s.id} role="none">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedSupplierId === String(s.id)}
                          className="w-full text-left px-4 py-2 text-sm text-muted hover:bg-secondary/80 focus:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary transition"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => handlePickSupplierFromSearch(s)}
                        >
                          <span className="font-medium text-muted">{s.name ?? `Поставщик #${s.id}`}</span>
                          <span className="block text-xs text-muted mt-0.5">
                            {[s.inn ? `ИНН ${s.inn}` : null, phoneLine || null].filter(Boolean).join(" · ") ||
                              "—"}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            ) : null}
            {listModeDisabled && organizationId && !suppliersLoading && !suppliersForbidden ? (
              <p className="text-xs text-muted mt-2">В справочнике пока нет поставщиков — выберите «Новый» или добавьте в разделе «Поставщики».</p>
            ) : null}
          </div>
        ) : null}

          <div>
            <div className={DOC_ROW_GRID}>
              <label htmlFor="receipt-supplier-name" className={DOC_LABEL_CELL}>
                Наименование
              </label>
              <div className={DOC_INPUT_CELL}>
                    <input
                      id="receipt-supplier-name"
                      type="text"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      disabled={isSupplierFieldsLocked}
                      className={DOC_INPUT}
                      placeholder="—"
                      aria-label="Название поставщика"
                    />
              </div>
            </div>
            <div className={DOC_ROW_GRID}>
              <label htmlFor="receipt-supplier-inn" className={DOC_LABEL_CELL}>
                ИНН
              </label>
              <div className={DOC_INPUT_CELL}>
                    <input
                      id="receipt-supplier-inn"
                      type="text"
                      inputMode="numeric"
                      value={supplierInn}
                      onChange={(e) => setSupplierInn(e.target.value)}
                      onBlur={handleSupplierInnBlur}
                      disabled={isSupplierFieldsLocked}
                      className={DOC_INPUT}
                      placeholder="—"
                      aria-label="ИНН поставщика"
                    />
              </div>
            </div>
            {showSupplierAddressRow ? (
              <div className={DOC_ROW_GRID}>
                <label htmlFor="receipt-supplier-address" className={DOC_LABEL_CELL}>
                  Адрес
                </label>
                <div className={DOC_INPUT_CELL}>
                <input
                  id="receipt-supplier-address"
                  type="text"
                  value={supplierAddress}
                  onChange={(e) => setSupplierAddress(e.target.value)}
                  disabled={isSupplierFieldsLocked}
                  className={DOC_INPUT}
                  placeholder="—"
                  aria-label="Адрес поставщика"
                />
                </div>
              </div>
            ) : null}
            {showSupplierPhoneRow ? (
              <div className={DOC_ROW_GRID}>
                <label htmlFor="receipt-supplier-phone" className={DOC_LABEL_CELL}>
                  Телефон
                </label>
                <div className={DOC_INPUT_CELL}>
                    <input
                      id="receipt-supplier-phone"
                      type="tel"
                      inputMode="numeric"
                      value={supplierPhone}
                      onChange={(e) => setSupplierPhone(formatPhoneDisplay(e.target.value))}
                      disabled={isSupplierFieldsLocked}
                      className={DOC_INPUT}
                      placeholder={PHONE_PLACEHOLDER}
                      aria-label="Телефон поставщика"
                    />
                </div>
              </div>
            ) : null}
            <div className="px-3 py-2.5">
            {supplierSource === "manual" ? (
                <p className="text-[11px] text-muted/65">ИНН уникален в организации.</p>
            ) : null}
            {isSupplierFieldsLocked ? (
                <p className="text-[11px] text-muted/65 mt-1" role="status">
                Данные из справочника. Изменить — режим «Новый» или раздел «Поставщики».
              </p>
            ) : null}
            </div>
            {supplierSource === "manual" && organizationId && !suppliersForbidden ? (
              <div className="border-t border-neutral-200 px-3 py-2.5">
                <p className="text-[11px] text-muted/65">
                  Поставщик сохранится в справочник автоматически при сохранении счёт‑фактуры.
                </p>
              </div>
            ) : null}
          </div>
          </div>
        </section>

        <div className="border-t border-border/70">
          <h2 className={`px-3 py-2.5 ${SECTION_HEADING} bg-neutral-50/90 border-b border-border/60`}>
            Договор и счёт
            </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 border-b border-neutral-200/90 md:divide-x md:divide-neutral-200/90">
            <div className={`${DOC_ROW_GRID_COMPACT} min-w-0`}>
              <label htmlFor="contract-number" className={DOC_LABEL_CELL}>
                Номер договора
              </label>
              <div className={`${DOC_INPUT_CELL} min-w-0`}>
                <input
                  id="contract-number"
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
              <label htmlFor="contract-date" className={DOC_LABEL_CELL}>
                Дата договора
              </label>
              <div className={`${DOC_INPUT_CELL} min-w-0`}>
                <input
                  id="contract-date"
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
              <label htmlFor="invoice-number" className={DOC_LABEL_CELL}>
                Номер счёта
              </label>
              <div className={`${DOC_INPUT_CELL} min-w-0`}>
                <input
                  id="invoice-number"
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
              <label htmlFor="invoice-date" className={DOC_LABEL_CELL}>
                Дата счёта
              </label>
              <div className={`${DOC_INPUT_CELL} min-w-0`}>
                <input
                  id="invoice-date"
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
        </div>

        <div className="rounded-xl border border-border/80 bg-white overflow-hidden">
          <div className="border-b border-border/70 bg-neutral-50/90 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className={`${SECTION_HEADING} shrink-0`}>Товарная часть</h2>
                  <HelpTooltip
                    open={openHelpKey === "items"}
                    tooltipId="help-items"
                    buttonLabel="Подсказка: товарная часть"
                    text="Добавляйте позиции. Для документа используйте «Наименование по ИКПУ» и/или ИКПУ; подсказки из справочника появятся при вводе. Фото — опционально."
                    onOpen={() => setOpenHelpKey("items")}
                    onClose={() => setOpenHelpKey((v) => (v === "items" ? null : v))}
                  />
                </div>
              <button
                type="button"
                onClick={handleAddItem}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/15 border border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/35 focus:ring-offset-1 transition"
                aria-label="Добавить ещё одну позицию товара"
              >
                <span aria-hidden="true">+</span>
                Позиция
              </button>
            </div>
            <div
                className="inline-flex rounded-lg border border-border/80 bg-secondary/90 p-0.5 shadow-inner"
              role="group"
                aria-label="Учёт НДС в счёт‑фактуре"
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
          <div className="px-3 py-3 space-y-2.5 border-b border-border/60">
          {vatMode === "with" ? (
              <p className="text-sm text-muted/75 leading-relaxed m-0">
              Цена и сумма по строке — <span className="font-medium text-muted/80">без НДС</span>. Ставка{" "}
              {DEFAULT_VAT_RATE_PERCENT}% (позже — из настроек организации).
            </p>
          ) : (
              <p className="text-sm text-muted/75 leading-relaxed m-0">Суммы по строкам без налога на добавленную стоимость.</p>
          )}
          {canUseMarking ? (
              <p className="text-sm text-muted/75 leading-relaxed m-0 border-t border-border/50 pt-2.5">
              <span className="font-medium text-muted/75">Маркировка:</span> одна позиция наименования (например, 10 холодильников) — под строкой
              укажите <span className="font-medium text-muted/80">отдельный код на каждую единицу</span> (серийный номер, КИЗ, Data Matrix и т.д.).
            </p>
          ) : null}
        </div>
          <div className="px-3 py-2.5 text-sm text-muted/75 leading-relaxed bg-secondary/25 border-b border-border/50">
            <p className="m-0">
              Каждая строка — отдельная позиция. В полях «Наше наименование», «Наименование по ИКПУ» и «ИКПУ» при вводе показываются подсказки из справочника (по названию в двух первых полях и по коду в ИКПУ); выбор строки подставляет данные, иначе значения остаются как ввели. При сохранении счёт‑фактуры новые позиции с наименованием (ещё не из справочника) автоматически добавляются в справочник товаров. Маркировка (если доступна по тарифу) — ниже по строке.
            </p>
          </div>
        </div>

        {hasCatalogOrInvoiceAlerts ? (
          <div className="space-y-3">
        {catalogLoadError ? (
              <p className="text-sm text-amber-900/90 bg-amber-50/70 border border-amber-200/60 rounded-lg px-4 py-2.5" role="status">
            {catalogLoadError}
          </p>
        ) : null}
        {saveCatalogProductMessage ? (
              <p className="text-sm text-green-800 bg-green-50/80 border border-green-200/70 rounded-lg px-4 py-2.5" role="status">
            {saveCatalogProductMessage}
          </p>
        ) : null}
        {saveCatalogProductError ? (
              <p className="text-sm text-red-800 bg-red-50/80 border border-red-200/70 rounded-lg px-4 py-2.5" role="alert">
            {saveCatalogProductError}
          </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          {items.map((row, index) => {
            const calc = lineCalculations[index] ?? {
              amountWithoutVat: 0,
              vatAmount: 0,
              amountWithVat: 0,
            };
            const qtyInt = Math.min(MAX_MARKING_SLOTS, Math.max(0, Math.floor(Number(row.quantity)) || 0));
            const markings = resizeMarkingsArray(row.markings, qtyInt);
            const filledMark = countFilledMarkings(markings);
            const markingsCollapsed = markingsRowsCollapsed[row.id] === true;
            return (
              <div
                key={row.id}
                className="rounded-xl border border-border/80 bg-white shadow-soft overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-border/60 bg-neutral-50/60">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span
                      className="flex h-9 min-w-[2.25rem] items-center justify-center rounded border border-border bg-white text-sm font-semibold tabular-nums text-muted shrink-0"
                    aria-label={`Позиция ${index + 1}`}
                  >
                    {index + 1}
                  </span>
                    {itemPhotos?.[row.id]?.url ? (
                      <button
                        type="button"
                        onClick={() => handleTriggerPhotoFile(row.id)}
                        className="h-9 w-9 rounded border border-border bg-white hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                        aria-label="Заменить фото товара"
                        title="Заменить фото"
                      >
                        <img
                          src={itemPhotos[row.id].url}
                          alt=""
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleTriggerPhotoFile(row.id)}
                        className="h-9 px-3 border border-border bg-white text-xs font-medium text-muted hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                        aria-label="Добавить фото товара"
                        title="Добавить фото"
                      >
                        Фото
                      </button>
                    )}
                    {itemPhotos?.[row.id]?.url ? (
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(row.id)}
                        className="h-9 px-3 border border-red-300/80 bg-white text-xs font-medium text-red-700 hover:bg-red-50/80 focus:outline-none focus:ring-2 focus:ring-red-200 transition"
                        aria-label="Удалить фото товара"
                        title="Удалить фото"
                      >
                        Убрать
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(row.id)}
                    disabled={items.length <= 1}
                    className="shrink-0 px-3 py-2 text-sm font-medium text-red-700 border border-red-300/80 bg-white hover:bg-red-50/80 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-40 disabled:pointer-events-none transition"
                    aria-label="Удалить позицию товара"
                  >
                    Удалить
                  </button>
                </div>

                <div className="border-b border-border/60 bg-white">
                  <div
                    className="relative"
                    ref={organizationId && productPickerRowId === row.id ? catalogPickerRef : undefined}
                  >
                    <div className={`${DOC_ROW_GRID} min-w-0`}>
                      <label htmlFor={`item-name-${row.id}`} className={DOC_LABEL_CELL}>
                        <span className="block">Наше наименование</span>
                        {organizationId ? (
                          <span className="block font-normal text-muted/60 mt-0.5">поиск по названию в справочнике</span>
                        ) : null}
                      </label>
                      <div className={`${DOC_INPUT_CELL} min-w-0`}>
                      <input
                          id={`item-name-${row.id}`}
                        type="text"
                          autoComplete="off"
                          value={row.name}
                        onChange={(e) =>
                            handleItemChange(row.id, { name: e.target.value, catalogProductId: null })
                          }
                          onFocus={() => {
                            if (!organizationId) return;
                            setProductPickerRowId(row.id);
                            setProductPickerField("ourName");
                          }}
                          className={DOC_INPUT}
                          placeholder="Например: Холодильник ABC-100"
                          role={organizationId ? "combobox" : undefined}
                          aria-expanded={
                            !!organizationId &&
                            productPickerRowId === row.id &&
                            productPickerField === "ourName"
                          }
                          aria-controls={organizationId ? `catalog-list-${row.id}` : undefined}
                          aria-autocomplete={organizationId ? "list" : undefined}
                          aria-label="Наше наименование; при вводе — подсказки из справочника по названию"
                      />
                    </div>
                    </div>
                    <div className={`${DOC_ROW_GRID} min-w-0`}>
                      <label htmlFor={`item-ikpu-name-${row.id}`} className={DOC_LABEL_CELL}>
                        <span className="block">Наименование по ИКПУ</span>
                        {organizationId ? (
                          <span className="block font-normal text-muted/60 mt-0.5">поиск по названию в справочнике</span>
                        ) : null}
                      </label>
                      <div className={`${DOC_INPUT_CELL} min-w-0`}>
                        <input
                          id={`item-ikpu-name-${row.id}`}
                          type="text"
                          autoComplete="off"
                          value={row.ikpuName ?? ""}
                          onChange={(e) =>
                            handleItemChange(row.id, { ikpuName: e.target.value, catalogProductId: null })
                          }
                          onFocus={() => {
                            if (!organizationId) return;
                            setProductPickerRowId(row.id);
                            setProductPickerField("ikpuName");
                          }}
                          className={DOC_INPUT}
                          placeholder="По справочнику или вручную"
                          role={organizationId ? "combobox" : undefined}
                          aria-expanded={
                            !!organizationId &&
                            productPickerRowId === row.id &&
                            productPickerField === "ikpuName"
                          }
                          aria-controls={organizationId ? `catalog-list-${row.id}` : undefined}
                          aria-autocomplete={organizationId ? "list" : undefined}
                          aria-label="Наименование по ИКПУ; при вводе — подсказки из справочника по названию"
                        />
                    </div>
                    </div>
                    <div className={`${DOC_ROW_GRID} min-w-0`}>
                      <label
                        htmlFor={`item-ikpu-${row.id}`}
                        className={`${DOC_LABEL_CELL} flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-2`}
                      >
                        <span className="min-w-0">
                          <span className="block">ИКПУ</span>
                          {organizationId ? (
                            <span className="block font-normal text-muted/60 mt-0.5">поиск по коду в справочнике</span>
                          ) : null}
                        </span>
                        <HelpTooltip
                          open={openHelpKey === `ikpu-${row.id}`}
                          tooltipId={`help-ikpu-${row.id}`}
                          buttonLabel="Подсказка: ИКПУ"
                          text="ИКПУ — уникальный код товара (17 цифр). Можно оставить пустым, если кода нет. При вводе цифр появятся подсказки из справочника."
                          onOpen={() => setOpenHelpKey(`ikpu-${row.id}`)}
                          onClose={() =>
                            setOpenHelpKey((v) => (v === `ikpu-${row.id}` ? null : v))
                          }
                        />
                        </label>
                      <div className={`${DOC_INPUT_CELL} min-w-0`}>
                        <input
                          id={`item-ikpu-${row.id}`}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={row.ikpu ?? ""}
                          onChange={(e) =>
                            handleItemChange(row.id, { ikpu: e.target.value, catalogProductId: null })
                          }
                          onFocus={() => {
                            if (!organizationId) return;
                            setProductPickerRowId(row.id);
                            setProductPickerField("ikpu");
                          }}
                          className={`${DOC_INPUT} font-mono text-[13px]`}
                          placeholder="17 цифр или пусто"
                          role={organizationId ? "combobox" : undefined}
                          aria-expanded={
                            !!organizationId &&
                            productPickerRowId === row.id &&
                            productPickerField === "ikpu"
                          }
                          aria-controls={organizationId ? `catalog-list-${row.id}` : undefined}
                          aria-autocomplete={organizationId ? "list" : undefined}
                          aria-label="ИКПУ товара; при вводе цифр — подсказки из справочника по ИКПУ"
                        />
                      </div>
                    </div>
                    {canUseUpc ? (
                      <div className={`${DOC_ROW_GRID} min-w-0`}>
                        <label
                          htmlFor={`item-upc-${row.id}`}
                          className={`${DOC_LABEL_CELL} flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-2`}
                        >
                          <span className="min-w-0">
                            <span className="block">UPC</span>
                            {organizationId ? (
                              <span className="block font-normal text-muted/60 mt-0.5">код товара (если есть)</span>
                            ) : null}
                          </span>
                        </label>
                        <div className={`${DOC_INPUT_CELL} min-w-0`}>
                          <input
                            id={`item-upc-${row.id}`}
                            type="text"
                            autoComplete="off"
                            value={row.upc ?? ""}
                            onChange={(e) =>
                              handleItemChange(row.id, { upc: e.target.value, catalogProductId: null })
                            }
                            className={`${DOC_INPUT} font-mono text-[13px]`}
                            placeholder="Например: 012345678905"
                            aria-label="UPC товара"
                          />
                        </div>
                      </div>
                    ) : null}

                    {organizationId &&
                    productPickerRowId === row.id &&
                    productPickerField ? (
                        <ul
                          id={`catalog-list-${row.id}`}
                          role="listbox"
                        className="absolute z-20 left-0 right-0 top-full max-h-52 overflow-auto border border-neutral-200/90 bg-white shadow-md shadow-neutral-900/10"
                        >
                          {catalogLoading ? (
                            <li className="px-3 py-2 text-sm text-muted" role="presentation">
                            Загрузка…
                          </li>
                        ) : productPickerField === "ourName" && !(row.name || "").trim() ? (
                          <li className="px-3 py-2 text-sm text-muted" role="presentation">
                            Введите часть названия — покажем совпадения из справочника.
                          </li>
                        ) : productPickerField === "ikpuName" && !(row.ikpuName || "").trim() ? (
                          <li className="px-3 py-2 text-sm text-muted" role="presentation">
                            Введите часть названия — покажем совпадения из справочника.
                          </li>
                        ) : productPickerField === "ikpu" && !(row.ikpu || "").replace(/\D/g, "") ? (
                          <li className="px-3 py-2 text-sm text-muted" role="presentation">
                            Введите цифры ИКПУ — покажем совпадения из справочника.
                          </li>
                        ) : catalogPickerFilteredList.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-muted" role="presentation">
                            Нет совпадений. Можно оставить вручную — при сохранении счёт‑фактуры позиция попадёт в справочник.
                            </li>
                          ) : (
                          catalogPickerFilteredList.map((p) => (
                              <li key={p.id} role="none">
                                <button
                                  type="button"
                                  role="option"
                                className="w-full text-left px-3 py-2 text-sm text-muted hover:bg-stone-50 focus:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary border-b border-neutral-100 last:border-b-0"
                                  onMouseDown={(ev) => ev.preventDefault()}
                                  onClick={() => handlePickCatalogProduct(p)}
                                >
                                  <span className="font-medium">{buildCatalogProductLabel(p)}</span>
                                  <span className="block text-xs text-muted/75 mt-0.5">
                                    Ед. изм.: {(p.unit || "шт").trim() || "шт"}
                                  </span>
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                    ) : null}
                  </div>
                </div>

                <div className="p-3 sm:p-4">
                  {vatMode === "without" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      <div>
                        <label htmlFor={`item-unit-${row.id}`} className={ITEM_FIELD_LABEL}>
                          Ед. изм.
                        </label>
                        <input
                          id={`item-unit-${row.id}`}
                          type="text"
                          value={row.unit ?? "шт"}
                          onChange={(e) => handleItemChange(row.id, { unit: e.target.value })}
                          className={`${ITEM_FIELD_INPUT} text-center`}
                          aria-label="Единица измерения"
                        />
                      </div>
                      <div>
                        <label htmlFor={`item-qty-${row.id}`} className={ITEM_FIELD_LABEL}>
                          Кол-во
                        </label>
                        <QuantityField
                          id={`item-qty-${row.id}`}
                          value={row.quantity}
                          onCommit={(n) => handleItemChange(row.id, { quantity: n })}
                          className={`${ITEM_FIELD_INPUT} text-right font-mono`}
                          ariaLabel={
                            canUseMarking
                              ? "Количество единиц (для маркировки — по одному коду на каждую)"
                              : "Количество единиц"
                          }
                        />
                      </div>
                      <div>
                        <label htmlFor={`item-price-${row.id}`} className={ITEM_FIELD_LABEL}>
                          Цена за ед.
                        </label>
                        <MoneyField
                          id={`item-price-${row.id}`}
                          value={row.unitPrice ?? 0}
                          onCommit={(n) => handleItemChange(row.id, { unitPrice: n })}
                          className={`${ITEM_FIELD_INPUT} text-right font-mono`}
                          ariaLabel="Цена за единицу"
                        />
                      </div>
                      <div>
                        <span className={ITEM_FIELD_LABEL}>Сумма</span>
                        <div
                          className={ITEM_SUM_BOX}
                          aria-label={`Сумма по позиции ${index + 1}`}
                        >
                          {moneyFmt.format(calc.amountWithoutVat)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        <div>
                          <label htmlFor={`item-unit-${row.id}`} className={ITEM_FIELD_LABEL}>
                            Ед. изм.
                          </label>
                          <input
                            id={`item-unit-${row.id}`}
                            type="text"
                            value={row.unit ?? "шт"}
                            onChange={(e) => handleItemChange(row.id, { unit: e.target.value })}
                            className={`${ITEM_FIELD_INPUT} text-center`}
                            aria-label="Единица измерения"
                          />
                        </div>
                        <div>
                          <label htmlFor={`item-qty-${row.id}`} className={ITEM_FIELD_LABEL}>
                            Кол-во
                          </label>
                          <QuantityField
                            id={`item-qty-${row.id}`}
                            value={row.quantity}
                            onCommit={(n) => handleItemChange(row.id, { quantity: n })}
                            className={`${ITEM_FIELD_INPUT} text-right font-mono`}
                            ariaLabel={
                              canUseMarking
                                ? "Количество единиц (для маркировки — по одному коду на каждую)"
                                : "Количество единиц"
                            }
                          />
                        </div>
                        <div>
                          <label htmlFor={`item-price-${row.id}`} className={ITEM_FIELD_LABEL}>
                            Цена без НДС
                          </label>
                          <MoneyField
                            id={`item-price-${row.id}`}
                            value={row.unitPrice ?? 0}
                            onCommit={(n) => handleItemChange(row.id, { unitPrice: n })}
                            className={`${ITEM_FIELD_INPUT} text-right font-mono`}
                            ariaLabel="Цена без НДС за единицу"
                          />
                        </div>
                        <div>
                          <span className={ITEM_FIELD_LABEL}>Сумма без НДС</span>
                          <div
                            className={ITEM_SUM_BOX}
                            aria-label={`Сумма без НДС по позиции ${index + 1}`}
                          >
                            {moneyFmt.format(calc.amountWithoutVat)}
                          </div>
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
                          <div
                            className={ITEM_SUM_BOX}
                            aria-label={`Сумма НДС по позиции ${index + 1}`}
                          >
                            {moneyFmt.format(calc.vatAmount)}
                          </div>
                        </div>
                        <div>
                          <span className={ITEM_FIELD_LABEL}>Всего с НДС</span>
                          <div
                            className={ITEM_SUM_BOX_ACCENT}
                            aria-label={`Всего с НДС по позиции ${index + 1}`}
                          >
                            {moneyFmt.format(calc.amountWithVat)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {canUseMarking ? (
                    <div className="mt-3 pt-3 border-t border-border/60 bg-secondary/30 -mx-3 sm:-mx-4 px-3 sm:px-4 pb-2 rounded-b-xl">
                      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => handleToggleMarkingsPanel(row.id)}
                          className="flex flex-wrap items-center gap-2 flex-1 min-w-0 text-left rounded-lg px-2 py-2.5 hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          aria-expanded={!markingsCollapsed}
                          aria-controls={`markings-panel-${row.id}`}
                        >
                          <span className="text-muted/60 text-sm w-4 shrink-0" aria-hidden="true">
                            {markingsCollapsed ? "▶" : "▼"}
                          </span>
                          <span className="text-sm font-semibold text-muted">Маркировка по единицам</span>
                          {qtyInt > 0 ? (
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full tabular-nums font-semibold ${
                                filledMark === qtyInt
                                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80"
                                  : "bg-amber-50/90 text-amber-900/90 ring-1 ring-amber-200/70"
                              }`}
                            >
                              заполнено {filledMark} / {qtyInt}
                            </span>
                          ) : (
                            <span className="text-sm text-muted/70">укажите количество</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTriggerMarkingFile(row.id)}
                          className="shrink-0 px-3.5 py-2.5 rounded-lg text-sm font-semibold border border-neutral-300/90 bg-white text-muted hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                          aria-label="Загрузить коды маркировки из текстового файла или CSV"
                        >
                          Загрузить из файла
                        </button>
                      </div>
                      <p className="text-xs text-muted/65 mb-2 pl-1">
                        Формат: .txt, .csv или .xlsx — первая колонка (или одна строка = один код). Файлы .exe не читаются.
                      </p>
                      {!markingsCollapsed ? (
                        <div
                          id={`markings-panel-${row.id}`}
                          className="mt-2 pl-6 space-y-2.5"
                          role="region"
                          aria-label={`Маркировки для позиции ${index + 1}`}
                        >
                          {qtyInt === 0 ? (
                            <p className="text-sm text-muted/70">Задайте количество выше — появятся поля для кодов.</p>
                          ) : (
                            <>
                              <p className="text-sm text-muted/75 leading-relaxed">
                                У каждой единицы свой код (не дублируйте). До {MAX_MARKING_SLOTS} единиц в одной позиции.
                              </p>
                              <div
                                className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 ${
                                  qtyInt > 18 ? "max-h-64 overflow-y-auto pr-1 -mr-1" : ""
                                }`}
                              >
                                {markings.map((code, mi) => (
                                  <label key={`${row.id}-m-${mi}`} className="flex flex-col gap-1 min-w-0">
                                    <span className="text-xs font-semibold text-muted/70 uppercase tracking-wide">
                                      Ед. {mi + 1} из {qtyInt}
                                    </span>
                                    {(() => {
                                      const isDuplicateMarking =
                                        duplicateMarkingField?.rowId === row.id &&
                                        duplicateMarkingField?.index === mi;
                                      return (
                                    <input
                                          ref={(el) => {
                                            const key = `${row.id}-${mi}`;
                                            if (el) markingInputRefs.current[key] = el;
                                            else delete markingInputRefs.current[key];
                                          }}
                                      type="text"
                                      value={code}
                                      onChange={(e) => handleMarkingChange(row.id, mi, e.target.value)}
                                          className={`${MARKING_INPUT_CLASS} ${
                                            isDuplicateMarking
                                              ? "border-red-500 bg-red-50/60 focus:ring-red-200"
                                              : ""
                                          }`}
                                      placeholder="Код маркировки"
                                      autoComplete="off"
                                          aria-invalid={isDuplicateMarking}
                                          aria-describedby={
                                            isDuplicateMarking
                                              ? `marking-duplicate-error-${row.id}-${mi}`
                                              : undefined
                                          }
                                      aria-label={`Маркировка единицы ${mi + 1} из ${qtyInt} для позиции ${index + 1}`}
                                    />
                                      );
                                    })()}
                                    {duplicateMarkingField?.rowId === row.id &&
                                    duplicateMarkingField?.index === mi ? (
                                      <p
                                        id={`marking-duplicate-error-${row.id}-${mi}`}
                                        className="text-xs text-red-700"
                                        role="alert"
                                      >
                                        {duplicateMarkingField?.message || "Этот код уже существует в базе."}
                                      </p>
                                    ) : null}
                                  </label>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      ) : qtyInt > 0 ? (
                        <p className="text-sm text-muted/65 mt-1 pl-6 tabular-nums">
                          Кодов заполнено: {filledMark} из {qtyInt}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-border/80 bg-secondary/50 px-4 py-3 sm:px-5 shadow-inner ring-1 ring-border/30 space-y-3">
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
                <label htmlFor="manual-grand-total" className="sr-only">
                  Сумма итого документа
                </label>
                <input
                  id="manual-grand-total"
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
            onClick={handleAddItem}
            className="rounded-lg px-4 py-2.5 text-sm font-medium border border-border bg-white text-muted shadow-sm hover:border-primary/35 hover:bg-stone-50/80 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 transition"
            aria-label="Добавить позицию в счёт‑фактуру"
          >
            + Позиция
          </button>
          <button
            type="button"
            onClick={() => void handleSaveInvoice()}
            disabled={invoiceSaveLocked}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold bg-primary text-white shadow-sm hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 transition disabled:opacity-60 disabled:pointer-events-none"
            aria-label={editInvoiceId ? "Сохранить изменения счёт‑фактуры" : "Сохранить счёт‑фактуру"}
            aria-busy={receiptSaveLoading}
          >
            {receiptSaveLoading
              ? "Сохранение…"
              : editInvoiceId
                ? "Сохранить изменения"
                : "Сохранить"}
          </button>
        </div>
        {(invoiceSaveMessage || invoiceSaveError) ? (
          <div className="flex justify-end">
            {invoiceSaveMessage ? (
              <p
                className="max-w-xl rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-2.5 text-sm text-emerald-800 shadow-sm"
                role="status"
              >
                {invoiceSaveMessage}
              </p>
            ) : null}
            {invoiceSaveError ? (
              <p
                className="max-w-xl rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-2.5 text-sm text-rose-800 shadow-sm"
                role="alert"
              >
                {invoiceSaveError}
              </p>
            ) : null}
          </div>
        ) : null}
      </article>
    </div>
  );
};

export default WarehouseReceipt;
