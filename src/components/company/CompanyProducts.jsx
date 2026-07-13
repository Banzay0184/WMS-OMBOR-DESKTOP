import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { getImageUrl } from "../../config";
import { useOrganizationTariffFeatures } from "../../utils/useOrganizationTariffFeatures";
import { useModalDismiss } from "../../utils/useModalDismiss";
import { normalizeUpcDigits } from "../../utils/productLabelPrint";
import { exportProductsToXlsx, parseProductsImportFile } from "../../utils/productImportExport";
import ProductLabelPrintModal from "./ProductLabelPrintModal";
import ProductHistoryModal from "./ProductHistoryModal";
import ProductLabelPrintSettingsPanel from "./ProductLabelPrintSettingsPanel";

const buildProductsSubtitle = ({ canUseIkpu, canUseUpc }) => {
  const parts = ["наше наименование", "ед. изм."];
  if (canUseIkpu) parts.splice(1, 0, "наименование по ИКПУ", "ИКПУ");
  if (canUseUpc) parts.splice(canUseIkpu ? 3 : 1, 0, "UPC");
  return `Справочник номенклатуры (${parts.join(", ")}) для накладных.`;
};

const normalizeSearchText = (value) => (value || "").toString().trim().toLowerCase();

/** Похоже на отсканированный штрихкод: только цифры, длина как у типичных UPC/EAN. */
const looksLikeBarcode = (value) => /^\d{6,}$/.test((value || "").trim());

/** Ищет по видимым (в зависимости от тарифа) полям товара. */
const productMatchesQuery = (product, query, { canUseInvoiceIkpu, canUseUpc }) => {
  if (!query) return true;
  const q = normalizeSearchText(query);
  const haystacks = [product.name, product.unit];
  if (canUseInvoiceIkpu) haystacks.push(product.ikpu_name, product.ikpu_code);
  if (canUseUpc) haystacks.push(product.upc);
  return haystacks.some((v) => normalizeSearchText(v).includes(q));
};

const compareValues = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ru");
};

const SORT_ACCESSORS = {
  name: (p) => p.name || "",
  ikpu_name: (p) => p.ikpu_name || "",
  ikpu_code: (p) => p.ikpu_code || "",
  upc: (p) => p.upc || "",
  sale_price: (p) => (p.sale_price != null && Number(p.sale_price) > 0 ? Number(p.sale_price) : null),
  unit: (p) => p.unit || "",
};

const sortProducts = (list, sort) => {
  if (!sort.column || !SORT_ACCESSORS[sort.column]) return list;
  const accessor = SORT_ACCESSORS[sort.column];
  const dir = sort.direction === "desc" ? -1 : 1;
  return [...list].sort((a, b) => compareValues(accessor(a), accessor(b)) * dir);
};

const INPUT_CLASS =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
const LABEL_CLASS = "block text-sm font-medium text-muted mb-1.5";

