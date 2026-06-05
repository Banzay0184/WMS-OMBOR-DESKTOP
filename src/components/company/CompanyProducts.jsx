import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { getImageUrl } from "../../config";
import { useOrganizationTariffFeatures } from "../../utils/useOrganizationTariffFeatures";
import { normalizeUpcDigits } from "../../utils/productLabelPrint";
import ProductLabelPrintModal from "./ProductLabelPrintModal";
import ProductLabelPrintSettingsPanel from "./ProductLabelPrintSettingsPanel";

const buildProductsSubtitle = ({ canUseIkpu, canUseUpc }) => {
  const parts = ["наше наименование", "ед. изм."];
  if (canUseIkpu) parts.splice(1, 0, "наименование по ИКПУ", "ИКПУ");
  if (canUseUpc) parts.splice(canUseIkpu ? 3 : 1, 0, "UPC");
  return `Справочник номенклатуры (${parts.join(", ")}) для накладных.`;
};

const INPUT_CLASS =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
const LABEL_CLASS = "block text-sm font-medium text-muted mb-1.5";

/** ИКПУ (УЗ): 17 цифр; пусто — допускается */
const normalizeIkpu = (value) => (value || "").replace(/\D/g, "");

const CompanyProducts = () => {
  const { activeContext, markForbiddenAppPage } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbiddenProducts, setForbiddenProducts] = useState(false);

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

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [printProduct, setPrintProduct] = useState(null);
  const [showLabelSettings, setShowLabelSettings] = useState(false);
  const [labelSettingsVersion, setLabelSettingsVersion] = useState(0);

  const { canUseUpc, canUseInvoiceIkpu } = useOrganizationTariffFeatures(organizationId);

  const moneyFmt = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

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
  }, [organizationId, loadProducts]);

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
  }, []);

  const openCreateModal = () => {
    if (!organizationId) return;
    if (forbiddenProducts) {
      setModalError("Нет прав.");
      return;
    }
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
    setModalImagePreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setModalLoading(false);
    setModalError("");
    setModalSuccess("");
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
    setShowModal(true);
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
      loadProducts();
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setDeleteLoading(false);
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

  if (loading) {
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
            onClick={openCreateModal}
            disabled={forbiddenProducts}
            className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Добавить товар"
          >
            Добавить
          </button>
        </div>
      </div>

      {canUseUpc && showLabelSettings ? (
        <ProductLabelPrintSettingsPanel
          organizationId={organizationId}
          onSettingsChange={() => setLabelSettingsVersion((v) => v + 1)}
        />
      ) : null}

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted shadow-sm">
          Нет товаров. Добавьте первый или заполните из накладной.
        </div>
      ) : (
        <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-sm font-medium text-muted w-24">Фото</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">Наше наименование</th>
                  {canUseInvoiceIkpu ? (
                    <>
                      <th className="px-4 py-3 text-sm font-medium text-muted">Наименование по ИКПУ</th>
                      <th className="px-4 py-3 text-sm font-medium text-muted">ИКПУ</th>
                    </>
                  ) : null}
                  {canUseUpc ? (
                    <th className="px-4 py-3 text-sm font-medium text-muted">UPC</th>
                  ) : null}
                  {canUseUpc ? (
                    <th className="px-4 py-3 text-sm font-medium text-muted">Розница</th>
                  ) : null}
                  <th className="px-4 py-3 text-sm font-medium text-muted">Ед. изм.</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 align-middle">
                      {getImageUrl(p.image) ? (
                        <img
                          src={getImageUrl(p.image)}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover border border-border bg-white"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg border border-dashed border-border bg-neutral-50" aria-hidden="true" />
                      )}
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
      )}

      {showModal ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h2 id="product-modal-title" className="text-lg font-medium text-muted mb-4">
              {modalMode === "create" ? "Новый товар" : "Редактировать товар"}
            </h2>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              <div>
                <label htmlFor="product-name" className={LABEL_CLASS}>
                  Наше наименование
                </label>
                <input
                  id="product-name"
                  type="text"
                  value={modalName}
                  disabled={modalLoading}
                  onChange={(e) => setModalName(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Например: Холодильник ABC-100"
                  aria-label="Наше наименование товара"
                  required
                />
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
                    disabled={modalLoading}
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
                    disabled={modalLoading}
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
                    disabled={modalLoading}
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
                  disabled={modalLoading}
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
                  disabled={modalLoading}
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
                  disabled={modalLoading}
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
                  disabled={modalLoading}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition disabled:opacity-50"
                >
                  {modalLoading ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  disabled={modalLoading}
                  onClick={resetModal}
                  className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>
            </form>
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

      {confirmDeleteId ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-product-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6">
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
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleteLoading}
                className="px-4 py-2.5 border border-border rounded-lg text-muted hover:bg-secondary hover:border-primary hover:text-primary transition disabled:opacity-50"
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

export default CompanyProducts;
