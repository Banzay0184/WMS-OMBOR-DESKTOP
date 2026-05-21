import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "../api/client";

const ORG_ADMIN_ROLE_CODES = ["organization_owner", "organization_admin"];

/**
 * Права текущего пользователя в организации (me/permissions).
 */
export const useOrganizationMemberPermissions = (organizationId) => {
  const [permissions, setPermissions] = useState([]);
  const [roleCode, setRoleCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) {
      setPermissions([]);
      setRoleCode("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`platform/organizations/${organizationId}/me/permissions/`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPermissions([]);
        setRoleCode("");
        setError(typeof data.detail === "string" ? data.detail : "Не удалось загрузить права");
        return;
      }
      setPermissions(Array.isArray(data?.permissions) ? data.permissions : []);
      setRoleCode(String(data?.role?.code || ""));
    } catch (err) {
      setPermissions([]);
      setRoleCode("");
      setError(err.message ?? "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOrgAdmin = ORG_ADMIN_ROLE_CODES.includes(roleCode);

  const canViewStock = useMemo(
    () => isOrgAdmin || permissions.includes("stock.view"),
    [isOrgAdmin, permissions]
  );

  const canViewWarehouse = useMemo(
    () => isOrgAdmin || permissions.includes("warehouse.view"),
    [isOrgAdmin, permissions]
  );

  const canLoadWarehouseStock = canViewStock || canViewWarehouse;

  const has = useCallback((code) => permissions.includes(code), [permissions]);

  return {
    permissions,
    roleCode,
    isOrgAdmin,
    loading,
    error,
    reload: load,
    has,
    canViewStock,
    canViewWarehouse,
    canLoadWarehouseStock,
    canAdjustStock: isOrgAdmin || permissions.includes("stock.adjust"),
    canCreateSales: isOrgAdmin || permissions.includes("sales.create"),
  };
};
