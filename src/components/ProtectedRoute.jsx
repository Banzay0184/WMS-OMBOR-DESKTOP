import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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
  const { isAuthenticated, isDeveloper, activeContext, availableContexts, fetchContexts, authReady, setActiveContext } =
    useAuth();
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
        const platform = Boolean(data?.platform);
        const organizations = Array.isArray(data?.organizations) ? data.organizations : [];
        const total = (platform ? 1 : 0) + organizations.length;
        if (total !== 1) return;
        if (platform) setActiveContext("platform");
        else if (organizations[0]?.id != null) setActiveContext("organization", organizations[0].id);
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
    let cancelled = false;
    setCheckingContexts(true);
    fetchContexts()
      .finally(() => {
        if (!cancelled) setCheckingContexts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthenticated, requireContext, activeContext?.organizationId, fetchContexts]);

  if (!authReady) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (requireContext === "platform") {
    if (!isDeveloper || activeContext?.type !== "platform") {
      return <Navigate to="/select-context" replace />;
    }
  }

  if (requireContext === "organization") {
    if (activeContext?.type !== "organization") {
      return <Navigate to="/select-context" replace />;
    }
    const id = activeContext?.organizationId;
    if (id == null) {
      return <Navigate to="/select-context" replace />;
    }
    const orgs = availableContexts?.organizations;
    if (checkingContexts) return null;
    if (!Array.isArray(orgs)) {
      return <Navigate to="/select-context" replace />;
    }
    if (Array.isArray(orgs) && !orgs.some((o) => o.id === id)) {
      return <Navigate to="/select-context" replace state={{ reason: "context_unavailable" }} />;
    }
  }

  return children;
};

export default ProtectedRoute;
