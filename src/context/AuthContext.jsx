import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authFetch, clearSessionInvalidated, setOnUnauthorized } from "../api/client";
import { prefetchLivenessModels } from "../utils/faceRecognition";
import { zonesForOrganization, resolveSingleContextTarget } from "../utils/contextZones";

const STORAGE_KEYS = {
  accessToken: "accessToken",
  refreshToken: "refreshToken",
  userProfile: "userProfile",
  activeContext: "activeContext",
  forbiddenAppPages: "forbiddenAppPages",
};
const EMPTY_CONTEXTS = { platform: false, organizations: [] };

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};

/**
 * Восстанавливаем сессию из localStorage только для UX (показать интерфейс сразу).
 * Источник истины — бэкенд: при первом защищённом запросе 401/403 → logout и редирект на /.
 */
const loadUserFromStorage = () => {
  try {
    const token = localStorage.getItem(STORAGE_KEYS.accessToken);
    const raw = localStorage.getItem(STORAGE_KEYS.userProfile);
    if (!token || !raw) return null;
    const user = JSON.parse(raw);
    return user && typeof user === "object" ? user : null;
  } catch {
    return null;
  }
};

const _normalizeOrgId = (raw) => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  return null;
};

const loadActiveContextFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.activeContext);
    if (!raw) return null;
    const ctx = JSON.parse(raw);
    if (!ctx || typeof ctx !== "object") return null;
    if (ctx.type === "platform") return { type: "platform" };
    if (ctx.type === "organization") {
      const id = _normalizeOrgId(ctx.organizationId);
      if (id != null) return { type: "organization", organizationId: id };
    }
    if (ctx.type === "pos") {
      const id = _normalizeOrgId(ctx.organizationId);
      if (id != null) return { type: "pos", organizationId: id };
    }
    return null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(loadUserFromStorage);
  const [activeContext, setActiveContextState] = useState(loadActiveContextFromStorage);
  /** Доступные контексты: с логина (available_contexts) или с GET /me/contexts/. */
  const [availableContexts, setAvailableContexts] = useState(null);
  const [contextsLoadError, setContextsLoadError] = useState(false);
  /** false до завершения инициализации (восстановление из localStorage), чтобы не редиректить на / до того, как узнаем про user. */
  const [authReady, setAuthReady] = useState(false);
  const contextsFetchRef = useRef(null);
  const [forbiddenAppPages, setForbiddenAppPages] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.forbiddenAppPages);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    setAuthReady(true);
  }, []);

  /**
   * Доступ к платформе: is_staff или is_superuser. Не путать с активным контекстом — пользователь может быть разработчиком и при этом работать в контексте компании.
   */
  const isDeveloper = useMemo(
    () => Boolean(user?.is_staff === true || user?.is_superuser === true),
    [user]
  );

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  /** Установить активный контекст и сохранить в localStorage. */
  const setActiveContext = useCallback((type, organizationId = null) => {
    let next;
    if (type === "platform") {
      next = { type: "platform" };
    } else if (type === "pos") {
      const id =
        organizationId != null && organizationId !== "" ? Number(organizationId) : null;
      next = { type: "pos", organizationId: id };
    } else {
      const id =
        organizationId != null && organizationId !== "" ? Number(organizationId) : null;
      next = { type: "organization", organizationId: id };
    }
    setActiveContextState(next);
    try {
      localStorage.setItem(STORAGE_KEYS.activeContext, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  /** Сбросить активный контекст (при логине с несколькими контекстами или смене пользователя). */
  const clearActiveContext = useCallback(() => {
    setActiveContextState(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.activeContext);
    } catch {
      // ignore
    }
  }, []);

  /** Полный сброс перед записью новой сессии: убивает класс багов «осталось от прошлого юзера». */
  const login = useCallback((userProfile, tokens, contexts = null) => {
    clearActiveContext();
    try {
      localStorage.removeItem(STORAGE_KEYS.accessToken);
      localStorage.removeItem(STORAGE_KEYS.refreshToken);
      localStorage.removeItem(STORAGE_KEYS.userProfile);
      localStorage.removeItem(STORAGE_KEYS.forbiddenAppPages);
    } catch {
      // ignore
    }
    setUser(null);
    setAvailableContexts(null);
    setContextsLoadError(false);
    setForbiddenAppPages({});

    clearSessionInvalidated();
    if (tokens.access) localStorage.setItem(STORAGE_KEYS.accessToken, tokens.access);
    if (tokens.refresh) localStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refresh);
    if (userProfile) localStorage.setItem(STORAGE_KEYS.userProfile, JSON.stringify(userProfile));
    setUser(userProfile ?? null);
    if (contexts && typeof contexts === "object") {
      setAvailableContexts({
        platform: Boolean(contexts.platform),
        organizations: Array.isArray(contexts.organizations) ? contexts.organizations : [],
      });
      setContextsLoadError(false);
    }
    prefetchLivenessModels();
  }, [clearActiveContext]);

  const logout = useCallback(() => {
    clearActiveContext();
    try {
      localStorage.removeItem(STORAGE_KEYS.accessToken);
      localStorage.removeItem(STORAGE_KEYS.refreshToken);
      localStorage.removeItem(STORAGE_KEYS.userProfile);
      localStorage.removeItem(STORAGE_KEYS.forbiddenAppPages);
    } catch {
      // ignore
    }
    setUser(null);
    setAvailableContexts(null);
    setContextsLoadError(false);
    setForbiddenAppPages({});
  }, [clearActiveContext]);

  const markForbiddenAppPage = useCallback((organizationId, pageKey) => {
    if (!organizationId || !pageKey) return;
    setForbiddenAppPages((prev) => {
      const orgKey = String(organizationId);
      const prevOrg = prev?.[orgKey];
      const nextOrg = { ...(prevOrg && typeof prevOrg === "object" ? prevOrg : {}) };
      nextOrg[pageKey] = true;
      const next = { ...(prev && typeof prev === "object" ? prev : {}) };
      next[orgKey] = nextOrg;
      try {
        localStorage.setItem(STORAGE_KEYS.forbiddenAppPages, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const clearForbiddenAppPage = useCallback((organizationId, pageKey) => {
    if (!organizationId || !pageKey) return;
    setForbiddenAppPages((prev) => {
      const orgKey = String(organizationId);
      const prevOrg = prev?.[orgKey];
      if (!prevOrg || typeof prevOrg !== "object" || !prevOrg?.[pageKey]) return prev;

      const nextOrg = { ...prevOrg };
      delete nextOrg[pageKey];

      const next = { ...(prev && typeof prev === "object" ? prev : {}) };
      if (Object.keys(nextOrg).length === 0) delete next[orgKey];
      else next[orgKey] = nextOrg;

      try {
        localStorage.setItem(STORAGE_KEYS.forbiddenAppPages, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const isAppPageForbidden = useCallback(
    (organizationId, pageKey) => {
      if (!organizationId || !pageKey) return false;
      const orgKey = String(organizationId);
      return Boolean(forbiddenAppPages?.[orgKey]?.[pageKey]);
    },
    [forbiddenAppPages]
  );

  /** Загрузить доступные контексты с бэкенда (для экрана выбора при отсутствии в state). */
  const fetchContexts = useCallback(async ({ force = false } = {}) => {
    if (!force && availableContexts !== null) {
      return {
        platform: availableContexts.platform,
        organizations: availableContexts.organizations,
      };
    }

    if (contextsFetchRef.current) {
      return contextsFetchRef.current;
    }

    const request = (async () => {
      try {
        const res = await authFetch("me/contexts/");
        const data = await res.json().catch(() => ({}));
        if (res.ok && data) {
          const normalized = {
            platform: Boolean(data.platform),
            organizations: Array.isArray(data.organizations) ? data.organizations : [],
          };
          setAvailableContexts(normalized);
          setContextsLoadError(false);
          return normalized;
        }
      } catch {
        // ignore
      }
      setAvailableContexts(EMPTY_CONTEXTS);
      setContextsLoadError(true);
      return null;
    })();

    contextsFetchRef.current = request;
    try {
      return await request;
    } finally {
      if (contextsFetchRef.current === request) {
        contextsFetchRef.current = null;
      }
    }
  }, [availableContexts]);

  /**
   * Восстановление контекста после refresh:
   * - если пользователь авторизован, но activeContext отсутствует (например, очищен или не был выбран),
   *   пытаемся подтянуть контексты и при ровно одном доступном контексте выбрать его автоматически.
   * Это убирает "вылет" на /select-context для пользователей с единственным контекстом.
   */
  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) return;
    if (activeContext) return;

    let cancelled = false;

    const applySingleContext = (data) => {
      if (cancelled || !data) return;
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
    };

    if (availableContexts !== null) {
      applySingleContext(availableContexts);
      return undefined;
    }

    fetchContexts().then(applySingleContext);
    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthenticated, activeContext, availableContexts, fetchContexts, setActiveContext]);

  /** После загрузки контекстов проверяем: текущий activeContext ещё входит в актуальный список? */
  useEffect(() => {
    if (!availableContexts || !activeContext) return;
    let invalid = false;
    if (activeContext.type === "platform") {
      if (!availableContexts.platform) invalid = true;
    } else if (activeContext.type === "organization") {
      const id = activeContext.organizationId;
      if (id == null) invalid = true;
      else if (Array.isArray(availableContexts.organizations)) {
        const match = availableContexts.organizations.find((o) => Number(o.id) === Number(id));
        if (!match || !zonesForOrganization(match).includes("app")) invalid = true;
      }
    } else if (activeContext.type === "pos") {
      const id = activeContext.organizationId;
      if (id == null) {
        invalid = true;
      } else if (Array.isArray(availableContexts.organizations)) {
        const match = availableContexts.organizations.find((o) => Number(o.id) === Number(id));
        if (!match || !zonesForOrganization(match).includes("pos")) invalid = true;
      }
    }
    if (invalid) clearActiveContext();
  }, [availableContexts, activeContext, clearActiveContext]);

  /** Обновить кэш профиля после редактирования (username, phone, image и т.д.). Сохраняет в state и localStorage. */
  const updateUser = useCallback((partial) => {
    if (!partial || typeof partial !== "object") return;
    setUser((prev) => {
      const next = prev ? { ...prev, ...partial } : partial;
      try {
        localStorage.setItem(STORAGE_KEYS.userProfile, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    prefetchLivenessModels();
  }, [authReady, isAuthenticated]);

  useEffect(() => {
    setOnUnauthorized(() => {
      logout();
      window.location.href = "/";
    });
    return () => setOnUnauthorized(() => {});
  }, [logout]);

  /** Токен хранится в localStorage; для защищённых запросов используется api/client. Доступ из контекста — по необходимости (например, передача в заголовках вне authFetch). */
  const getAccessToken = useCallback(() => localStorage.getItem(STORAGE_KEYS.accessToken), []);

  const value = useMemo(
    () => ({
      user,
      getAccessToken,
      isAuthenticated,
      isDeveloper,
      authReady,
      activeContext,
      setActiveContext,
      clearActiveContext,
      availableContexts,
      setAvailableContexts,
      fetchContexts,
      contextsLoadError,
      login,
      logout,
      updateUser,
      markForbiddenAppPage,
      clearForbiddenAppPage,
      isAppPageForbidden,
    }),
    [
      user,
      getAccessToken,
      isAuthenticated,
      isDeveloper,
      authReady,
      activeContext,
      setActiveContext,
      clearActiveContext,
      availableContexts,
      fetchContexts,
      contextsLoadError,
      login,
      logout,
      updateUser,
      markForbiddenAppPage,
      clearForbiddenAppPage,
      isAppPageForbidden,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