/** Кликабельный заголовок колонки с индикатором направления сортировки. */
const SortableTh = ({ column, label, sort, onSort, className = "" }) => {
  const active = sort.column === column;
  return (
    <th
      className={`px-4 py-3 text-sm font-medium text-muted ${className}`}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex items-center gap-1 hover:text-primary transition"
        aria-label={`Сортировать по колонке «${label}»`}
      >
        {label}
        <span className="text-xs w-3 inline-block" aria-hidden="true">
          {active ? (sort.direction === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
};

/** ИКПУ (УЗ): 17 цифр; пусто — допускается */
const normalizeIkpu = (value) => (value || "").replace(/\D/g, "");

const CompanyProducts = () => {
  const { activeContext, markForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbiddenProducts, setForbiddenProducts] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("active"); // "active" | "archived"
  const [archivedProducts, setArchivedProducts] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedError, setArchivedError] = useState("");
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [modalProductId, setModalProductId] = useState(null);
  const [modalName, setModalName] = useState("");
  const [modalIkpuName, setModalIkpuName] = useState("");
  const [modalIkpu, setModalIkpu] = useState("");
  const [modalUpc, setModalUpc] = useState("");
  const [modalUnit, setModalUnit] = useState("шт");
  const [modalSalePrice, setModalSalePrice] = useState("");
  const [modalImageFile, setModalImageFile] = useState(null);
  const [modalExistingImageUrl, setModalExistingImageUrl] = useState(null);
  const [modalImagePreviewUrl, setModalImagePreviewUrl] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const initialSnapshotRef = useRef(null);
  const [productIsUsed, setProductIsUsed] = useState(false);
  const [modalChangeReason, setModalChangeReason] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [printProduct, setPrintProduct] = useState(null);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [showLabelSettings, setShowLabelSettings] = useState(false);
  const [labelSettingsVersion, setLabelSettingsVersion] = useState(0);

  const { canUseUpc, canUseInvoiceIkpu, ready: tariffReady } = useOrganizationTariffFeatures(organizationId);

  const moneyFmt = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const tariffFlags = { canUseInvoiceIkpu, canUseUpc };
  const filteredProducts = useMemo(
    () => products.filter((p) => productMatchesQuery(p, searchQuery, tariffFlags)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, searchQuery, canUseInvoiceIkpu, canUseUpc]
  );
  const filteredArchivedProducts = useMemo(
    () => archivedProducts.filter((p) => productMatchesQuery(p, searchQuery, tariffFlags)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [archivedProducts, searchQuery, canUseInvoiceIkpu, canUseUpc]
  );

  const [sort, setSort] = useState({ column: null, direction: "asc" });
  const toggleSort = (column) =>
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    );

  const sortedProducts = useMemo(() => sortProducts(filteredProducts, sort), [filteredProducts, sort]);
  const sortedArchivedProducts = useMemo(
    () => sortProducts(filteredArchivedProducts, sort),
    [filteredArchivedProducts, sort]
  );

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const isAllVisibleSelected =
    sortedProducts.length > 0 && sortedProducts.every((p) => selectedIds.has(p.id));
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (isAllVisibleSelected) return new Set();
      const next = new Set(prev);
      sortedProducts.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);
  const [bulkArchiveLoading, setBulkArchiveLoading] = useState(false);
  const [bulkError, setBulkError] = useState("");

  /** Мягкое предупреждение (не блокирует сохранение) — товар с таким же наименованием уже есть. */
  const duplicateNameWarning = useMemo(() => {
    const name = normalizeSearchText(modalName);
    if (!name) return "";
    const dup = products.find(
      (p) => p.id !== modalProductId && normalizeSearchText(p.name) === name
    );
    return dup ? "Товар с таким наименованием уже есть в справочнике. Проверьте, не дубликат ли это." : "";
  }, [modalName, products, modalProductId]);

  const loadProducts = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    setForbiddenProducts(false);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/products/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setForbiddenProducts(true);
          markForbiddenAppPage?.(organizationId, "products");
          setError("Нет прав.");
          setProducts([]);
          return;
        }
        setError(data.detail ?? "Ошибка загрузки");
        setProducts([]);
        return;
      }
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, markForbiddenAppPage]);

  useEffect(() => {
    if (organizationId) {
      loadProducts();
    } else {
      setProducts([]);
      setLoading(false);
    }
    // Смена организации: архив предыдущей компании больше не актуален.
    setViewMode("active");
    setArchivedProducts([]);
    setArchivedLoaded(false);
    setSearchQuery("");
    setSelectedIds(new Set());
  }, [organizationId, loadProducts]);

  const loadArchivedProducts = useCallback(async () => {
    if (!organizationId) return;
    setArchivedLoading(true);
    setArchivedError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/products/?archived=true`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setForbiddenProducts(true);
          markForbiddenAppPage?.(organizationId, "products");
          setArchivedError("Нет прав.");
          setArchivedProducts([]);
          return;
        }
        setArchivedError(data.detail ?? "Ошибка загрузки архива");
        setArchivedProducts([]);
        return;
      }
      setArchivedProducts(Array.isArray(data) ? data : []);
      setArchivedLoaded(true);
    } catch (err) {
      setArchivedError(err.message ?? "Ошибка сети");
      setArchivedProducts([]);
    } finally {
      setArchivedLoading(false);
    }
  }, [organizationId, markForbiddenAppPage]);

  useEffect(() => {
    if (viewMode === "archived" && organizationId && !archivedLoaded) {
      loadArchivedProducts();
    }
  }, [viewMode, organizationId, archivedLoaded, loadArchivedProducts]);

  const handleRestoreProduct = async (productId) => {
    if (!organizationId || !productId) return;
    setRestoringId(productId);
    setArchivedError("");
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/products/${productId}/restore/`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setForbiddenProducts(true);
          markForbiddenAppPage?.(organizationId, "products");
          setArchivedError("Нет прав.");
          return;
        }
        setArchivedError(data.detail ?? "Ошибка восстановления");
        return;
      }
      setArchivedProducts((prev) => prev.filter((p) => p.id !== productId));
      loadProducts();
    } catch (err) {
      setArchivedError(err.message ?? "Ошибка сети");
    } finally {
      setRestoringId(null);
    }
  };

  const resetModal = useCallback(() => {
    setModalImagePreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setShowModal(false);
    setModalMode("create");
    setModalProductId(null);
    setModalName("");
    setModalIkpuName("");
    setModalIkpu("");
    setModalUpc("");
    setModalUnit("шт");
    setModalSalePrice("");
    setModalImageFile(null);
    setModalExistingImageUrl(null);
    setModalLoading(false);
    setModalError("");
    setModalSuccess("");
    setShowDiscardConfirm(false);
    setModalChangeReason("");
    setProductIsUsed(false);
    initialSnapshotRef.current = null;
  }, []);

  const openCreateModal = (prefillUpc = "") => {
    if (!organizationId) return;
    if (forbiddenProducts) {
      setModalError("Нет прав.");
      return;
    }
    const upcToPrefill = canUseUpc ? prefillUpc : "";
    setModalMode("create");
    setModalProductId(null);
    setModalName("");
    setModalIkpuName("");
    setModalIkpu("");
    setModalUpc(upcToPrefill);
    setModalUnit("шт");
    setModalSalePrice("");
    setModalImageFile(null);
    setModalExistingImageUrl(null);
    setModalImagePreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setModalLoading(false);
    setModalError("");
    setModalSuccess("");
    setShowDiscardConfirm(false);
    setModalChangeReason("");
    setProductIsUsed(false);
    initialSnapshotRef.current = {
      name: "",
      ikpuName: "",
      ikpu: "",
      upc: upcToPrefill,
      unit: "шт",
      salePrice: "",
    };
    setShowModal(true);
  };

  const openEditModal = (p) => {
    if (!p) return;
    if (forbiddenProducts) {
      setModalError("Нет прав.");
      return;
    }
    setModalMode("edit");
    setModalProductId(p.id);
    setModalName(p.name ?? "");
    setModalIkpuName(p.ikpu_name ?? "");
    setModalIkpu(p.ikpu_code ?? "");
    setModalUpc(p.upc ?? "");
    setModalUnit((p.unit || "шт").trim() || "шт");
    setModalSalePrice(
      p.sale_price != null && Number.isFinite(Number(p.sale_price)) && Number(p.sale_price) > 0
        ? String(p.sale_price)
        : ""
    );
    setModalImageFile(null);
    setModalExistingImageUrl(p.image ?? null);
    setModalImagePreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setModalLoading(false);
    setModalError("");
    setModalSuccess("");
    setShowDiscardConfirm(false);
    setModalChangeReason("");
    setProductIsUsed(false);
    initialSnapshotRef.current = {
      name: p.name ?? "",
      ikpuName: p.ikpu_name ?? "",
      ikpu: p.ikpu_code ?? "",
      upc: p.upc ?? "",
      unit: (p.unit || "шт").trim() || "шт",
      salePrice:
        p.sale_price != null && Number.isFinite(Number(p.sale_price)) && Number(p.sale_price) > 0
          ? String(p.sale_price)
          : "",
    };
    setShowModal(true);

    if (organizationId) {
      authFetch(`platform/organizations/${organizationId}/products/${p.id}/usage/`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setProductIsUsed(Boolean(data.is_used));
        })
        .catch(() => {});
    }
  };

  const handleModalImageChange = (e) => {
    const f = e.target.files?.[0] ?? null;
    setModalImagePreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
    setModalImageFile(f);
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!organizationId) return;
    if (forbiddenProducts) {
      setModalError("Нет прав.");
      return;
    }

    const nextName = modalName.trim();
    if (!nextName) {
      setModalError("Введите наше наименование.");
      return;
    }

    const nextIkpuName = canUseInvoiceIkpu ? modalIkpuName.trim() : "";
    const ikpuDigits = canUseInvoiceIkpu ? normalizeIkpu(modalIkpu) : "";
    if (canUseInvoiceIkpu && ikpuDigits && ikpuDigits.length !== 17) {
      setModalError("ИКПУ: ровно 17 цифр или оставьте пустым.");
      return;
    }
    const upc = canUseUpc ? (modalUpc || "").trim() : "";

    const unit = modalUnit.trim() || "шт";
    const salePriceRaw = modalSalePrice.trim().replace(/\s/g, "").replace(",", ".");
    const salePriceParsed = salePriceRaw ? Number(salePriceRaw) : null;
    const salePricePayload =
      salePriceParsed != null && Number.isFinite(salePriceParsed) && salePriceParsed > 0
        ? salePriceParsed
        : null;

    setModalLoading(true);
    setModalError("");
    setModalSuccess("");
    try {
      const useMultipart = modalImageFile != null;

      if (modalMode === "create") {
        const res = useMultipart
          ? await authFetch(`platform/organizations/${organizationId}/products/`, {
              method: "POST",
              body: (() => {
                const fd = new FormData();
                fd.append("name", nextName);
                if (canUseInvoiceIkpu) {
                  fd.append("ikpu_name", nextIkpuName);
                  fd.append("ikpu_code", ikpuDigits);
                }
                if (canUseUpc) fd.append("upc", upc);
                fd.append("unit", unit);
                if (salePricePayload != null) fd.append("sale_price", String(salePricePayload));
                fd.append("image", modalImageFile);
                return fd;
              })(),
            })
          : await authFetch(`platform/organizations/${organizationId}/products/`, {
              method: "POST",
              body: JSON.stringify({
                name: nextName,
                ...(canUseInvoiceIkpu ? { ikpu_name: nextIkpuName, ikpu_code: ikpuDigits } : {}),
                ...(canUseUpc ? { upc } : {}),
                unit,
                sale_price: salePricePayload,
              }),
            });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403) {
            setForbiddenProducts(true);
            markForbiddenAppPage?.(organizationId, "products");
            setModalError("Нет прав.");
            return;
          }
          setModalError(data.detail ?? data.ikpu_code?.[0] ?? data.upc?.[0] ?? "Ошибка создания");
          return;
        }
        setModalSuccess("Товар создан.");
      } else {
        const res = useMultipart
          ? await authFetch(`platform/organizations/${organizationId}/products/${modalProductId}/`, {
              method: "PATCH",
              body: (() => {
                const fd = new FormData();
                fd.append("name", nextName);
                if (canUseInvoiceIkpu) {
                  fd.append("ikpu_name", nextIkpuName);
                  fd.append("ikpu_code", ikpuDigits);
                }
                if (canUseUpc) fd.append("upc", upc);
                fd.append("unit", unit);
                if (salePricePayload != null) fd.append("sale_price", String(salePricePayload));
                fd.append("image", modalImageFile);
                if (modalChangeReason.trim()) fd.append("change_reason", modalChangeReason.trim());
                return fd;
              })(),
            })
          : await authFetch(`platform/organizations/${organizationId}/products/${modalProductId}/`, {
              method: "PATCH",
              body: JSON.stringify({
                name: nextName,
                ...(canUseInvoiceIkpu ? { ikpu_name: nextIkpuName, ikpu_code: ikpuDigits } : {}),
                ...(canUseUpc ? { upc } : {}),
                unit,
                sale_price: salePricePayload,
                ...(modalChangeReason.trim() ? { change_reason: modalChangeReason.trim() } : {}),
              }),
            });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403) {
            setForbiddenProducts(true);
            markForbiddenAppPage?.(organizationId, "products");
            setModalError("Нет прав.");
            return;
          }
          setModalError(data.detail ?? data.ikpu_code?.[0] ?? data.upc?.[0] ?? "Ошибка обновления");
          return;
        }
        setModalSuccess("Товар обновлён.");
      }

      setTimeout(() => {
        resetModal();
        loadProducts();
      }, 500);
    } catch (err) {
      setModalError(err.message ?? "Ошибка сети");
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!organizationId || !confirmDeleteId) return;
    if (forbiddenProducts) return;

    setDeleteLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/products/${confirmDeleteId}/`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        if (res.status === 403) {
          setForbiddenProducts(true);
          markForbiddenAppPage?.(organizationId, "products");
          setError("Нет прав.");
          return;
        }
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Ошибка удаления");
        return;
      }
      setConfirmDeleteId(null);
      setArchivedLoaded(false);
      loadProducts();
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setDeleteLoading(false);
    }
  };

  const isModalDirty = useCallback(() => {
    const snap = initialSnapshotRef.current;
    if (!snap) return false;
    if (modalImageFile != null) return true;
    return (
      modalName !== snap.name ||
      modalIkpuName !== snap.ikpuName ||
      modalIkpu !== snap.ikpu ||
      modalUpc !== snap.upc ||
      modalUnit !== snap.unit ||
      modalSalePrice !== snap.salePrice
    );
  }, [modalName, modalIkpuName, modalIkpu, modalUpc, modalUnit, modalSalePrice, modalImageFile]);

  /**
   * «Критичные» поля — те, что участвуют в фискальной/складской логике (ИКПУ, UPC, ед. изм., цена).
   * Наименование сюда намеренно не входит: оно фиксируется в истории, но не требует
   * прерывающего предупреждения при каждой правке — см. анализ критичности полей.
   */
  const isCriticalFieldChanged = useCallback(() => {
    const snap = initialSnapshotRef.current;
    if (!snap) return false;
    return (
      modalIkpuName !== snap.ikpuName ||
      modalIkpu !== snap.ikpu ||
      modalUpc !== snap.upc ||
      modalUnit !== snap.unit ||
      modalSalePrice !== snap.salePrice
    );
  }, [modalIkpuName, modalIkpu, modalUpc, modalUnit, modalSalePrice]);

  const showUsageWarning = modalMode === "edit" && productIsUsed && isCriticalFieldChanged();

  const closeProductModal = useCallback(() => {
    if (modalLoading) return;
    if (modalSuccess) {
      resetModal();
      return;
    }
    if (showDiscardConfirm) {
      // повторная попытка закрыть, пока уже показано подтверждение — считаем это согласием
      resetModal();
      return;
    }
    if (isModalDirty()) {
      setShowDiscardConfirm(true);
      return;
    }
    resetModal();
  }, [modalLoading, modalSuccess, showDiscardConfirm, isModalDirty, resetModal]);

  const closeDeleteModal = useCallback(() => {
    if (deleteLoading) return;
    setConfirmDeleteId(null);
  }, [deleteLoading]);

  const productModalA11y = useModalDismiss(closeProductModal, { active: showModal });
  const deleteModalA11y = useModalDismiss(closeDeleteModal, { active: Boolean(confirmDeleteId) });

  const handleBulkArchive = async () => {
    if (!organizationId || selectedIds.size === 0) return;
    setBulkArchiveLoading(true);
    setBulkError("");
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.all(
        ids.map((id) =>
          authFetch(`platform/organizations/${organizationId}/products/${id}/`, { method: "DELETE" })
        )
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.some((r) => r.status === 403)) {
        setForbiddenProducts(true);
        markForbiddenAppPage?.(organizationId, "products");
      }
      if (failed.length > 0) {
        setError(`Не удалось архивировать ${failed.length} из ${ids.length} товаров.`);
      }
      setBulkArchiveConfirm(false);
      clearSelection();
      setArchivedLoaded(false);
      loadProducts();
    } catch (err) {
      setBulkError(err.message ?? "Ошибка сети");
    } finally {
      setBulkArchiveLoading(false);
    }
  };

  const closeBulkArchiveModal = useCallback(() => {
    if (bulkArchiveLoading) return;
    setBulkArchiveConfirm(false);
    setBulkError("");
  }, [bulkArchiveLoading]);
  const bulkArchiveA11y = useModalDismiss(closeBulkArchiveModal, { active: bulkArchiveConfirm });

  const [exportError, setExportError] = useState("");
  const handleExport = async () => {
    setExportError("");
    try {
      const rows = viewMode === "active" ? sortedProducts : sortedArchivedProducts;
      const prefix = viewMode === "active" ? "tovary" : "tovary-arhiv";
      await exportProductsToXlsx(rows, { canUseInvoiceIkpu, canUseUpc }, prefix);
    } catch (err) {
      setExportError(err.message ?? "Не удалось выгрузить файл.");
    }
  };

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState("");

  const closeImportModal = useCallback(() => {
    if (importLoading) return;
    setImportModalOpen(false);
    setImportFile(null);
    setImportResult(null);
    setImportError("");
  }, [importLoading]);
  const importModalA11y = useModalDismiss(closeImportModal, { active: importModalOpen });

  const handleImportFileChange = (e) => {
    setImportFile(e.target.files?.[0] ?? null);
    setImportResult(null);
    setImportError("");
  };

  const handleImportStart = async () => {
    if (!importFile || !organizationId) return;
    setImportLoading(true);
    setImportError("");
    setImportResult(null);
    try {
      const rows = await parseProductsImportFile(importFile);
      if (rows.length === 0) {
        setImportError("В файле не найдено строк с заполненным наименованием.");
        return;
      }
      let created = 0;
      const failed = [];
      let stopped = false;
      for (const row of rows) {
        if (stopped) break;
        try {
          const payload = { name: row.name, unit: row.unit || "шт" };
          if (canUseInvoiceIkpu) {
            payload.ikpu_name = row.ikpu_name;
            payload.ikpu_code = row.ikpu_code;
          }
          if (canUseUpc) {
            payload.upc = row.upc;
            const priceNum = row.sale_price ? Number(String(row.sale_price).replace(",", ".")) : null;
            if (priceNum != null && Number.isFinite(priceNum) && priceNum > 0) {
              payload.sale_price = priceNum;
            }
          }
          const res = await authFetch(`platform/organizations/${organizationId}/products/`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            created += 1;
          } else if (res.status === 403) {
            setForbiddenProducts(true);
            markForbiddenAppPage?.(organizationId, "products");
            failed.push({ name: row.name, reason: "Нет прав. Импорт остановлен." });
            stopped = true;
          } else {
            const data = await res.json().catch(() => ({}));
            const reason = data.detail ?? data.ikpu_code?.[0] ?? data.upc?.[0] ?? data.name?.[0] ?? "Ошибка";
            failed.push({ name: row.name, reason: String(reason) });
          }
        } catch (err) {
          failed.push({ name: row.name, reason: err.message ?? "Ошибка сети" });
        }
      }
      setImportResult({ total: rows.length, created, failed });
      if (created > 0) {
        setArchivedLoaded(false);
        loadProducts();
      }
    } catch (err) {
      setImportError(err.message ?? "Не удалось прочитать файл. Поддерживаются .xlsx и .csv.");
    } finally {
      setImportLoading(false);
    }
  };

  const [dragOverProductId, setDragOverProductId] = useState(null);
  const [imageDropLoadingId, setImageDropLoadingId] = useState(null);

  const handleImageDrop = async (e, productId) => {
    e.preventDefault();
    setDragOverProductId(null);
    if (!organizationId || forbiddenProducts) return;
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      setError("Перетащите файл изображения (JPG, PNG и т.п.).");
      return;
    }
    setImageDropLoadingId(productId);
    setError("");
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await authFetch(`platform/organizations/${organizationId}/products/${productId}/`, {
        method: "PATCH",
        body: fd,
      });
      if (!res.ok) {
        if (res.status === 403) {
          setForbiddenProducts(true);
          markForbiddenAppPage?.(organizationId, "products");
        }
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Не удалось обновить фото.");
        return;
      }
      loadProducts();
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setImageDropLoadingId(null);
    }
  };

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-muted">Товары</h1>
        <p className="text-muted">Выберите организацию в контексте.</p>
      </div>
    );
  }

  if (loading || !tariffReady) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-muted">Товары</h1>
        <p className="text-muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-muted">Товары</h1>
          <p className="text-muted text-sm mt-1">
            {buildProductsSubtitle({ canUseIkpu: canUseInvoiceIkpu, canUseUpc })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canUseUpc ? (
            <button
              type="button"
              onClick={() => setShowLabelSettings((v) => !v)}
              className="px-4 py-2.5 rounded-lg border border-border text-muted font-medium hover:bg-secondary hover:text-primary transition"
              aria-expanded={showLabelSettings}
              aria-label="Настройки печати этикеток"
            >
              {showLabelSettings ? "Скрыть настройки печати" : "Настройки печати этикеток"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleExport}
            disabled={viewMode === "active" ? products.length === 0 : archivedProducts.length === 0}
            className="px-4 py-2.5 rounded-lg border border-border text-muted font-medium hover:bg-secondary hover:text-primary transition disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Экспортировать список товаров в Excel"
          >
            Экспорт в Excel
          </button>
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            disabled={forbiddenProducts}
            className="px-4 py-2.5 rounded-lg border border-border text-muted font-medium hover:bg-secondary hover:text-primary transition disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Импортировать товары из файла"
          >
            Импорт из файла
          </button>
          <button
            type="button"
            onClick={() => openCreateModal()}
            disabled={forbiddenProducts}
            className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Добавить товар"
          >
            Добавить
          </button>
        </div>
      </div>

      {exportError ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {exportError}
        </p>
      ) : null}

      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Режим просмотра товаров">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "active"}
          onClick={() => {
            setViewMode("active");
            clearSelection();
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            viewMode === "active"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-primary"
          }`}
        >
          Активные
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "archived"}
          onClick={() => {
            setViewMode("archived");
            clearSelection();
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            viewMode === "archived"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-primary"
          }`}
        >
          Архив{archivedLoaded && archivedProducts.length > 0 ? ` (${archivedProducts.length})` : ""}
        </button>
      </div>

      {canUseUpc && showLabelSettings ? (
        <ProductLabelPrintSettingsPanel
          organizationId={organizationId}
          onSettingsChange={() => setLabelSettingsVersion((v) => v + 1)}
        />
      ) : null}

      {(viewMode === "active" ? products.length > 0 : archivedProducts.length > 0) ? (
        <div className="relative max-w-sm">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по наименованию, ИКПУ, UPC…"
            className={`${INPUT_CLASS} pr-9`}
            aria-label="Поиск товаров"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary text-sm px-1"
              aria-label="Очистить поиск"
            >
              ✕
            </button>
          ) : null}
        </div>
      ) : null}

      {viewMode === "active" && error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {viewMode === "active" && products.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted shadow-sm">
          Нет товаров. Добавьте первый или заполните из накладной.
        </div>
      ) : null}

      {viewMode === "active" && products.length > 0 && filteredProducts.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted shadow-sm space-y-3">
          <p>Совпадений не найдено.</p>
          {canUseUpc && looksLikeBarcode(searchQuery) ? (
            <button
              type="button"
              onClick={() => openCreateModal(searchQuery.trim())}
              disabled={forbiddenProducts}
              className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover transition disabled:opacity-50"
            >
              Добавить товар с UPC «{searchQuery.trim()}»
            </button>
          ) : null}
        </div>
      ) : null}

      {viewMode === "active" && selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 bg-secondary/60 border border-border rounded-lg px-4 py-3">
          <span className="text-sm text-muted font-medium">Выбрано: {selectedIds.size}</span>
          <button
            type="button"
            onClick={() => setBulkArchiveConfirm(true)}
            disabled={forbiddenProducts}
            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition text-sm disabled:opacity-50"
          >
            Архивировать выбранные
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="px-3 py-1.5 rounded-lg text-muted hover:text-primary transition text-sm ml-auto"
          >
            Снять выделение
          </button>
        </div>
      ) : null}

      {viewMode === "active" && filteredProducts.length > 0 ? (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={isAllVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Выбрать все видимые товары"
                      className="h-4 w-4 rounded border-border"
                    />
                  </th>
                  <th className="px-4 py-3 text-sm font-medium text-muted w-24">Фото</th>
                  <SortableTh column="name" label="Наше наименование" sort={sort} onSort={toggleSort} />
                  {canUseInvoiceIkpu ? (
                    <>
                      <SortableTh column="ikpu_name" label="Наименование по ИКПУ" sort={sort} onSort={toggleSort} />
                      <SortableTh column="ikpu_code" label="ИКПУ" sort={sort} onSort={toggleSort} />
                    </>
                  ) : null}
                  {canUseUpc ? (
                    <SortableTh column="upc" label="UPC" sort={sort} onSort={toggleSort} />
                  ) : null}
                  {canUseUpc ? (
                    <SortableTh column="sale_price" label="Розница" sort={sort} onSort={toggleSort} />
                  ) : null}
                  <SortableTh column="unit" label="Ед. изм." sort={sort} onSort={toggleSort} />
                  <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((p) => (
                  <tr key={p.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 align-middle">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelectOne(p.id)}
                        aria-label={`Выбрать ${p.name ?? "товар"}`}
                        className="h-4 w-4 rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverProductId(p.id);
                        }}
                        onDragLeave={() => setDragOverProductId((prev) => (prev === p.id ? null : prev))}
                        onDrop={(e) => handleImageDrop(e, p.id)}
                        title="Перетащите изображение сюда, чтобы обновить фото"
                        className={`h-12 w-12 rounded-lg transition ${
                          dragOverProductId === p.id ? "ring-2 ring-primary ring-offset-1" : ""
                        }`}
                      >
                        {imageDropLoadingId === p.id ? (
                          <div className="h-12 w-12 rounded-lg border border-border bg-neutral-50 flex items-center justify-center text-[10px] text-muted">
                            …
                          </div>
                        ) : getImageUrl(p.image) ? (
                          <img
                            src={getImageUrl(p.image)}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover border border-border bg-white pointer-events-none"
                            loading="lazy"
                          />
                        ) : (
                          <div
                            className="h-12 w-12 rounded-lg border border-dashed border-border bg-neutral-50 pointer-events-none"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.name?.trim() ? p.name : "—"}</td>
                    {canUseInvoiceIkpu ? (
                      <>
                        <td className="px-4 py-3 text-muted">{p.ikpu_name?.trim() ? p.ikpu_name : "—"}</td>
                        <td className="px-4 py-3 text-muted font-mono text-sm">{p.ikpu_code?.trim() ? p.ikpu_code : "—"}</td>
                      </>
                    ) : null}
                    {canUseUpc ? (
                      <td className="px-4 py-3 text-muted font-mono text-sm">{p.upc?.trim() ? p.upc : "—"}</td>
                    ) : null}
                    {canUseUpc ? (
                      <td className="px-4 py-3 text-muted text-sm">
                        {p.sale_price != null && Number(p.sale_price) > 0
                          ? `${moneyFmt.format(Number(p.sale_price))} UZS`
                          : "—"}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-muted">{(p.unit || "шт").trim() || "шт"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {canUseUpc ? (
                          <button
                            type="button"
                            onClick={() => setPrintProduct(p)}
                            disabled={!normalizeUpcDigits(p.upc)}
                            title={
                              normalizeUpcDigits(p.upc)
                                ? "Печать этикетки с названием, UPC и ценой"
                                : "Укажите UPC в карточке товара"
                            }
                            className="px-3 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition disabled:opacity-40 disabled:pointer-events-none"
                            aria-label={`Печать этикетки ${p.name ?? "товар"}`}
                          >
                            Печать этикетки
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          disabled={forbiddenProducts}
                          className="px-3 py-2 rounded-lg border border-border text-muted hover:bg-secondary hover:text-primary transition disabled:opacity-50 disabled:pointer-events-none"
                          aria-label={`Редактировать ${p.name ?? "товар"}`}
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryProduct(p)}
                          className="px-3 py-2 rounded-lg border border-border text-muted hover:bg-secondary hover:text-primary transition"
                          aria-label={`История ${p.name ?? "товар"}`}
                        >
                          История
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(p.id)}
                          disabled={forbiddenProducts}
                          className="px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50 disabled:pointer-events-none"
                          aria-label={`Удалить ${p.name ?? "товар"}`}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {viewMode === "archived" ? (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          {archivedError ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4" role="alert">
              {archivedError}
            </p>
          ) : null}

          {archivedLoading ? (
            <p className="text-muted text-sm">Загрузка архива…</p>
          ) : archivedProducts.length === 0 ? (
            <p className="text-muted text-sm">В архиве нет удалённых товаров.</p>
          ) : filteredArchivedProducts.length === 0 ? (
            <p className="text-muted text-sm">Совпадений не найдено.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-sm font-medium text-muted w-24">Фото</th>
                    <SortableTh column="name" label="Наше наименование" sort={sort} onSort={toggleSort} />
                    <SortableTh column="unit" label="Ед. изм." sort={sort} onSort={toggleSort} />
                    <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedArchivedProducts.map((p) => (
                    <tr key={p.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 align-middle">
                        {getImageUrl(p.image) ? (
                          <img
                            src={getImageUrl(p.image)}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover border border-border bg-white opacity-60"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg border border-dashed border-border bg-neutral-50" aria-hidden="true" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{p.name?.trim() ? p.name : "—"}</td>
                      <td className="px-4 py-3 text-muted">{(p.unit || "шт").trim() || "шт"}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleRestoreProduct(p.id)}
                          disabled={restoringId === p.id}
                          className="px-3 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition disabled:opacity-50"
                          aria-label={`Восстановить ${p.name ?? "товар"}`}
                        >
                          {restoringId === p.id ? "Восстановление…" : "Восстановить"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {showModal ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
          onMouseDown={productModalA11y.onBackdropMouseDown}
        >
          <div
            ref={productModalA11y.dialogRef}
            tabIndex={-1}
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto focus:outline-none"
          >
            <h2 id="product-modal-title" className="text-lg font-medium text-muted mb-4">
              {modalMode === "create" ? "Новый товар" : "Редактировать товар"}
            </h2>

            {showDiscardConfirm ? (
              <div className="space-y-4">
                <p className="text-sm text-muted">
                  Есть несохранённые изменения. Точно закрыть без сохранения?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetModal}
                    className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                  >
                    Не сохранять
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(false)}
                    className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition"
                    autoFocus
                  >
                    Продолжить редактирование
                  </button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleModalSubmit} className="space-y-4">
              {showUsageWarning ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-2" role="alert">
                  <p className="text-xs text-amber-700">
                    Товар уже использовался в документах (накладные и/или продажи). Изменения не затронут уже
                    созданные документы — они сохранили свои данные на момент оформления. Новое значение будет
                    применяться только к будущим операциям.
                  </p>
                  <div>
                    <label htmlFor="product-change-reason" className="block text-xs font-medium text-amber-700 mb-1">
                      Причина изменения (необязательно)
                    </label>
                    <input
                      id="product-change-reason"
                      type="text"
                      value={modalChangeReason}
                      disabled={modalLoading || Boolean(modalSuccess)}
                      onChange={(e) => setModalChangeReason(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      placeholder="Например: опечатка в ИКПУ, новая цена поставщика"
                      aria-label="Причина изменения критичного поля"
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <label htmlFor="product-name" className={LABEL_CLASS}>
                  Наше наименование
                </label>
                <input
                  id="product-name"
                  type="text"
                  value={modalName}
                  disabled={modalLoading || Boolean(modalSuccess)}
                  onChange={(e) => setModalName(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Например: Холодильник ABC-100"
                  aria-label="Наше наименование товара"
                  required
                />
                {duplicateNameWarning ? (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-1.5" role="alert">
                    {duplicateNameWarning}
                  </p>
                ) : null}
              </div>

              {canUseInvoiceIkpu ? (
                <div>
                  <label htmlFor="product-ikpu-name" className={LABEL_CLASS}>
                    Наименование по ИКПУ (необязательно)
                  </label>
                  <input
                    id="product-ikpu-name"
                    type="text"
                    value={modalIkpuName}
                    disabled={modalLoading || Boolean(modalSuccess)}
                    onChange={(e) => setModalIkpuName(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="Официальное наименование по классификатору"
                    aria-label="Наименование по ИКПУ"
                  />
                </div>
              ) : null}

              {canUseInvoiceIkpu ? (
                <div>
                  <label htmlFor="product-ikpu" className={LABEL_CLASS}>
                    ИКПУ (необязательно)
                  </label>
                  <input
                    id="product-ikpu"
                    type="text"
                    inputMode="numeric"
                    value={modalIkpu}
                    disabled={modalLoading || Boolean(modalSuccess)}
                    onChange={(e) => setModalIkpu(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="17 цифр"
                    aria-label="ИКПУ — 17 цифр или пусто"
                  />
                  <p className="text-xs text-muted mt-1">Не пустой ИКПУ должен содержать 17 цифр; уникален в организации.</p>
                </div>
              ) : null}

              {canUseUpc ? (
                <div>
                  <label htmlFor="product-upc" className={LABEL_CLASS}>
                    UPC (необязательно)
                  </label>
                  <input
                    id="product-upc"
                    type="text"
                    value={modalUpc}
                    disabled={modalLoading || Boolean(modalSuccess)}
                    onChange={(e) => setModalUpc(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="Например: 012345678905"
                    aria-label="UPC код товара"
                  />
                </div>
              ) : null}

              <div>
                <label htmlFor="product-sale-price" className={LABEL_CLASS}>
                  Розничная цена, UZS (необязательно)
                </label>
                <input
                  id="product-sale-price"
                  type="text"
                  inputMode="decimal"
                  value={modalSalePrice}
                  disabled={modalLoading || Boolean(modalSuccess)}
                  onChange={(e) => setModalSalePrice(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Для этикетки и POS"
                  aria-label="Розничная цена в сумах"
                />
              </div>

              <div>
                <label htmlFor="product-unit" className={LABEL_CLASS}>
                  Единица измерения
                </label>
                <input
                  id="product-unit"
                  type="text"
                  value={modalUnit}
                  disabled={modalLoading || Boolean(modalSuccess)}
                  onChange={(e) => setModalUnit(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="шт"
                  aria-label="Единица измерения"
                />
              </div>

              <div>
                <label htmlFor="product-image" className={LABEL_CLASS}>
                  Фото товара (необязательно)
                </label>
                <input
                  id="product-image"
                  type="file"
                  accept="image/*"
                  disabled={modalLoading || Boolean(modalSuccess)}
                  onChange={handleModalImageChange}
                  className="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-secondary file:text-muted"
                  aria-label="Загрузить фото товара"
                />
                {(modalImagePreviewUrl || getImageUrl(modalExistingImageUrl)) ? (
                  <div className="mt-2">
                    <img
                      src={modalImagePreviewUrl || getImageUrl(modalExistingImageUrl)}
                      alt={modalImagePreviewUrl ? "Предпросмотр нового фото" : "Фото товара"}
                      className="h-20 w-20 rounded-lg object-cover border border-border"
                    />
                  </div>
                ) : null}
              </div>

              {modalError ? (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
                  {modalError}
                </p>
              ) : null}

              {modalSuccess ? (
                <p className="text-sm text-green-600" role="status">
                  {modalSuccess}
                </p>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={modalLoading || Boolean(modalSuccess)}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition disabled:opacity-50"
                >
                  {modalLoading ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  disabled={modalLoading || Boolean(modalSuccess)}
                  onClick={closeProductModal}
                  className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      ) : null}

      {printProduct ? (
        <ProductLabelPrintModal
          key={`${printProduct.id}-${labelSettingsVersion}`}
          product={printProduct}
          organizationId={organizationId}
          onClose={() => setPrintProduct(null)}
        />
      ) : null}

      {historyProduct ? (
        <ProductHistoryModal
          product={historyProduct}
          organizationId={organizationId}
          onClose={() => setHistoryProduct(null)}
        />
      ) : null}

      {confirmDeleteId ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-product-title"
          onMouseDown={deleteModalA11y.onBackdropMouseDown}
        >
          <div
            ref={deleteModalA11y.dialogRef}
            tabIndex={-1}
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6 focus:outline-none"
          >
            <h2 id="remove-product-title" className="text-lg font-medium text-muted mb-2">
              Удалить товар?
            </h2>
            <p className="text-sm text-muted mb-4">Запись будет скрыта из справочника (мягкое удаление).</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleteLoading ? "Удаление…" : "Удалить"}
              </button>
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteLoading}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkArchiveConfirm ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-archive-title"
          onMouseDown={bulkArchiveA11y.onBackdropMouseDown}
        >
          <div
            ref={bulkArchiveA11y.dialogRef}
            tabIndex={-1}
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6 focus:outline-none"
          >
            <h2 id="bulk-archive-title" className="text-lg font-medium text-muted mb-2">
              Архивировать {selectedIds.size} товар(ов)?
            </h2>
            <p className="text-sm text-muted mb-4">Записи будут скрыты из справочника (мягкое удаление).</p>
            {bulkError ? (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4" role="alert">
                {bulkError}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBulkArchive}
                disabled={bulkArchiveLoading}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {bulkArchiveLoading ? "Архивация…" : "Архивировать"}
              </button>
              <button
                type="button"
                onClick={closeBulkArchiveModal}
                disabled={bulkArchiveLoading}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importModalOpen ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-modal-title"
          onMouseDown={importModalA11y.onBackdropMouseDown}
        >
          <div
            ref={importModalA11y.dialogRef}
            tabIndex={-1}
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto focus:outline-none"
          >
            <h2 id="import-modal-title" className="text-lg font-medium text-muted mb-2">
              Импорт товаров из файла
            </h2>
            <p className="text-sm text-muted mb-4">
              Файл .xlsx или .csv. Колонки: «Наименование»
              {canUseInvoiceIkpu ? ", «Наименование по ИКПУ», «ИКПУ»" : ""}
              {canUseUpc ? ", «UPC», «Розница»" : ""}, «Ед. изм.». Обязательна только «Наименование» — остальные
              можно не заполнять.
            </p>
            <input
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleImportFileChange}
              disabled={importLoading}
              className="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-secondary file:text-muted"
              aria-label="Файл для импорта товаров"
            />
            {importError ? (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3" role="alert">
                {importError}
              </p>
            ) : null}
            {importResult ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-muted" role="status">
                  Обработано строк: {importResult.total}. Создано: {importResult.created}. Ошибок:{" "}
                  {importResult.failed.length}.
                </p>
                {importResult.failed.length > 0 ? (
                  <ul className="max-h-32 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
                    {importResult.failed.map((f, i) => (
                      <li key={i} className="text-red-600 text-xs">
                        {f.name || "(без наименования)"}: {f.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleImportStart}
                disabled={!importFile || importLoading}
                className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition disabled:opacity-50"
              >
                {importLoading ? "Импорт…" : "Начать импорт"}
              </button>
              <button
                type="button"
                onClick={closeImportModal}
                disabled={importLoading}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition disabled:opacity-50"
              >
                {importResult ? "Закрыть" : "Отмена"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CompanyProducts;
