import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../api/client";

/**
 * Возвращает флаги доступности функций тарифа для организации.
 * Если запрос упал/нет тарифа — все флаги false (минимальные права),
 * кроме `canUseWarehouseOutgoing`, который по умолчанию true (исторически тариф не ограничивал расход).
 */
const DEFAULT_FEATURES = {
  canUseUpc: false,
  canUseCurrency: false,
  canUseInvoiceContract: false,
  canUseInvoiceAccount: false,
  canUseInvoiceIkpu: false,
  canUseMarking: false,
  canUseWarehouseOutgoing: true,
};

export const useOrganizationTariffFeatures = (organizationId) => {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      setFeatures(DEFAULT_FEATURES);
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeatures(DEFAULT_FEATURES);
        return;
      }
      const sub = data?.subscription ?? {};
      setFeatures({
        canUseUpc: sub.tariff_can_upc === true,
        canUseCurrency: sub.tariff_can_currency === true,
        canUseInvoiceContract: sub.tariff_can_invoice_contract === true,
        canUseInvoiceAccount: sub.tariff_can_invoice_account === true,
        canUseInvoiceIkpu: sub.tariff_can_invoice_ikpu === true,
        canUseMarking: sub.tariff_can_marking === true,
        canUseWarehouseOutgoing: sub.tariff_can_warehouse_outgoing !== false,
      });
    } catch {
      setFeatures(DEFAULT_FEATURES);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...features, loading, reload: load };
};
