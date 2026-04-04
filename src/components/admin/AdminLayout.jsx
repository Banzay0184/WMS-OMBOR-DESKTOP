import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getImageUrl } from "../../config";

/** Инициалы из username (первые две буквы или один символ). */
const getInitials = (username) => {
  if (!username || typeof username !== "string") return "—";
  const parts = username.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  }
  return username.slice(0, 2).toUpperCase();
};

/** Текст роли для отображения в UI (Platform Admin: staff/superuser). */
const getRoleLabel = (user) => {
  if (!user) return "";
  if (user.role) return user.role;
  if (user.is_superuser) return "Суперпользователь";
  if (user.is_staff) return "Платформа (админ)";
  return "Персонал";
};

const AdminLayout = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const initials = getInitials(user?.username);
  const roleLabel = getRoleLabel(user);
  const avatarUrl = getImageUrl(user?.image) ?? null;

  return (
    <div className="min-h-screen bg-secondary">
      <aside
        className="fixed top-0 left-0 w-56 h-screen bg-primary text-white flex flex-col z-10"
        aria-label="Боковая панель навигации"
      >
        <div className="p-4 border-b border-white/20 shrink-0">
          <h2 className="font-semibold text-white" title="Platform Admin">Панель платформы</h2>
        </div>
        <div className="p-4 border-b border-white/20 flex flex-col items-center gap-2">
          <div
            className="w-14 h-14 rounded-full bg-primary-hover flex items-center justify-center text-white font-semibold text-lg shrink-0 overflow-hidden"
            aria-hidden="true"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="w-full min-w-0 text-center">
            <p className="font-medium text-white truncate" title={user?.username ?? ""}>
              {user?.username ?? "—"}
            </p>
            {roleLabel ? (
              <p className="text-xs text-white/80 truncate" title={roleLabel}>
                {roleLabel}
              </p>
            ) : null}
            {user?.phone ? (
              <p className="text-xs text-white/70 truncate mt-0.5" title={user.phone}>
                {user.phone}
              </p>
            ) : null}
          </div>
        </div>
        <nav className="p-2 flex-1 flex flex-col gap-0.5">
          <NavLink
            to="/panel"
            end
            className={({ isActive }) =>
              "block px-3 py-2.5 rounded-lg transition-colors " +
              (isActive
                ? "bg-primary-hover text-white font-medium"
                : "text-white/90 hover:bg-primary-hover")
            }
          >
            Главная
          </NavLink>
          <NavLink
            to="/panel/companies"
            className={({ isActive }) =>
              "block px-3 py-2.5 rounded-lg transition-colors " +
              (isActive
                ? "bg-primary-hover text-white font-medium"
                : "text-white/90 hover:bg-primary-hover")
            }
          >
            Компании
          </NavLink>
          <NavLink
            to="/panel/users"
            className={({ isActive }) =>
              "block px-3 py-2.5 rounded-lg transition-colors " +
              (isActive
                ? "bg-primary-hover text-white font-medium"
                : "text-white/90 hover:bg-primary-hover")
            }
          >
            Глобальные пользователи
          </NavLink>
          <NavLink
            to="/panel/subscriptions"
            className={({ isActive }) =>
              "block px-3 py-2.5 rounded-lg transition-colors " +
              (isActive
                ? "bg-primary-hover text-white font-medium"
                : "text-white/90 hover:bg-primary-hover")
            }
          >
            Подписки
          </NavLink>
          <NavLink
            to="/panel/audit"
            className={({ isActive }) =>
              "block px-3 py-2.5 rounded-lg transition-colors " +
              (isActive
                ? "bg-primary-hover text-white font-medium"
                : "text-white/90 hover:bg-primary-hover")
            }
          >
            Аудит
          </NavLink>
        </nav>
        <div className="p-2 border-t border-white/20 space-y-0.5">
          <NavLink
            to="/panel/settings"
            className={({ isActive }) =>
              "block px-3 py-2.5 rounded-lg transition-colors " +
              (isActive
                ? "bg-primary-hover text-white font-medium"
                : "text-white/90 hover:bg-primary-hover")
            }
            aria-label="Настройки профиля"
          >
            Настройки профиля
          </NavLink>
          <button
            type="button"
            onClick={() => navigate("/select-context")}
            className="w-full text-left px-3 py-2.5 rounded-lg text-white/90 hover:bg-primary-hover transition-colors"
            aria-label="Сменить контекст"
          >
            Сменить контекст
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left px-3 py-2.5 rounded-lg text-white/90 hover:bg-primary-hover transition-colors"
            aria-label="Выйти из аккаунта"
          >
            Выход
          </button>
        </div>
      </aside>
      <main className="ml-56 min-h-screen overflow-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
