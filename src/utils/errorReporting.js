import { API_URL } from "../config";

const STORAGE_ACCESS_KEY = "accessToken";
const REPORT_ENDPOINT = `${API_URL.replace(/\/$/, "")}/platform/error-log/report/`;
const DEDUP_WINDOW_MS = 60000;
const recentlyReported = new Map();

const SENSITIVE_KEY_RE = /(password|passwd|token|secret|access|refresh|authorization|card[_-]?number|cvv|cvc)/i;

/** Клиентская санитизация (защита в глубину — бэкенд тоже вычищает конфиденциальные поля). */
const sanitizePayload = (data, depth = 0) => {
  if (depth > 6 || data == null) return data ?? null;
  if (Array.isArray(data)) return data.slice(0, 200).map((v) => sanitizePayload(v, depth + 1));
  if (typeof data === "object") {
    const out = {};
    for (const [key, value] of Object.entries(data)) {
      out[key] = SENSITIVE_KEY_RE.test(key) ? "***REDACTED***" : sanitizePayload(value, depth + 1);
    }
    return out;
  }
  if (typeof data === "string") return data.slice(0, 4000);
  return data;
};

const detectOS = (ua) => {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  return "Unknown";
};

const detectBrowser = (ua) => {
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
  return ua.slice(0, 100);
};

/** Пропускаем повторный отчёт о ТОЙ ЖЕ ошибке чаще раза в минуту — группировка на бэкенде всё равно есть, но так не заливаем сеть при шторме одной и той же ошибки рендера. */
const shouldSkipDuplicate = (key) => {
  const now = Date.now();
  const last = recentlyReported.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentlyReported.set(key, now);
  if (recentlyReported.size > 500) {
    const cutoff = now - DEDUP_WINDOW_MS;
    for (const [k, ts] of recentlyReported) {
      if (ts < cutoff) recentlyReported.delete(k);
    }
  }
  return false;
};

/**
 * Отправляет ошибку в централизованный журнал (Панель разработчика → Журнал ошибок).
 * Никогда не бросает и не блокирует вызывающий код — используется из ErrorBoundary,
 * window.onerror/unhandledrejection и authFetch. Раздельно от authFetch (сырой fetch),
 * чтобы не зациклиться, если сам authFetch и есть источник ошибки.
 */
export const reportError = ({
  message,
  stackTrace = "",
  module: moduleName = "",
  page,
  url,
  httpMethod = "",
  httpStatus = null,
  level = "error",
  requestPayload = null,
} = {}) => {
  try {
    if (!message) return;
    const dedupKey = `${moduleName}|${message}`.slice(0, 300);
    if (shouldSkipDuplicate(dedupKey)) return;

    const token = localStorage.getItem(STORAGE_ACCESS_KEY);
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const body = JSON.stringify({
      message: String(message).slice(0, 8000),
      stack_trace: String(stackTrace || "").slice(0, 20000),
      module: moduleName,
      page: page ?? (typeof window !== "undefined" ? window.location.pathname : ""),
      url: url ?? (typeof window !== "undefined" ? window.location.href : ""),
      http_method: httpMethod,
      http_status: httpStatus,
      level,
      request_payload: requestPayload ? sanitizePayload(requestPayload) : null,
      browser: detectBrowser(ua),
      os: detectOS(ua),
      app_version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "",
    });

    // fire-and-forget: не await, не пробрасываем ошибку дальше.
    fetch(REPORT_ENDPOINT, { method: "POST", headers, body, keepalive: true }).catch(() => {});
  } catch {
    // Журналирование не должно ронять приложение.
  }
};

export const reportApiError = (targetUrl, method, httpStatus, message) => {
  reportError({
    message: message || `HTTP ${httpStatus} on ${method} ${targetUrl}`,
    module: "api",
    url: targetUrl,
    httpMethod: method,
    httpStatus,
    level: httpStatus >= 500 ? "error" : "warning",
  });
};

let globalHandlersInstalled = false;

/**
 * Ловит необработанные JS-исключения и unhandled promise rejection — вне React-дерева
 * (ErrorBoundary их не видит) и вне authFetch (например, ошибка стороннего кода:
 * парсинг Excel, работа с файлами и т.п.). Вызывается один раз при старте приложения.
 */
export const installGlobalErrorHandlers = () => {
  if (globalHandlersInstalled || typeof window === "undefined") return;
  globalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    reportError({
      message: event?.message || "Unknown error",
      stackTrace: event?.error?.stack || "",
      module: "window.onerror",
      level: "error",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    reportError({
      message: reason?.message || String(reason || "Unhandled promise rejection"),
      stackTrace: reason?.stack || "",
      module: "unhandledrejection",
      level: "error",
    });
  });
};
