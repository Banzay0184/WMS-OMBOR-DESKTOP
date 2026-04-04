/**
 * Базовый URL API. Меняйте под окружение (dev/prod).
 */
import logo from "./assets/LOGO.png";
export const API_BASE_URL =
  // import.meta.env.VITE_API_URL ?? "https://api.wms-ombor.uz";
  import.meta.env.VITE_API_URL ?? "https://api.scclms.uz";


export const API_URL = `${API_BASE_URL.replace(/\/$/, "")}/api/v1/`;

/**
 * Возвращает абсолютный URL для фото профиля (из API или localStorage).
 * Если бэкенд вернул относительный путь (/media/... или users/...), запрос идёт на origin фронта и даёт 404 — подставляем API_BASE_URL.
 */
export const getImageUrl = (path) => {
  if (!path || typeof path !== "string") return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = API_BASE_URL.replace(/\/$/, "");
  return path.startsWith("/") ? base + path : base + "/media/" + path;
};

/**
 * Информация о компании (страница входа, подвал).
 */
export const COMPANY = {
  name: "ООО «AB labs innovation»",
  logo: logo,
  description: "Складской учёт и управление запасами",
  /** Ссылка для обратной связи (mailto, tel или страница) */
  feedbackUrl: "https://t.me/abidov_0184",
  feedbackLabel: "Обратная связь",
  /** Доп. контакт (телефон, адрес — опционально) */
  contact: "+998 90 414 01 84",
};
