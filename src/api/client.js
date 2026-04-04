import { API_URL } from "../config";

const STORAGE_ACCESS_KEY = "accessToken";
const STORAGE_REFRESH_KEY = "refreshToken";

let onUnauthorized = () => {};
/** После первого 401/403 не отправляем новые защищённые запросы на сервер до следующего входа. */
let sessionInvalidated = false;
/** Одна общая операция refresh: параллельные запросы ждут её вместо отправки с истёкшим токеном. */
let refreshPromise = null;

/**
 * Регистрирует callback при 401/403 (сессия недействительна).
 * Вызывается из AuthProvider при монтировании.
 */
export const setOnUnauthorized = (callback) => {
  onUnauthorized = typeof callback === "function" ? callback : () => {};
};

/** Сбросить флаг недействительной сессии (вызывать при успешном логине). */
export const clearSessionInvalidated = () => {
  sessionInvalidated = false;
};

/**
 * Возвращает заголовки с токеном для защищённых запросов.
 * Токен — кэш; реальный доступ решает бэкенд.
 */
export const getAuthHeaders = () => {
  const token = localStorage.getItem(STORAGE_ACCESS_KEY);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

/**
 * Проверяет, истёк ли access-токен (по полю exp в payload). Запас 10 с до фактического истечения.
 */
const isAccessTokenExpired = (token) => {
  if (!token || typeof token !== "string") return true;
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const decoded = JSON.parse(atob(payload));
    if (!decoded || typeof decoded.exp !== "number") return false;
    return decoded.exp * 1000 < Date.now() + 10000;
  } catch {
    return true;
  }
};

/**
 * Обновляет access token по refresh token. Возвращает новый access или null при ошибке.
 */
const doRefreshAccessToken = async () => {
  const refresh = localStorage.getItem(STORAGE_REFRESH_KEY);
  if (!refresh) return null;
  const baseUrl = `${API_URL.replace(/\/$/, "")}/token/refresh/`;
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  const access = data?.access;
  if (access) {
    localStorage.setItem(STORAGE_ACCESS_KEY, access);
    return access;
  }
  return null;
};

/**
 * Одна общая операция refresh: если уже идёт — ждём её, иначе запускаем. Возвращает новый access или null.
 */
const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = doRefreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

/**
 * Проверяет, требует ли URL обязательной авторизации (platform, me).
 */
const isProtectedPath = (path) => {
  const normalized = typeof path === "string" ? path.replace(/^\//, "") : "";
  return normalized.startsWith("platform/") || normalized.startsWith("me/");
};

/**
 * fetch с подстановкой Authorization, обработкой 401/403 и попыткой refresh при 401.
 * При 401: один раз вызывается refresh; при успехе — повтор запроса; иначе onUnauthorized.
 * При 403 сразу onUnauthorized (без refresh).
 * Если путь защищённый (platform/, me/) и токена нет — запрос не отправляется, вызывается onUnauthorized, возвращается синтетический 401.
 * Используйте для всех защищённых запросов.
 *
 * Безопасность обеспечивает бэкенд: permission checks в DRF до выполнения логики.
 * Frontend route guard — навигация; backend permission guard — безопасность.
 */
export const authFetch = async (url, options = {}, isRetry = false) => {
  const authHeaders = getAuthHeaders();
  const hasToken = !!authHeaders.Authorization;

  if (isProtectedPath(url) && !isRetry) {
    if (!hasToken) {
      onUnauthorized();
      return new Response(JSON.stringify({ detail: "Требуется авторизация." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (sessionInvalidated) {
      return new Response(JSON.stringify({ detail: "Сессия недействительна." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const token = localStorage.getItem(STORAGE_ACCESS_KEY);
    if (token && isAccessTokenExpired(token)) {
      const newAccess = await refreshAccessToken();
      if (newAccess) {
        const newHeaders = getAuthHeaders();
        const baseUrl = url.startsWith("http") ? url : `${API_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
        const isFormData = options.body instanceof FormData;
        const headers = {
          ...(isFormData ? {} : { "Content-Type": "application/json" }),
          ...newHeaders,
          ...options.headers,
        };
        const res = await fetch(baseUrl, { ...options, headers });
        // 401: сессия действительно недействительна (токен/авторизация).
        // 403: чаще всего просто нет прав на конкретное действие — не делаем logout.
        if (res.status === 401) {
          sessionInvalidated = true;
          onUnauthorized();
        }
        return res;
      }
      sessionInvalidated = true;
      onUnauthorized();
      return new Response(
        JSON.stringify({ detail: "Токен истёк. Войдите снова." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const baseUrl = url.startsWith("http") ? url : `${API_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...authHeaders,
    ...options.headers,
  };
  const response = await fetch(baseUrl, { ...options, headers });

  if (response.status === 401 && !isRetry) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      return authFetch(url, { ...options, headers: { ...options.headers, ...getAuthHeaders() } }, true);
    }
    sessionInvalidated = true;
    onUnauthorized();
    return response;
  }

  // 403: не инвалидация сессии (права отсутствуют), просто отдаём ответ в UI.
  if (response.status === 401) {
    sessionInvalidated = true;
    onUnauthorized();
  }
  return response;
};
