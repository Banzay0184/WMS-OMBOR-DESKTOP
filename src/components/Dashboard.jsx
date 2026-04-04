import { useAuth } from "../context/AuthContext";

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-muted">Рабочая зона</h1>
      <p className="text-muted">
        Добро пожаловать{user?.username ? `, ${user.username}` : ""}. Используйте продукт здесь.
      </p>
    </div>
  );
};

export default Dashboard;