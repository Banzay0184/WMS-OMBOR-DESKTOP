import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { zonesForOrganization, resolveSingleContextTarget } from "../utils/contextZones";

const PosContextRedirect = ({ organizationId, setActiveContext }) => {
  useEffect(() => {
    setActiveContext("pos", organizationId);
  }, [organizationId, setActiveContext]);
  return <Navigate to="/pos" replace />;
};

/**
 * Защита маршрутов на фронте — только для UX (навигация, куда показывать экран).
 * Это НЕ безопасность: любой может вызвать API из DevTools. Настоящая защита —
 * на бэкенде: DRF permission checks в начале view до бизнес-логики.
 *
 * requireContext="platform"   → зона /panel: пользователь должен быть is_staff/is_superuser и выбран контекст «Платформа».
 * requireContext="organization" → зона /app: выбран контекст «Компания» (activeContext.organizationId).
 * Без requireContext → только аутентификация (например для /select-context).
 */
const ProtectedRoute = ({ children, requireContext }) => {
  const {
    isAuthenticated,
    isDeveloper,
    isSuperAdmin,
    activeContext,
    availableContexts,
    fetchContexts,
    authReady,
    setActiveContext,
  } = useAuth();
  const [checkingContexts, setCheckingContexts] = useState(false);

  /**
   * Refresh-safe guard:
   * - на первом рендере после refresh activeContext может быть null (ещё не выбран или был очищен)
   * - не редиректим сразу на /select-context, пока не попробуем загрузить me/contexts
   * - если контекст ровно один — выбираем его автоматически
   */
  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) return;
    if (!requireContext) return;
    if (activeContext) return;
    let cancelled = false;
    setCheckingContexts(true);
    fetchContexts()
      .then((data) => {
        if (cancelled) return;
        const singleTarget = resolveSingleContextTarget(data);
        if (!singleTarget) return;

        if (singleTarget.type === "platform") {
          setActiveContext("platform");
          return;
        }
        if (singleTarget.type === "pos") {
          setActiveContext("pos", singleTarget.organizationId);
          return;
        }
        setActiveContext("organization", singleTarget.organizationId);
      })
      .finally(() => {
        if (!cancelled) setCheckingContexts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthenticated, requireContext, activeContext, fetchContexts, setActiveContext]);

  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) return;
    if (requireContext !== "organization") return;
    if (activeContext?.type !== "organization") return;
    if (availableContexts !== null) return;
    let cancelled = false;
    setCheckingContexts(true);
    fetchContexts()
      .finally(() => {
        if (!cancelled) setCheckingContexts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    isAuthenticated,
    requireContext,
    activeContext?.type,
    activeContext?.organizationId,
    availableContexts,
    fetchContexts,
  ]);

  /** Refresh: activeContext уже в localStorage, но каталог контекстов ещё не подгружен. */
  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) return;
    if (!requireContext) return;
    if (availableContexts !== null) return;

    const contextMatchesRoute =
      (requireContext === "pos" && activeContext?.type === "pos") ||
      (requireContext === "platform" && activeContext?.type === "platform") ||
      (requireContext === "organization" && activeContext?.type === "organization");

    if (!contextMatchesRoute) return;

    let cancelled = false;
    setCheckingContexts(true);
    fetchContexts()
      .finally(() => {
        if (!cancelled) setCheckingContexts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    isAuthenticated,
    requireContext,
    activeContext?.type,
    activeContext?.organizationId,
    availableContexts,
    fetchContexts,
  ]);

  if (!authReady) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const contextMatchesRoute =
    (requireContext === "pos" && activeContext?.type === "pos") ||
    (requireContext === "platform" && activeContext?.type === "platform") ||
    (requireContext === "organization" && activeContext?.type === "organization");

  const shouldWaitForContextResolution =
    Boolean(requireContext) &&
    !activeContext &&
    (checkingContexts || availableContexts === null);
  const shouldWaitForContextCatalog =
    Boolean(requireContext) && contextMatchesRoute && availableContexts === null;
  const shouldWaitForOrganizationContexts =
    requireContext === "organization" &&
    activeContext?.type === "organization" &&
    availableContexts === null;
  if (
    shouldWaitForContextResolution ||
    shouldWaitForContextCatalog ||
    shouldWaitForOrganizationContexts
  ) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted" role="status">
        Загрузка…
      </div>
    );
  }

  if (requireContext === "platform") {
    if (!isDeveloper || activeContext?.type !== "platform") {
      return <Navigate to="/select-context" replace />;
    }
    if (availableContexts === null) {
      return (
        <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted" role="status">
          Загрузка…
        </div>
      );
    }
  }

  if (requireContext === "organization") {
    if (activeContext?.type === "pos") {
      return <Navigate to="/pos" replace />;
    }
    if (activeContext?.type !== "organization") {
      return <Navigate to="/select-context" replace />;
    }
    const id = activeContext?.organizationId;
    if (id == null) {
      return <Navigate to="/select-context" replace />;
    }
    if (!isSuperAdmin) {
      const orgs = availableContexts?.organizations;
      if (checkingContexts) {
        return (
          <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted" role="status">
            Загрузка…
          </div>
        );
      }
      if (!Array.isArray(orgs)) {
        return <Navigate to="/select-context" replace />;
      }
      const match = orgs.find((o) => Number(o.id) === Number(id));
      if (!match) {
        return <Navigate to="/select-context" replace state={{ reason: "context_unavailable" }} />;
      }
      const zones = zonesForOrganization(match);
      if (!zones.includes("app")) {
        if (zones.includes("pos")) {
          return <PosContextRedirect organizationId={id} setActiveContext={setActiveContext} />;
        }
        return <Navigate to="/select-context" replace state={{ reason: "context_unavailable" }} />;
      }
    }
    // is_super_admin: доступ к /app любой организации по ID, без проверки членства —
    // нужно «режиму разработчика» (корректировка накладных чужих организаций).
    // Настоящая защита — на бэкенде (DRF permission classes), это только UX-навигация.
  }

  if (requireContext === "pos") {
    if (activeContext?.type !== "pos") {
      return <Navigate to="/select-context" replace />;
    }
    const id = activeContext?.organizationId;
    if (id == null) {
      return <Navigate to="/select-context" replace />;
    }
    if (availableContexts === null || checkingContexts) {
      return (
        <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted" role="status">
          Загрузка…
        </div>
      );
    }
    const orgs = availableContexts?.organizations;
    if (!Array.isArray(orgs)) {
      return <Navigate to="/select-context" replace />;
    }
    const match = orgs.find((o) => Number(o.id) === Number(id));
    if (!match || !zonesForOrganization(match).includes("pos")) {
      return <Navigate to="/select-context" replace state={{ reason: "context_unavailable" }} />;
    }
  }

  return children;
};

export default ProtectedRoute;
