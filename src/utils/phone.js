/**
 * Единый формат номера для Узбекистана: +998 XX XXX XX XX.
 * Используется во всех полях ввода телефона в приложении.
 */

const PHONE_PLACEHOLDER = "+998 90 123 45 67";

/**
 * Форматирует введённое значение для отображения в поле телефона.
 * Поддерживает ввод с 8, 998 и международным +.
 * @param {string} value — текущее значение поля
 * @returns {string} — отформатированная строка вида +998 XX XXX XX XX
 */
const formatPhoneDisplay = (value) => {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("998")) {
    const rest = digits.slice(3);
    const parts = [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5, 7), rest.slice(7, 9)];
    return "+998 " + parts.filter(Boolean).join(" ").trim();
  }
  if (digits.startsWith("8") && digits.length <= 10) {
    const rest = digits.slice(1);
    const parts = [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5, 7), rest.slice(7, 9)];
    return "+998 " + parts.filter(Boolean).join(" ").trim();
  }
  if (digits.length <= 12) {
    const parts = [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 8), digits.slice(8, 10), digits.slice(10, 12)];
    return "+" + parts.filter(Boolean).join(" ").trim();
  }
  return "+" + digits.slice(0, 12);
};

/**
 * Извлекает только цифры из номера для отправки на API.
 * @param {string} value — значение поля (может быть с пробелами и +)
 * @returns {string}
 */
const getPhoneDigits = (value) => (value || "").replace(/\D/g, "");

export { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER };
