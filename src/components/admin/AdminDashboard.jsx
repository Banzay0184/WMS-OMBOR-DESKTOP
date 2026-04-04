import { useAuth } from "../../context/AuthContext";

const AdminDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-muted">Панель управления</h1>
      <p className="text-muted">
        Добро пожаловать{user?.username ? `, ${user.username}` : ""}. Здесь управление процессом и настройки.
      </p>
    </div>
  );
};

export default AdminDashboard;
