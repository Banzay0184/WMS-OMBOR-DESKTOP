import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getImageUrl } from "../config";

const navLinkClass = ({ isActive }) =>
  "block px-3 py-2.5 rounded-lg transition-colors " +
  (isActive
    ? "bg-primary/10 text-primary font-medium"
    : "text-muted hover:bg-secondary hover:text-primary");

const AppLayout = () => {
  const navigate = useNavigate();
  const { user, logout, activeContext, isAppPageForbidden } = useAuth();
  const organizationId = activeContext?.type === "organization" ? activeContext.organizationId : null;

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  const canSeeEmployees = !isAppPageForbidden?.(organizationId, "employees");
  const canSeeRoles = !isAppPageForbidden?.(organizationId, "roles");
  const canSeeWarehouses = !isAppPageForbidden?.(organizationId, "warehouses");
  const canSeeSuppliers = !isAppPageForbidden?.(organizationId, "suppliers");
  const canSeeProducts = !isAppPageForbidden?.(organizationId, "products");
  const canSeeCompanySettings = !isAppPageForbidden?.(organizationId, "company_settings");

  const initials = useMemo(() => {
    const name = user?.username;
    if (!name || typeof name !== "string") return "—";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
    return name.slice(0, 2).toUpperCase();
  }, [user?.username]);

  const avatarUrl = useMemo(() => getImageUrl(user?.image) ?? null, [user?.image]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setIsProfileMenuOpen(false);
    };
    const handlePointerDown = (e) => {
      const el = profileMenuRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setIsProfileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isProfileMenuOpen]);

  return (
    <div className="min-h-screen bg-secondary">
      <aside
        className="fixed top-0 left-0 w-56 h-screen bg-white border-r border-border flex flex-col shadow-soft z-10"
        aria-label="Навигация компании"
      >
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-primary">Рабочая зона</h2>
        </div>
        <nav className="p-2 flex-1 flex flex-col gap-0.5">
          <NavLink to="/app" end className={navLinkClass}>
            Главная
          </NavLink>
          {canSeeEmployees ? (
            <NavLink to="/app/employees" className={navLinkClass}>
              Сотрудники
            </NavLink>
          ) : null}
          {canSeeRoles ? (
            <NavLink to="/app/roles" className={navLinkClass}>
              Роли
            </NavLink>
          ) : null}
          {canSeeWarehouses ? (
            <NavLink to="/app/warehouses" className={navLinkClass}>
              Склады
            </NavLink>
          ) : null}
          {canSeeWarehouses ? (
            <NavLink to="/app/invoices" className={navLinkClass}>
              Счёт‑фактуры
            </NavLink>
          ) : null}
          {canSeeSuppliers ? (
            <NavLink to="/app/suppliers" className={navLinkClass}>
              Поставщики
            </NavLink>
          ) : null}
          {canSeeProducts ? (
            <NavLink to="/app/products" className={navLinkClass}>
              Товары
            </NavLink>
          ) : null}
          {canSeeCompanySettings ? (
            <NavLink to="/app/settings" className={navLinkClass}>
              Настройки компании
            </NavLink>
          ) : null}
        </nav>
      </aside>
      <main className="ml-56 min-h-screen overflow-auto">
        <header
          className="sticky top-0 z-10 flex justify-between items-center px-4 py-3 sm:px-6 bg-white border-b border-border shadow-soft"
          aria-label="Шапка"
        >
          <h1 className="font-logo text-lg font-semibold text-primary truncate">
            WMS — Рабочая зона
          </h1>
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen((prev) => !prev)}
              className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 hover:bg-secondary transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Открыть меню профиля"
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
              tabIndex={0}
            >
              <div
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-muted font-semibold shrink-0 overflow-hidden border border-border"
                aria-hidden="true"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <span className="text-sm text-muted font-medium truncate max-w-[180px]" title={user?.username ?? ""}>
                {user?.username ?? "—"}
              </span>
            </button>

            {isProfileMenuOpen ? (
              <div
                className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-white shadow-soft p-1 z-20"
                role="menu"
                aria-label="Меню профиля"
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    navigate("/app/profile");
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-muted hover:bg-secondary hover:text-primary transition"
                  role="menuitem"
                  aria-label="Открыть профиль"
                >
                  Профиль
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    navigate("/select-context");
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-muted hover:bg-secondary hover:text-primary transition"
                  role="menuitem"
                  aria-label="Сменить контекст"
                >
                  Сменить контекст
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-muted hover:bg-secondary hover:text-primary transition"
                  role="menuitem"
                  aria-label="Выйти"
                >
                  Выход
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
