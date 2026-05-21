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
  /** true до первого ответа API — иначе canUseMarking=false на один кадр и ложный редирект на /unmarked */
  const [loading, setLoading] = useState(() => Boolean(organizationId));
  const [ready, setReady] = useState(() => !organizationId);

  const load = useCallback(async () => {
    if (!organizationId) {
      setFeatures(DEFAULT_FEATURES);
      setLoading(false);
      setReady(true);
      return;
    }
    setLoading(true);
    setReady(false);
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
      setReady(true);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...features, loading, ready, reload: load };
};
