import { Component } from "react";
import { reportError } from "../utils/errorReporting";

/**
 * Ловит ошибки рендера React-дерева (componentDidCatch) — иначе такие ошибки
 * дают белый экран без следа в журнале. Автоматически репортит в Error Log.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    reportError({
      message: error?.message || String(error),
      stackTrace: `${error?.stack || ""}\n${errorInfo?.componentStack || ""}`,
      module: "ReactErrorBoundary",
      level: "critical",
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-secondary px-4">
          <div className="max-w-md w-full bg-white rounded-xl border border-border shadow-sm p-6 text-center space-y-4">
            <h1 className="text-lg font-semibold text-muted">Что-то пошло не так</h1>
            <p className="text-sm text-muted/75">
              Произошла непредвиденная ошибка. Мы уже получили отчёт об этом. Попробуйте перезагрузить страницу.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition"
            >
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
