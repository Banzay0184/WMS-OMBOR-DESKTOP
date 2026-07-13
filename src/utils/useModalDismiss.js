import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Базовая доступность модального окна: Escape закрывает, Tab не выходит за пределы
 * диалога, фокус ставится на первый элемент при открытии и возвращается к триггеру
 * при закрытии. Возвращает ref для контейнера диалога и обработчик клика по фону.
 */
export const useModalDismiss = (onClose, { active = true } = {}) => {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  // onClose часто меняется между рендерами (например, зависит от «грязного» состояния формы),
  // а эффект ниже намеренно не перезапускается при каждом таком изменении — держим актуальную
  // версию колбэка в ref, чтобы обработчик Escape не «застревал» на состоянии момента открытия.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return undefined;
    previousFocusRef.current = document.activeElement;

    const getFocusable = () =>
      dialogRef.current ? Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)) : [];

    const first = getFocusable()[0];
    (first ?? dialogRef.current)?.focus?.();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === "Tab") {
        const items = getFocusable();
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget) onCloseRef.current?.();
  };

  return { dialogRef, onBackdropMouseDown };
};
