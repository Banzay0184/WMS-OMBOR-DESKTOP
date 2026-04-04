import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Экран выбора контекста входа (workspace / tenant switcher).
 * Показывается после логина, если у пользователя несколько доступов: платформа и/или несколько компаний.
 * При каждом открытии страницы загружаются актуальные контексты с бэкенда.
 */
const SelectContextPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    isAuthenticated,
    setActiveContext,
    availableContexts,
    contextsLoadError,
    fetchContexts,
    logout,
  } = useAuth();
  const [refreshing, setRefreshing] = useState(true);
  const contextUnavailable = location?.state?.reason === "context_unavailable";

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;
    setRefreshing(true);
    fetchContexts()
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, fetchContexts, navigate]);

  const handleRetryContexts = () => {
    setRefreshing(true);
    fetchContexts().finally(() => setRefreshing(false));
  };

  useEffect(() => {
    if (!availableContexts) return;
    const total = (availableContexts.platform ? 1 : 0) + (availableContexts.organizations?.length ?? 0);
    if (total === 0) return;
    // При total === 1 не редиректим автоматически: показываем одну карточку, переход по клику (иначе «Сменить контекст» выглядит как «ничего не происходит»)
  }, [availableContexts, setActiveContext, navigate]);

  const handleSelectPlatform = () => {
    setActiveContext("platform");
    navigate("/panel", { replace: true });
  };

  const handleSelectOrganization = (org) => {
    setActiveContext("organization", org.id);
    navigate("/app", { replace: true });
  };

  if (refreshing || !availableContexts) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center p-4">
        <p className="text-muted">Загрузка…</p>
      </div>
    );
  }

  const hasPlatform = availableContexts.platform === true;
  const organizations = availableContexts.organizations ?? [];
  const total = (hasPlatform ? 1 : 0) + organizations.length;

  if (total === 0) {
    return (
      <div className="min-h-screen bg-secondary flex flex-col items-center justify-center p-4 max-w-md mx-auto text-center">
        {contextsLoadError ? (
          <div
            className="w-full rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning mb-4"
            role="alert"
            aria-label="Ошибка загрузки контекстов"
          >
            Не удалось получить контексты доступа с сервера. Проверьте соединение и попробуйте снова.
          </div>
        ) : null}
        <h1 className="text-xl font-semibold text-muted mb-2">Нет доступных контекстов</h1>
        <p className="text-muted text-sm mb-2">
          У вас нет активных компаний, либо подписка или статус компании не позволяют вход в систему.
        </p>
        <p className="text-muted text-sm mb-6">
          Обратитесь к администратору платформы, чтобы получить доступ к компании или продлить подписку.
        </p>
        <div className="flex items-center justify-center gap-3">
          {contextsLoadError ? (
            <button
              type="button"
              onClick={handleRetryContexts}
              className="px-4 py-2.5 rounded-lg border border-primary text-primary hover:bg-white transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Повторить загрузку контекстов"
            >
              Повторить
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/", { replace: true });
            }}
            className="px-4 py-2.5 rounded-lg border border-border text-muted hover:bg-white hover:border-primary hover:text-primary transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label="Выйти и вернуться на страницу входа"
          >
            Выйти
          </button>
        </div>
      </div>
    );
  }
  if (total === 1) {
    return (
      <div className="min-h-screen bg-secondary flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-muted">Выберите, куда войти</h1>
            {user?.username && (
              <p className="text-muted text-sm mt-1">{user.username}</p>
            )}
          </div>
          {contextUnavailable ? (
            <div
              className="rounded-xl border border-border bg-white p-3 text-sm text-muted"
              role="status"
              aria-label="Контекст недоступен"
            >
              Выбранная компания сейчас недоступна. Возможно, подписка истекла или доступ был отозван.
            </div>
          ) : null}
          <div className="space-y-3">
            {hasPlatform && (
              <button
                type="button"
                onClick={handleSelectPlatform}
                className="w-full flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-white shadow-soft text-left hover:border-primary hover:bg-secondary/50 transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <span className="font-medium text-muted">Панель разработчика</span>
                <span className="text-muted text-sm">Платформа</span>
              </button>
            )}
            {organizations.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => handleSelectOrganization(org)}
                className="w-full flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-white shadow-soft text-left hover:border-primary hover:bg-secondary/50 transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <span className="font-medium text-muted">{org.name || `Компания #${org.id}`}</span>
                {org.role_name ? (
                  <span className="text-muted text-sm">{org.role_name}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-muted">
            Выберите, куда войти
          </h1>
          {user?.username && (
            <p className="text-muted text-sm mt-1">
              {user.username}
            </p>
          )}
        </div>
        {contextUnavailable ? (
          <div
            className="rounded-xl border border-border bg-white p-3 text-sm text-muted"
            role="status"
            aria-label="Контекст недоступен"
          >
            Выбранная компания сейчас недоступна. Возможно, подписка истекла или доступ был отозван.
          </div>
        ) : null}

        <div className="space-y-3">
          {hasPlatform && (
            <button
              type="button"
              onClick={handleSelectPlatform}
              className="w-full flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-white shadow-soft text-left hover:border-primary hover:bg-secondary/50 transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <span className="font-medium text-muted">Панель разработчика</span>
              <span className="text-muted text-sm">Платформа</span>
            </button>
          )}
          {organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => handleSelectOrganization(org)}
              className="w-full flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-white shadow-soft text-left hover:border-primary hover:bg-secondary/50 transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <span className="font-medium text-muted">
                {org.name || `Компания #${org.id}`}
              </span>
              {org.role_name ? (
                <span className="text-muted text-sm">{org.role_name}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SelectContextPage;
