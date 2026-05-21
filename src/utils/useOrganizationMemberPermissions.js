import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../api/client";

/**
 * Права текущего пользователя в организации (me/permissions).
 */
export const useOrganizationMemberPermissions = (organizationId) => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) {
      setPermissions([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/me/permissions/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPermissions([]);
        setError(typeof data.detail === "string" ? data.detail : "Не удалось загрузить права");
        return;
      }
      setPermissions(Array.isArray(data?.permissions) ? data.permissions : []);
    } catch (err) {
      setPermissions([]);
      setError(err.message ?? "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const has = useCallback((code) => permissions.includes(code), [permissions]);

  return {
    permissions,
    loading,
    error,
    reload: load,
    has,
    canViewStock: permissions.includes("stock.view"),
    canAdjustStock: permissions.includes("stock.adjust"),
    canCreateSales: permissions.includes("sales.create"),
    canViewWarehouse: permissions.includes("warehouse.view"),
  };
};
