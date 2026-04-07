import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import bwipjs from "bwip-js/browser";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { getImageUrl } from "../../config";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const formatDate = (iso) => {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
};

const MarkingQrCell = ({ value }) => {
  const canvasRef = useRef(null);
  const code = String(value || "").trim();

  useEffect(() => {
    if (!code || !canvasRef.current) return;
    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: "datamatrix",
        text: code,
        scale: 3,
        paddingwidth: 0,
        paddingheight: 0,
      });
    } catch {
      // ignore render issues, fallback shown below
    }
  }, [code]);

  if (!code) {
    return <span className="text-muted/50 text-xs">—</span>;
  }
  return (
    <div
      className="inline-flex shrink-0 rounded-lg border border-border bg-white p-1 shadow-sm"
      title="Data Matrix (Asl Belgisi)"
    >
      <canvas ref={canvasRef} style={{ width: 62, height: 62 }} />
    </div>
  );
};

const makeRowKey = (row) => {
  if (row?.invoice_id == null || row?.line_id == null || row?.marking_index == null) return null;
  return `${row.invoice_id}|${row.line_id}|${row.marking_index}`;
};

const ProductPhotoCell = ({ url, label }) => {
  const src = getImageUrl(url);
  if (!src) {
    return (
      <div
        className="h-[72px] w-[72px] rounded-lg border border-dashed border-border bg-neutral-50 flex items-center justify-center text-[10px] text-muted/60 text-center px-1 leading-tight"
        aria-hidden="true"
      >
        нет фото
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={label ? `Фото товара: ${label}` : "Фото товара"}
      className="h-[72px] w-[72px] rounded-lg object-cover border border-border bg-white"
      loading="lazy"
    />
  );
};

const CompanyWarehouseStock = ({ section = "marked" }) => {
  const navigate = useNavigate();
  const { warehouseId } = useParams();
  const { activeContext, markForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseLoading, setWarehouseLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [unmarkedRows, setUnmarkedRows] = useState([]);
  const [unmarkedTotalCount, setUnmarkedTotalCount] = useState(0);
  const [unmarkedFilteredCount, setUnmarkedFilteredCount] = useState(0);
  const [unmarkedLoading, setUnmarkedLoading] = useState(true);
  const [unmarkedError, setUnmarkedError] = useState("");
  const [unmarkedSearch, setUnmarkedSearch] = useState("");
  const [unmarkedDebouncedSearch, setUnmarkedDebouncedSearch] = useState("");
  const [unmarkedPage, setUnmarkedPage] = useState(1);
  const [unmarkedPageSize] = useState(25);
  const [canUseUpc, setCanUseUpc] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editMarkingCode, setEditMarkingCode] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [selectedRowsByKey, setSelectedRowsByKey] = useState(() => new Map());

  const loadWarehouse = useCallback(async () => {
    if (!organizationId || !warehouseId) return;
    setWarehouseLoading(true);
    try {
      const res = await authFetch(
        `platform/organizations/${organizationId}/warehouses/${warehouseId}/`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "warehouses");
        }
        setWarehouseName("");
        return;
      }
      setWarehouseName((data.name || "").trim() || `Склад #${warehouseId}`);
    } catch {
      setWarehouseName("");
    } finally {
      setWarehouseLoading(false);
    }
  }, [organizationId, warehouseId, markForbiddenAppPage]);

  const loadMarkingUnits = useCallback(async () => {
    if (!organizationId || !warehouseId) return;
    setRowsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

      const res = await authFetch(
        `platform/organizations/${organizationId}/warehouses/${warehouseId}/marking-units/?${params.toString()}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "warehouses");
          setError("Нет доступа.");
          setRows([]);
          setTotalCount(0);
          setFilteredCount(0);
          return;
        }
        setError(typeof data.detail === "string" ? data.detail : "Ошибка загрузки");
        setRows([]);
        setTotalCount(0);
        setFilteredCount(0);
        return;
      }
      setRows(Array.isArray(data.results) ? data.results : []);
      setTotalCount(typeof data.total_count === "number" ? data.total_count : 0);
      setFilteredCount(typeof data.count === "number" ? data.count : 0);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
      setRows([]);
      setTotalCount(0);
      setFilteredCount(0);
    } finally {
      setRowsLoading(false);
    }
  }, [organizationId, warehouseId, page, pageSize, debouncedSearch, markForbiddenAppPage]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => setUnmarkedDebouncedSearch(unmarkedSearch), 400);
    return () => clearTimeout(t);
  }, [unmarkedSearch]);

  useEffect(() => {
    void loadWarehouse();
  }, [loadWarehouse]);

  useEffect(() => {
    if (!organizationId) {
      setCanUseUpc(false);
      return;
    }
    const loadFeatureFlags = async () => {
      try {
        const res = await authFetch(`platform/organizations/${organizationId}/`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCanUseUpc(false);
          return;
        }
        setCanUseUpc(data?.subscription?.tariff_can_upc === true);
      } catch {
        setCanUseUpc(false);
      }
    };
    void loadFeatureFlags();
  }, [organizationId]);

  useEffect(() => {
    void loadMarkingUnits();
  }, [loadMarkingUnits]);

  const loadUnmarkedStock = useCallback(async () => {
    if (!organizationId || !warehouseId) return;
    setUnmarkedLoading(true);
    setUnmarkedError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(unmarkedPage));
      params.set("page_size", String(unmarkedPageSize));
      if (unmarkedDebouncedSearch.trim()) params.set("search", unmarkedDebouncedSearch.trim());

      const res = await authFetch(
        `platform/organizations/${organizationId}/warehouses/${warehouseId}/unmarked-stock/?${params.toString()}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "warehouses");
          setUnmarkedError("Нет доступа.");
          setUnmarkedRows([]);
          setUnmarkedTotalCount(0);
          setUnmarkedFilteredCount(0);
          return;
        }
        setUnmarkedError(typeof data.detail === "string" ? data.detail : "Ошибка загрузки");
        setUnmarkedRows([]);
        setUnmarkedTotalCount(0);
        setUnmarkedFilteredCount(0);
        return;
      }
      setUnmarkedRows(Array.isArray(data.results) ? data.results : []);
      setUnmarkedTotalCount(typeof data.total_count === "number" ? data.total_count : 0);
      setUnmarkedFilteredCount(typeof data.count === "number" ? data.count : 0);
    } catch (err) {
      setUnmarkedError(err.message ?? "Ошибка сети");
      setUnmarkedRows([]);
      setUnmarkedTotalCount(0);
      setUnmarkedFilteredCount(0);
    } finally {
      setUnmarkedLoading(false);
    }
  }, [
    organizationId,
    warehouseId,
    unmarkedPage,
    unmarkedPageSize,
    unmarkedDebouncedSearch,
    markForbiddenAppPage,
  ]);

  useEffect(() => {
    void loadUnmarkedStock();
  }, [loadUnmarkedStock]);

  useEffect(() => {
    if (filteredCount <= 0) return;
    const tp = Math.max(1, Math.ceil(filteredCount / pageSize));
    if (page > tp) setPage(tp);
  }, [filteredCount, page, pageSize]);
  useEffect(() => {
    if (unmarkedFilteredCount <= 0) return;
    const tp = Math.max(1, Math.ceil(unmarkedFilteredCount / unmarkedPageSize));
    if (unmarkedPage > tp) setUnmarkedPage(tp);
  }, [unmarkedFilteredCount, unmarkedPage, unmarkedPageSize]);

  useEffect(() => {
    if (rows.length === 0) return;
    setSelectedRowsByKey((prev) => {
      const next = new Map(prev);
      rows.forEach((row) => {
        const key = makeRowKey(row);
        if (!key || !selectedKeys.has(key)) return;
        next.set(key, row);
      });
      return next;
    });
  }, [rows, selectedKeys]);

  useEffect(() => {
    setSelectedRowsByKey((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map();
      prev.forEach((row, key) => {
        if (selectedKeys.has(key)) next.set(key, row);
      });
      return next;
    });
  }, [selectedKeys]);

  const keysOnPage = useMemo(
    () => rows.map((row) => makeRowKey(row)).filter((k) => k != null),
    [rows]
  );

  const markingDetailUrl = useCallback(
    (row) => {
      if (!organizationId || !row?.invoice_id || row?.line_id == null || row?.marking_index == null) return null;
      return `platform/organizations/${organizationId}/invoices/${row.invoice_id}/lines/${row.line_id}/markings/${row.marking_index}/`;
    },
    [organizationId]
  );

  const handleOpenEdit = (row) => {
    setEditRow(row);
    setEditMarkingCode(row.marking_code ?? "");
    setEditError("");
    setEditOpen(true);
  };

  const handleCloseEdit = () => {
    if (editSaving) return;
    setEditOpen(false);
    setEditRow(null);
    setEditError("");
  };

  const handleEditMarkingCodeChange = (e) => {
    setEditMarkingCode(e.target.value);
  };

  const handleSaveEdit = async () => {
    const url = markingDetailUrl(editRow);
    if (!url || !organizationId) return;
    setEditSaving(true);
    setEditError("");
    try {
      const body = {
        marking_code: editMarkingCode.trim(),
      };
      const res = await authFetch(url, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "warehouses");
        }
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : typeof data.detail === "object" && data.detail
              ? JSON.stringify(data.detail)
              : "Не удалось сохранить";
        setEditError(msg);
        return;
      }
      setEditOpen(false);
      setEditRow(null);
      await loadMarkingUnits();
    } catch (err) {
      setEditError(err.message ?? "Ошибка сети");
    } finally {
      setEditSaving(false);
    }
  };

  const handleOpenDelete = (row) => {
    setDeleteRow(row);
    setDeleteError("");
  };

  const handleCloseDelete = () => {
    if (deleteLoading) return;
    setDeleteRow(null);
    setDeleteError("");
  };

  const handleToggleRowSelect = (row) => {
    const k = makeRowKey(row);
    if (!k) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setSelectedRowsByKey((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else next.set(k, row);
      return next;
    });
  };

  const handleToggleSelectPage = () => {
    if (keysOnPage.length === 0) return;
    setSelectedKeys((prev) => {
      const allSelected = keysOnPage.every((k) => prev.has(k));
      const next = new Set(prev);
      if (allSelected) {
        keysOnPage.forEach((k) => next.delete(k));
      } else {
        keysOnPage.forEach((k) => next.add(k));
      }
      return next;
    });
    setSelectedRowsByKey((prev) => {
      const allSelected = keysOnPage.every((k) => selectedKeys.has(k));
      const next = new Map(prev);
      if (allSelected) {
        keysOnPage.forEach((k) => next.delete(k));
      } else {
        rows.forEach((row) => {
          const key = makeRowKey(row);
          if (!key) return;
          next.set(key, row);
        });
      }
      return next;
    });
  };

  const handleOpenExpense = () => {
    if (selectedKeys.size === 0) return;
    const selectedRows = [...selectedRowsByKey.entries()]
      .filter(([key]) => selectedKeys.has(key))
      .map(([, row]) => row)
      .filter(Boolean);
    if (selectedRows.length === 0) {
      setError("Не удалось собрать выбранные позиции. Выберите их повторно.");
      return;
    }
    navigate(`/app/warehouses/${warehouseId}/outgoing`, {
      state: {
        prefillRows: selectedRows,
      },
    });
  };

  const handleOpenUnmarkedExpense = (row) => {
    if (!row) return;
    const prefillItem = {
      our_name: row.our_name || "",
      ikpu_name: row.ikpu_name || "",
      ikpu_code: row.ikpu_code || "",
      upc: row.upc || "",
      unit: row.unit || "шт",
      quantity: 1,
      unit_price: 0,
      requires_marking: false,
      markings: [],
    };
    navigate(`/app/warehouses/${warehouseId}/outgoing`, {
      state: {
        prefillItems: [prefillItem],
      },
    });
  };

  const handleConfirmDelete = async () => {
    const url = markingDetailUrl(deleteRow);
    if (!url || !organizationId) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await authFetch(url, { method: "DELETE" });
      if (!res.ok) {
        if (res.status === 403) {
          markForbiddenAppPage?.(organizationId, "warehouses");
        }
        const data = await res.json().catch(() => ({}));
        setDeleteError(typeof data.detail === "string" ? data.detail : "Не удалось удалить");
        return;
      }
      setDeleteRow(null);
      await loadMarkingUnits();
    } catch (err) {
      setDeleteError(err.message ?? "Ошибка сети");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!organizationId) {
    return <p className="text-sm text-muted">Выберите организацию в контексте.</p>;
  }

  const titleName = warehouseLoading ? "…" : warehouseName || `Склад #${warehouseId}`;
  const totalPages = Math.max(1, Math.ceil(Math.max(filteredCount, 1) / pageSize));
  const showPagination = filteredCount > 0;
  const unmarkedTotalPages = Math.max(1, Math.ceil(Math.max(unmarkedFilteredCount, 1) / unmarkedPageSize));
  const showUnmarkedPagination = unmarkedFilteredCount > unmarkedPageSize;

  const handleSearchChange = (e) => {
    setPage(1);
    setSearch(e.target.value);
  };
  const handleUnmarkedSearchChange = (e) => {
    setUnmarkedPage(1);
    setUnmarkedSearch(e.target.value);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="space-y-3">
        <div>
          <Link to="/app/warehouses" className="text-sm font-medium text-primary hover:underline">
            ← Склады компании
          </Link>
          <h1 className="text-xl font-semibold text-muted tracking-tight mt-2">{titleName}</h1>
          {section === "marked" ? (
            <p className="text-sm text-muted/75 mt-1">
              Маркировки из утверждённых приходов: одна строка — один код. Отметьте позиции и нажмите «Расход»,
              чтобы открыть расходную счёт‑фактуру с готовыми товарами и выбранными маркировками.
            </p>
          ) : (
            <p className="text-sm text-muted/75 mt-1">
              Остатки товаров без маркировки: приход минус расход по количеству.
            </p>
          )}
          {!rowsLoading && rows.length === 0 && totalCount === 0 ? null : (
            <p className="text-sm font-medium text-muted mt-2" aria-live="polite">
              Всего единиц учёта на складе: {rowsLoading ? "…" : totalCount}
              {debouncedSearch.trim() && !rowsLoading ? (
                <span className="text-muted/80 font-normal">
                  {" "}
                  · по запросу найдено: {filteredCount}
                </span>
              ) : null}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/app/warehouses/${warehouseId}/marked`}
            className={`px-3 py-2 rounded-lg border text-sm transition ${
              section === "marked"
                ? "border-primary bg-primary text-white"
                : "border-border text-muted hover:bg-secondary"
            }`}
            aria-label="Страница товаров с маркировкой"
          >
            С маркировкой
          </Link>
          <Link
            to={`/app/warehouses/${warehouseId}/unmarked`}
            className={`px-3 py-2 rounded-lg border text-sm transition ${
              section === "unmarked"
                ? "border-primary bg-primary text-white"
                : "border-border text-muted hover:bg-secondary"
            }`}
            aria-label="Страница товаров без маркировки"
          >
            Без маркировки
          </Link>
        </div>
      </div>

      {section !== "unmarked" ? (
      <div className="rounded-xl border border-border bg-white p-4 shadow-soft space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="wh-stock-search" className="block text-xs font-medium text-muted/80 mb-1">
              Поиск по коду маркировки, наименованию, ИКПУ{canUseUpc ? ", UPC" : ""}
            </label>
            <input
              id="wh-stock-search"
              type="search"
              value={search}
              onChange={handleSearchChange}
              placeholder={canUseUpc ? "Код, наименование, ИКПУ, UPC…" : "Код, наименование ИКПУ…"}
              className={INPUT_CLASS}
              aria-label={canUseUpc ? "Поиск по коду маркировки, наименованию, ИКПУ или UPC" : "Поиск по коду маркировки, наименованию или ИКПУ"}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={handleOpenExpense}
            disabled={rowsLoading || selectedKeys.size === 0}
            className="shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Открыть расходную счёт‑фактуру по выбранным единицам"
          >
            Расход{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ""}
          </button>
        </div>

        {error ? (
          <p className="text-sm text-red-800 bg-red-50/80 border border-red-200/70 rounded-lg px-4 py-2.5" role="alert">
            {error}
          </p>
        ) : null}

        {rowsLoading ? (
          <p className="text-sm text-muted/75 py-6">Загрузка…</p>
        ) : totalCount === 0 ? (
          <div className="rounded-lg border border-border/60 bg-neutral-50/50 p-6 text-sm text-muted/80">
            <p>
              Нет кодов маркировки по этому складу. Они появляются после утверждения счёт-фактур прихода, в которых для
              позиций указаны коды маркировки.
            </p>
          </div>
        ) : filteredCount === 0 ? (
          <p className="text-sm text-muted/75 py-6">Ничего не найдено по запросу.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold text-muted/70 bg-neutral-50/90">
                  <th className="py-2.5 px-2 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={keysOnPage.length > 0 && keysOnPage.every((k) => selectedKeys.has(k))}
                      onChange={handleToggleSelectPage}
                      disabled={rowsLoading || keysOnPage.length === 0}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      aria-label="Выбрать все на странице"
                    />
                  </th>
                  <th className="py-2.5 px-3">Код маркировки</th>
                  <th className="py-2.5 px-3 w-[88px]">Data Matrix</th>
                  <th className="py-2.5 px-3 w-[88px]">Фото</th>
                  <th className="py-2.5 px-3">Наименование</th>
                  <th className="py-2.5 px-3">ИКПУ</th>
                  {canUseUpc ? <th className="py-2.5 px-3">UPC</th> : null}
                  <th className="py-2.5 px-3">Договор</th>
                  <th className="py-2.5 px-3">Счёт-фактура</th>
                  <th className="py-2.5 px-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const name =
                    row.our_name?.trim() ||
                    row.ikpu_name?.trim() ||
                    "—";
                  const key = `${row.invoice_id}-${row.line_id}-${row.marking_index ?? idx}-${row.marking_code}`;
                  const canMutate = row.marking_index != null && markingDetailUrl(row);
                  const rk = makeRowKey(row);
                  const isSelected = rk != null && selectedKeys.has(rk);
                  return (
                    <tr key={key} className="border-b border-border/60 hover:bg-secondary/40">
                      <td className="py-2 px-2 align-middle text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRowSelect(row)}
                          disabled={!canMutate || rowsLoading}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          aria-label={`Выбрать позицию ${row.marking_code ?? ""}`}
                        />
                      </td>
                      <td className="py-2 px-3 font-mono text-xs align-top break-all max-w-[14rem]">
                        {row.marking_code}
                      </td>
                      <td className="py-2 px-3 align-middle">
                        <MarkingQrCell value={row.marking_code} />
                      </td>
                      <td className="py-2 px-3 align-middle">
                        <ProductPhotoCell url={row.product_image_url} label={name} />
                      </td>
                      <td className="py-2 px-3 align-top max-w-[16rem]">
                        <span className="font-medium text-muted">{name}</span>
                        {row.ikpu_name && row.our_name ? (
                          <span className="block text-xs text-muted/70 mt-0.5">{row.ikpu_name}</span>
                        ) : null}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs align-top">{row.ikpu_code || "—"}</td>
                      {canUseUpc ? (
                        <td className="py-2 px-3 font-mono text-xs align-top">{row.upc || "—"}</td>
                      ) : null}
                      <td className="py-2 px-3 align-top text-muted">
                        <Link
                          to={`/app/invoices/${row.invoice_id}`}
                          className="text-primary font-medium hover:underline inline-block max-w-[14rem]"
                          aria-label={`Открыть счёт‑фактуру по договору ${row.contract_number || row.invoice_id}`}
                        >
                          <span className="break-words">{row.contract_number || "—"}</span>
                          {row.contract_date ? (
                            <span className="block text-xs text-muted/80 font-normal mt-0.5">
                              от {formatDate(row.contract_date)}
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="py-2 px-3 align-top">
                        <Link
                          to={`/app/invoices/${row.invoice_id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          № {row.invoice_id}
                        </Link>
                      </td>
                      <td className="py-2 px-3 align-top text-right whitespace-nowrap">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={!canMutate}
                            onClick={() => handleOpenEdit(row)}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-white text-muted hover:bg-secondary hover:text-primary disabled:opacity-40 disabled:pointer-events-none"
                            aria-label="Редактировать позицию"
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            disabled={!canMutate}
                            onClick={() => handleOpenDelete(row)}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-200 bg-red-50 text-red-800 hover:bg-red-100 disabled:opacity-40 disabled:pointer-events-none"
                            aria-label="Удалить позицию"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {showPagination && !rowsLoading && totalCount > 0 && filteredCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
            <p className="text-xs text-muted/70">
              {debouncedSearch.trim() ? `Найдено: ${filteredCount} · ` : ""}
              страница {page} из {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-sm rounded-lg border border-border bg-white disabled:opacity-40"
                aria-label="Предыдущая страница"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm rounded-lg border border-border bg-white disabled:opacity-40"
                aria-label="Следующая страница"
              >
                Вперёд
              </button>
            </div>
          </div>
        ) : null}
      </div>
      ) : null}

      {section !== "marked" ? (
      <div className="rounded-xl border border-border bg-white p-4 shadow-soft space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-muted">Товары без маркировки</h2>
            <p className="text-sm text-muted/75 mt-1">
              Здесь показываются остатки по позициям без кодов маркировки: приход − расход.
            </p>
          </div>
          <div className="w-full sm:w-auto min-w-[220px]">
            <label htmlFor="wh-unmarked-search" className="block text-xs font-medium text-muted/80 mb-1">
              Поиск по наименованию, ИКПУ{canUseUpc ? ", UPC" : ""}
            </label>
            <input
              id="wh-unmarked-search"
              type="search"
              value={unmarkedSearch}
              onChange={handleUnmarkedSearchChange}
              placeholder={canUseUpc ? "Наименование, ИКПУ, UPC…" : "Наименование, ИКПУ…"}
              className={INPUT_CLASS}
              aria-label={canUseUpc ? "Поиск товаров без маркировки по наименованию, ИКПУ или UPC" : "Поиск товаров без маркировки по наименованию или ИКПУ"}
              autoComplete="off"
            />
          </div>
        </div>

        {unmarkedError ? (
          <p className="text-sm text-red-800 bg-red-50/80 border border-red-200/70 rounded-lg px-4 py-2.5" role="alert">
            {unmarkedError}
          </p>
        ) : null}

        {unmarkedLoading ? (
          <p className="text-sm text-muted/75 py-6">Загрузка…</p>
        ) : unmarkedTotalCount === 0 ? (
          <p className="text-sm text-muted/75 py-6">Нет остатков товаров без маркировки.</p>
        ) : unmarkedFilteredCount === 0 ? (
          <p className="text-sm text-muted/75 py-6">Ничего не найдено по запросу.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold text-muted/70 bg-neutral-50/90">
                  <th className="py-2.5 px-3 w-[88px]">Фото</th>
                  <th className="py-2.5 px-3">Наименование</th>
                  <th className="py-2.5 px-3">ИКПУ</th>
                  {canUseUpc ? <th className="py-2.5 px-3">UPC</th> : null}
                  <th className="py-2.5 px-3">Ед. изм.</th>
                  <th className="py-2.5 px-3 text-right">Остаток</th>
                  <th className="py-2.5 px-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {unmarkedRows.map((row, idx) => {
                  const name = row.our_name?.trim() || row.ikpu_name?.trim() || "—";
                  const key = `${row.catalog_product_id || "raw"}-${row.ikpu_code || ""}-${row.upc || ""}-${idx}`;
                  return (
                    <tr key={key} className="border-b border-border/60 hover:bg-secondary/40">
                      <td className="py-2 px-3 align-middle">
                        <ProductPhotoCell url={row.product_image_url} label={name} />
                      </td>
                      <td className="py-2 px-3 align-top max-w-[16rem]">
                        <span className="font-medium text-muted">{name}</span>
                        {row.ikpu_name && row.our_name ? (
                          <span className="block text-xs text-muted/70 mt-0.5">{row.ikpu_name}</span>
                        ) : null}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs align-top">{row.ikpu_code || "—"}</td>
                      {canUseUpc ? (
                        <td className="py-2 px-3 font-mono text-xs align-top">{row.upc || "—"}</td>
                      ) : null}
                      <td className="py-2 px-3 align-top">{row.unit || "шт"}</td>
                      <td className="py-2 px-3 align-top text-right font-semibold">{row.quantity ?? 0}</td>
                      <td className="py-2 px-3 align-top text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenUnmarkedExpense(row)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                          aria-label={`Сделать расход по товару ${name}`}
                        >
                          Расход
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {showUnmarkedPagination && !unmarkedLoading && unmarkedTotalCount > 0 && unmarkedFilteredCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
            <p className="text-xs text-muted/70">
              {unmarkedDebouncedSearch.trim() ? `Найдено: ${unmarkedFilteredCount} · ` : ""}
              страница {unmarkedPage} из {unmarkedTotalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={unmarkedPage <= 1}
                onClick={() => setUnmarkedPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-sm rounded-lg border border-border bg-white disabled:opacity-40"
                aria-label="Предыдущая страница товаров без маркировки"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={unmarkedPage >= unmarkedTotalPages}
                onClick={() => setUnmarkedPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm rounded-lg border border-border bg-white disabled:opacity-40"
                aria-label="Следующая страница товаров без маркировки"
              >
                Вперёд
              </button>
            </div>
          </div>
        ) : null}
      </div>
      ) : null}

      {editOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wh-stock-edit-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-lg p-5 space-y-4">
            <h2 id="wh-stock-edit-title" className="text-lg font-semibold text-muted">
              Редактирование кода маркировки
            </h2>
            <p className="text-xs text-muted/70">Счёт‑фактура № {editRow?.invoice_id}.</p>
            {editError ? (
              <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2" role="alert">
                {editError}
              </p>
            ) : null}
            <div>
              <label htmlFor="wh-edit-code" className="block text-xs font-medium text-muted/80 mb-1">
                Код маркировки
              </label>
              <input
                id="wh-edit-code"
                type="text"
                value={editMarkingCode}
                onChange={handleEditMarkingCodeChange}
                className={INPUT_CLASS}
                autoComplete="off"
                aria-label="Код маркировки"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={editSaving || !editMarkingCode.trim()}
                onClick={handleSaveEdit}
                className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-50"
              >
                {editSaving ? "Сохранение…" : "Сохранить"}
              </button>
              <button
                type="button"
                disabled={editSaving}
                onClick={handleCloseEdit}
                className="px-4 py-2.5 rounded-lg border border-border text-muted text-sm hover:bg-secondary"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wh-stock-del-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-lg p-5 space-y-4">
            <h2 id="wh-stock-del-title" className="text-lg font-semibold text-muted">
              Удалить единицу учёта?
            </h2>
            <p className="text-sm text-muted/80">
              Код <span className="font-mono text-xs">{deleteRow.marking_code}</span> будет удалён из счёт‑фактуры №{" "}
              {deleteRow.invoice_id}. Количество и суммы по строке пересчитаются.
            </p>
            {deleteError ? (
              <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDelete}
                className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Удаление…" : "Удалить"}
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleCloseDelete}
                className="px-4 py-2.5 rounded-lg border border-border text-muted text-sm hover:bg-secondary"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const CompanyWarehouseMarkedStockPage = () => <CompanyWarehouseStock section="marked" />;
export const CompanyWarehouseUnmarkedStockPage = () => <CompanyWarehouseStock section="unmarked" />;

export default CompanyWarehouseStock;
